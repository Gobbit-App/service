import { isIP } from 'node:net';
import { Agent, request, type Dispatcher } from 'undici';
import { FETCH_MAX_BYTES, FETCH_MAX_REDIRECTS, FETCH_TIMEOUT_MS } from '@pb/shared';
import {
  BlockedAddressError,
  createGuardedLookup,
  isBlockedAddress,
  type LookupAll,
} from './ip-guard';

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
}

const DEFAULT_PORTS: ReadonlySet<number> = new Set([80, 443]);
const HTML_TYPES = ['text/html', 'application/xhtml+xml'];
const REDIRECTS = new Set([301, 302, 303, 307, 308]);
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36 Gobbit/1.0';

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
  const out = new Uint8Array(size);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out;
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

/**
 * D102: the only outbound fetch of user-supplied URLs. Every hop is re-checked: scheme, port,
 * IP literal, and (through the Agent's lookup) every resolved address.
 */
export function createSafeFetch(opts: SafeFetchOptions = {}): SafeFetch {
  const isBlocked = opts.isBlocked ?? isBlockedAddress;
  const ports = opts.allowedPorts === undefined ? DEFAULT_PORTS : opts.allowedPorts;
  const timeoutMs = opts.timeoutMs ?? FETCH_TIMEOUT_MS;
  const maxBytes = opts.maxBytes ?? FETCH_MAX_BYTES;
  const maxRedirects = opts.maxRedirects ?? FETCH_MAX_REDIRECTS;
  const now = opts.now ?? Date.now;
  const dispatcher = new Agent({
    connect: { lookup: createGuardedLookup({ lookupAll: opts.lookupAll, isBlocked }) },
  });

  return async function safeFetch(url: string): Promise<SafeFetchResult> {
    const started = now();
    const signal = AbortSignal.timeout(timeoutMs);
    let current: URL | null = null;
    let status: number | null = null;
    const done = (html: string | null, error: string | null): SafeFetchResult => ({
      status,
      finalUrl: current?.toString() ?? null,
      ms: Math.max(0, Math.round(now() - started)),
      html,
      error,
    });

    try {
      current = new URL(url);
      for (let hop = 0; ; hop++) {
        checkTarget(current, ports, isBlocked);
        const res: Dispatcher.ResponseData = await request(current, {
          dispatcher,
          method: 'GET',
          signal,
          headers: {
            'user-agent': USER_AGENT,
            accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.1',
            'accept-language': 'en,he;q=0.8,*;q=0.5',
          },
        });
        status = res.statusCode;

        if (REDIRECTS.has(res.statusCode)) {
          discard(res.body);
          const location: string | string[] | undefined = res.headers.location;
          const target: string | undefined = Array.isArray(location) ? location[0] : location;
          if (!target) return done(null, `http_${res.statusCode}`);
          if (hop >= maxRedirects) return done(null, 'too_many_redirects');
          current = new URL(target, current);
          continue;
        }

        if (res.statusCode < 200 || res.statusCode >= 300) {
          discard(res.body);
          return done(null, `http_${res.statusCode}`);
        }

        const header = res.headers['content-type'];
        const contentType = (Array.isArray(header) ? header[0] : header) ?? '';
        if (!HTML_TYPES.some((t) => contentType.toLowerCase().startsWith(t))) {
          discard(res.body);
          return done(null, 'not_html');
        }
        const bytes = await readCapped(res.body, maxBytes);
        return done(decode(bytes, charsetOf(contentType)), null);
      }
    } catch (err) {
      return done(null, classify(err, signal));
    }
  };
}
