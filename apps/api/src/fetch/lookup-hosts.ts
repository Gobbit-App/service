import { z } from 'zod';
import { LINK_PREVIEW_TITLE_MAX } from '@gobbit/shared';
import type { Logger } from '../lib/logger';
import { clipLine } from './link-preview';
import { resolveImageUrl } from './page-images';
import { PREVIEW_EVENTS, previewHost, type LookupReason } from './preview-events';
import type { SafeJsonFetch } from './safe-fetch';

/** D345: a host that shares a title and thumbnail through a key-free oEmbed endpoint. */
export interface LookupHost {
  label: string;
  hosts: readonly string[];
  endpoint(url: string): string;
}

/**
 * D345 (FR-007, FR-008): the one list of lookup hosts. Instagram and Facebook oEmbed need an app
 * token, so they are not here.
 */
export const LOOKUP_HOSTS: readonly LookupHost[] = [
  {
    label: 'YouTube',
    hosts: ['youtube.com', 'youtu.be'],
    endpoint: (url) => `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(url)}`,
  },
  {
    label: 'TikTok',
    hosts: ['tiktok.com'],
    endpoint: (url) => `https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`,
  },
  {
    label: 'Vimeo',
    hosts: ['vimeo.com'],
    endpoint: (url) => `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(url)}`,
  },
];

/** The lookup host of an http(s) URL: the host itself or a subdomain on a dot boundary. */
export function lookupHostOf(url: string): LookupHost | null {
  let hostname: string;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    hostname = parsed.hostname.toLowerCase();
  } catch {
    return null;
  }
  return (
    LOOKUP_HOSTS.find((entry) =>
      entry.hosts.some((h) => hostname === h || hostname.endsWith(`.${h}`)),
    ) ?? null
  );
}

export type LookupResult =
  | { outcome: 'ok'; title?: string; image?: string }
  | { outcome: 'empty' }
  | { outcome: 'failed'; reason: LookupReason };

const oembedSchema = z.object({
  title: z.string().optional().catch(undefined),
  thumbnail_url: z.string().optional().catch(undefined),
});

function failureReason(error: string): LookupReason {
  if (error === 'timeout' || error === 'blocked') return error;
  if (error === 'not_json' || error === 'invalid_json' || error === 'too_large') return 'invalid';
  return 'http_error';
}

/** Reads an oEmbed answer; anything without a usable title or thumbnail is `empty`. */
export function parseLookupAnswer(json: unknown): LookupResult {
  const parsed = oembedSchema.safeParse(json);
  if (!parsed.success) return { outcome: 'empty' };
  const title = clipLine(parsed.data.title, LINK_PREVIEW_TITLE_MAX);
  const thumbnail = parsed.data.thumbnail_url;
  const image =
    thumbnail && /^https?:\/\//i.test(thumbnail) ? resolveImageUrl(thumbnail, thumbnail) : null;
  if (!title && !image) return { outcome: 'empty' };
  return { outcome: 'ok', ...(title ? { title } : {}), ...(image ? { image } : {}) };
}

/**
 * D345: one oEmbed lookup for `url`, through the guarded JSON fetch. Logs `link_preview.lookup`
 * with the host; never throws.
 */
export async function lookupPreview(
  deps: { fetchJson: SafeJsonFetch; log?: Pick<Logger, 'info' | 'warn'> },
  host: LookupHost,
  url: string,
): Promise<LookupResult> {
  const started = Date.now();
  let result: LookupResult;
  try {
    const answer = await deps.fetchJson(host.endpoint(url));
    result = answer.error
      ? { outcome: 'failed', reason: failureReason(answer.error) }
      : parseLookupAnswer(answer.json);
  } catch {
    result = { outcome: 'failed', reason: 'http_error' };
  }
  const fields = {
    event: PREVIEW_EVENTS.lookup,
    outcome: result.outcome,
    ...(result.outcome === 'failed' ? { reason: result.reason } : {}),
    host: previewHost(url),
    ms: Date.now() - started,
  };
  if (result.outcome === 'failed') deps.log?.warn(fields, 'link preview host lookup');
  else deps.log?.info(fields, 'link preview host lookup');
  return result;
}
