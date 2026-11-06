import { isIP } from 'node:net';
import { Agent, request, type Dispatcher } from 'undici';
import {
  FETCH_MAX_BYTES,
  FETCH_MAX_REDIRECTS,
  FETCH_TIMEOUT_MS,
  LINK_LOOKUP_MAX_BYTES,
  LINK_LOOKUP_TIMEOUT_MS,
  MEDIA_IMAGE_MAX_BYTES,
  MEDIA_IMAGE_MIMES,
} from '@gobbit/shared';
import {
  BlockedAddressError,
  createGuardedLookup,
  isBlockedAddress,
  type LookupAll,
} from './ip-guard';
import { sniffImage, type SniffedImage } from './image-sniff';
import { userAgentFor, type FetchIdentity } from './user-agents';

/** What a guarded fetch produced; never throws (D102). */
export interface SafeFetchResult {
  status: number | null;
  finalUrl: string | null;
  ms: number;
  /** Decoded HTML (possibly truncated at the byte cap), or null when unusable. */
  html: string | null;
  /** `blocked`, `timeout`, `not_html`, `too_many_redirects`, `http_<status>` or `fetch_failed: …`. */
  error: string | null;
}

export type SafeFetch = (url: string) => Promise<SafeFetchResult>;

export interface SafeFetchOptions {
  lookupAll?: LookupAll;
  isBlocked?: (ip: string) => boolean;
  /** `null` allows any port (tests against a local server); default 80/443. */
  allowedPorts?: ReadonlySet<number> | null;
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
  now?: () => number;
  /**
   * `html` (default): a non-HTML answer is the `not_html` error. `any` (link checks, D164): a
   * non-HTML 2xx is a success with `html: null` and its body is not read.
   */
  accept?: 'html' | 'any';
  /** D343: `crawler` (default) for previews, lookups and images; `browser` for link checks. */
  identity?: FetchIdentity;
}

/** What a guarded image download produced (D159); never throws. */
export interface SafeImageFetchResult {
  status: number | null;
  finalUrl: string | null;
  ms: number;
  /** The whole image, or null when unusable. */
  bytes: Uint8Array | null;
  /** The MIME the magic bytes prove (`image/jpeg`, …), never the server's claim alone. */
  contentType: string | null;
  /** The HTML-mode errors (except `not_html`) plus `not_image` and `too_large`. */
  error: string | null;
}

export type SafeImageFetch = (url: string) => Promise<SafeImageFetchResult>;

const DEFAULT_PORTS: ReadonlySet<number> = new Set([80, 443]);
const HTML_TYPES = ['text/html', 'application/xhtml+xml'];
const HTML_ACCEPT = 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.1';
const ACCEPT_LANGUAGE = 'en,he;q=0.8,*;q=0.5';
const REDIRECTS = new Set([301, 302, 303, 307, 308]);

const SNIFFED_MIME: Record<SniffedImage, string> = {
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  heic: 'image/heic',
};

class FetchRefused extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

function effectivePort(u: URL): number {
  if (u.port) return Number(u.port);
  return u.protocol === 'https:' ? 443 : 80;
}

/** Rejects non-http(s), disallowed ports and blocked IP literals (lookup isn't called for those). */
function checkTarget(
  u: URL,
  ports: ReadonlySet<number> | null,
  isBlocked: (ip: string) => boolean,
): void {
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new FetchRefused('blocked');
  if (u.username || u.password) throw new FetchRefused('blocked');
  if (ports && !ports.has(effectivePort(u))) throw new FetchRefused('blocked');
  const host = u.hostname.replace(/^\[|\]$/g, '');
  if (isIP(host) !== 0 && isBlocked(host)) throw new FetchRefused('blocked');
}

function charsetOf(contentType: string): string {
  const m = /charset\s*=\s*"?([\w-]+)"?/i.exec(contentType);
  return m?.[1]?.toLowerCase() ?? 'utf-8';
}

function decode(bytes: Uint8Array, charset: string): string {
  try {
    return new TextDecoder(charset).decode(bytes);
  } catch {
    return new TextDecoder('utf-8').decode(bytes);
  }
}

type Body = Dispatcher.ResponseData['body'];

/** Drops a body we won't read; undici reports the abort as an error we don't care about. */
function discard(body: Body): void {
  body.on('error', () => undefined);
  body.destroy();
}

/** Reads at most `maxBytes`, then stops (the head with OG tags is what matters most). */
async function readCapped(body: Body, maxBytes: number) {
  const chunks: Uint8Array[] = [];
  let size = 0;
  for await (const chunk of body as AsyncIterable<Uint8Array>) {
    const room = maxBytes - size;
    if (chunk.byteLength >= room) {
      chunks.push(chunk.subarray(0, room));
      size += room;
      discard(body);
      break;
    }
    chunks.push(chunk);
    size += chunk.byteLength;
  }
  return concat(chunks, size);
}

/** Reads the whole body, refusing it once it passes `maxBytes` (an image can't be truncated). */
async function readWhole(body: Body, maxBytes: number) {
  const chunks: Uint8Array[] = [];
  let size = 0;
  for await (const chunk of body as AsyncIterable<Uint8Array>) {
    size += chunk.byteLength;
    if (size > maxBytes) {
      discard(body);
      throw new FetchRefused('too_large');
    }
    chunks.push(chunk);
  }
  return concat(chunks, size);
}

function concat(chunks: Uint8Array[], size: number): Uint8Array {
  const out = new Uint8Array(size);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out;
}

function headerOf(res: Dispatcher.ResponseData, name: string): string {
  const h = res.headers[name];
  return (Array.isArray(h) ? h[0] : h) ?? '';
}

function isBlockedError(err: unknown): boolean {
  for (let e: unknown = err; e; e = (e as { cause?: unknown }).cause) {
    if (e instanceof BlockedAddressError) return true;
    if (e instanceof Error && e.name === 'BlockedAddressError') return true;
  }
  return false;
}

function classify(err: unknown, signal: AbortSignal): string {
  if (err instanceof FetchRefused) return err.code;
  if (isBlockedError(err)) return 'blocked';
  if (signal.aborted) return 'timeout';
  const msg = err instanceof Error ? err.message : String(err);
  return `fetch_failed: ${msg.slice(0, 200)}`;
}

interface GuardedContext {
  readonly signal: AbortSignal;
  current: URL | null;
  status: number | null;
}

interface GuardedClient {
  /** Follows redirects through the guard; the 2xx response or a terminal error code. */
  get(
    url: string,
    accept: string,
    ctx: GuardedContext,
  ): Promise<Dispatcher.ResponseData | { error: string }>;
  start(): { started: number; ctx: GuardedContext };
  elapsed(started: number): number;
}

/**
 * D102: the only outbound fetch of user-supplied URLs. Every hop is re-checked: scheme, port,
 * IP literal, and (through the Agent's lookup) every resolved address.
 */
function createGuardedClient(opts: SafeFetchOptions): GuardedClient {
  const isBlocked = opts.isBlocked ?? isBlockedAddress;
  const ports = opts.allowedPorts === undefined ? DEFAULT_PORTS : opts.allowedPorts;
  const timeoutMs = opts.timeoutMs ?? FETCH_TIMEOUT_MS;
  const maxRedirects = opts.maxRedirects ?? FETCH_MAX_REDIRECTS;
  const now = opts.now ?? Date.now;
  const userAgent = userAgentFor(opts.identity);
  const dispatcher = new Agent({
    connect: { lookup: createGuardedLookup({ lookupAll: opts.lookupAll, isBlocked }) },
  });

  return {
    start: () => ({
      started: now(),
      ctx: { signal: AbortSignal.timeout(timeoutMs), current: null, status: null },
    }),
    elapsed: (started) => Math.max(0, Math.round(now() - started)),
    async get(url, accept, ctx) {
      ctx.current = new URL(url);
      for (let hop = 0; ; hop++) {
        checkTarget(ctx.current, ports, isBlocked);
        const res: Dispatcher.ResponseData = await request(ctx.current, {
          dispatcher,
          method: 'GET',
          signal: ctx.signal,
          headers: { 'user-agent': userAgent, accept, 'accept-language': ACCEPT_LANGUAGE },
        });
        ctx.status = res.statusCode;

        if (REDIRECTS.has(res.statusCode)) {
          discard(res.body);
          const target = headerOf(res, 'location');
          if (!target) return { error: `http_${res.statusCode}` };
          if (hop >= maxRedirects) return { error: 'too_many_redirects' };
          ctx.current = new URL(target, ctx.current);
          continue;
        }

        if (res.statusCode < 200 || res.statusCode >= 300) {
          discard(res.body);
          return { error: `http_${res.statusCode}` };
        }
        return res;
      }
    },
  };
}

/** HTML pages for link previews and ingest (D102), or any 2xx answer for link checks (D164). */
export function createSafeFetch(opts: SafeFetchOptions = {}): SafeFetch {
  const client = createGuardedClient(opts);
  const maxBytes = opts.maxBytes ?? FETCH_MAX_BYTES;
  const acceptAny = opts.accept === 'any';

  return async function safeFetch(url: string): Promise<SafeFetchResult> {
    const { started, ctx } = client.start();
    const done = (html: string | null, error: string | null): SafeFetchResult => ({
      status: ctx.status,
      finalUrl: ctx.current?.toString() ?? null,
      ms: client.elapsed(started),
      html,
      error,
    });

    try {
      const res = await client.get(url, HTML_ACCEPT, ctx);
      if ('error' in res) return done(null, res.error);
      const contentType = headerOf(res, 'content-type');
      if (!HTML_TYPES.some((t) => contentType.toLowerCase().startsWith(t))) {
        discard(res.body);
        return done(null, acceptAny ? null : 'not_html');
      }
      const bytes = await readCapped(res.body, maxBytes);
      return done(decode(bytes, charsetOf(contentType)), null);
    } catch (err) {
      return done(null, classify(err, ctx.signal));
    }
  };
}

/**
 * D159: image downloads. The declared type must be an allowed image MIME, the body must fit
 * `maxBytes` whole (default `MEDIA_IMAGE_MAX_BYTES`) and its magic bytes must prove the format.
 */
export function createSafeImageFetch(opts: SafeFetchOptions = {}): SafeImageFetch {
  const client = createGuardedClient(opts);
  const maxBytes = opts.maxBytes ?? MEDIA_IMAGE_MAX_BYTES;
  const allowed: readonly string[] = MEDIA_IMAGE_MIMES;
  const accept = `${allowed.join(',')};q=0.9,image/*;q=0.5`;

  return async function safeImageFetch(url: string): Promise<SafeImageFetchResult> {
    const { started, ctx } = client.start();
    const done = (
      image: { bytes: Uint8Array; contentType: string } | null,
      error: string | null,
    ): SafeImageFetchResult => ({
      status: ctx.status,
      finalUrl: ctx.current?.toString() ?? null,
      ms: client.elapsed(started),
      bytes: image?.bytes ?? null,
      contentType: image?.contentType ?? null,
      error,
    });

    try {
      const res = await client.get(url, accept, ctx);
      if ('error' in res) return done(null, res.error);
      const declared = headerOf(res, 'content-type').split(';')[0]?.trim().toLowerCase() ?? '';
      if (!allowed.includes(declared)) {
        discard(res.body);
        return done(null, 'not_image');
      }
      const length = Number(headerOf(res, 'content-length'));
      if (Number.isFinite(length) && length > maxBytes) {
        discard(res.body);
        return done(null, 'too_large');
      }
      const bytes = await readWhole(res.body, maxBytes);
      const sniffed = sniffImage(bytes);
      if (!sniffed) return done(null, 'not_image');
      return done({ bytes, contentType: SNIFFED_MIME[sniffed] }, null);
    } catch (err) {
      return done(null, classify(err, ctx.signal));
    }
  };
}

/** What a guarded JSON lookup produced (D345); never throws. */
export interface SafeJsonFetchResult {
  status: number | null;
  ms: number;
  /** The parsed body, or null when unusable. */
  json: unknown;
  /** The HTML-mode errors (except `not_html`) plus `not_json` and `invalid_json`. */
  error: string | null;
}

export type SafeJsonFetch = (url: string) => Promise<SafeJsonFetchResult>;

const JSON_ACCEPT = 'application/json;q=1,text/javascript;q=0.5';

function isJsonType(contentType: string): boolean {
  const type = contentType.split(';')[0]?.trim().toLowerCase() ?? '';
  return type === 'application/json' || type.endsWith('+json') || type === 'text/javascript';
}

/**
 * D345: host lookups (oEmbed). Same guard as page fetches; a JSON answer read up to `maxBytes`
 * (default `LINK_LOOKUP_MAX_BYTES`) within `timeoutMs` (default `LINK_LOOKUP_TIMEOUT_MS`).
 */
export function createSafeJsonFetch(opts: SafeFetchOptions = {}): SafeJsonFetch {
  const client = createGuardedClient({
    ...opts,
    timeoutMs: opts.timeoutMs ?? LINK_LOOKUP_TIMEOUT_MS,
  });
  const maxBytes = opts.maxBytes ?? LINK_LOOKUP_MAX_BYTES;

  return async function safeJsonFetch(url: string): Promise<SafeJsonFetchResult> {
    const { started, ctx } = client.start();
    const done = (json: unknown, error: string | null): SafeJsonFetchResult => ({
      status: ctx.status,
      ms: client.elapsed(started),
      json,
      error,
    });

    try {
      const res = await client.get(url, JSON_ACCEPT, ctx);
      if ('error' in res) return done(null, res.error);
      const contentType = headerOf(res, 'content-type');
      if (!isJsonType(contentType)) {
        discard(res.body);
        return done(null, 'not_json');
      }
      const bytes = await readWhole(res.body, maxBytes);
      try {
        return done(JSON.parse(decode(bytes, charsetOf(contentType))) as unknown, null);
      } catch {
        return done(null, 'invalid_json');
      }
    } catch (err) {
      return done(null, classify(err, ctx.signal));
    }
  };
}

/** What a guarded push POST produced (D296); never throws. */
export interface SafePushResult {
  /** The push service's status, or null when no answer came back. */
  status: number | null;
  ms: number;
  /** `blocked`, `host_not_allowed`, `timeout`, `fetch_failed: …`; null when a status came back. */
  error: string | null;
}

/** The request `web-push` builds (method, endpoint, headers, encrypted body). */
export interface PushRequest {
  method: string;
  endpoint: string;
  headers: Record<string, string>;
  body: Uint8Array | null;
}

export type SafePush = (req: PushRequest) => Promise<SafePushResult>;

/** D296: the push timeout; a push service that slow is retried later. */
export const PUSH_TIMEOUT_MS = 10_000;

const PUSH_PORTS: ReadonlySet<number> = new Set([443]);

/**
 * D296: the only way a Web Push message leaves the server. POST to an allow-listed push host over
 * https:443, with the IP guard on every resolved address, no redirects and a short timeout.
 */
export function createSafePush(
  opts: Pick<SafeFetchOptions, 'lookupAll' | 'isBlocked' | 'allowedPorts' | 'timeoutMs' | 'now'> & {
    isAllowedHost: (url: URL) => boolean;
  },
): SafePush {
  const isBlocked = opts.isBlocked ?? isBlockedAddress;
  const ports = opts.allowedPorts === undefined ? PUSH_PORTS : opts.allowedPorts;
  const timeoutMs = opts.timeoutMs ?? PUSH_TIMEOUT_MS;
  const now = opts.now ?? Date.now;
  const dispatcher = new Agent({
    connect: { lookup: createGuardedLookup({ lookupAll: opts.lookupAll, isBlocked }) },
  });

  return async function safePush(req: PushRequest): Promise<SafePushResult> {
    const started = now();
    const signal = AbortSignal.timeout(timeoutMs);
    const done = (status: number | null, error: string | null): SafePushResult => ({
      status,
      ms: Math.max(0, Math.round(now() - started)),
      error,
    });
    try {
      const url = new URL(req.endpoint);
      if (!opts.isAllowedHost(url)) return done(null, 'host_not_allowed');
      checkTarget(url, ports, isBlocked);
      // undici's `request` never follows redirects: a 3xx is just a status here.
      const res = await request(url, {
        dispatcher,
        method: 'POST',
        signal,
        headers: req.headers,
        body: req.body ?? undefined,
      });
      discard(res.body);
      return done(res.statusCode, null);
    } catch (err) {
      return done(null, classify(err, signal));
    }
  };
}
