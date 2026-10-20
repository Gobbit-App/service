import { LRUCache } from 'lru-cache';
import {
  LINK_PREVIEW_CACHE_MAX,
  LINK_PREVIEW_CACHE_TTL_MS,
  LINK_PREVIEW_DESCRIPTION_MAX,
  LINK_PREVIEW_IMAGE_URL_MAX,
  LINK_PREVIEW_RATE_PER_HOUR,
  LINK_PREVIEW_TITLE_MAX,
  type LinkPreview,
} from '@pb/shared';
import { authorize, type MembershipLookup } from '../access/authorize';
import type { ExtractedPage } from '../fetch/extract-page';
import type { SafeFetch } from '../fetch/safe-fetch';
import { rateKeys } from '../lib/rate-window';
import { resolveDeck } from '../lib/resolve-deck';
import type { CurrentUser } from '../types';
import type { DeckLookup } from './media.service';
import type { RateLimitService } from './rate-limit.service';

/** One line, at most `max` code points (never splits a surrogate pair). */
function clip(value: string | null | undefined, max: number): string | undefined {
  const line = value?.replace(/\s+/g, ' ').trim();
  if (!line) return undefined;
  const points = Array.from(line);
  return points.length > max ? points.slice(0, max).join('').trimEnd() : line;
}

function httpImage(value: string | null | undefined): string | undefined {
  if (!value || value.length > LINK_PREVIEW_IMAGE_URL_MAX) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : undefined;
  } catch {
    return undefined;
  }
}

/**
 * D134: OG title (else `<title>`), OG description and an absolute http(s) OG image, capped to
 * the preview limits. `siteName` is not part of the link payload, so it is dropped. Null when
 * there is nothing to show.
 */
export function toLinkPreview(page: Pick<ExtractedPage, 'title' | 'og'>): LinkPreview | null {
  const preview: LinkPreview = {};
  const title = clip(page.og.title ?? page.title, LINK_PREVIEW_TITLE_MAX);
  const description = clip(page.og.description, LINK_PREVIEW_DESCRIPTION_MAX);
  const image = httpImage(page.og.image);
  if (title) preview.title = title;
  if (description) preview.description = description;
  if (image) preview.image = image;
  return Object.keys(preview).length > 0 ? preview : null;
}

/** Cache key: the parsed URL, so trivially different spellings share an entry. */
function cacheKey(url: string): string {
  try {
    return new URL(url).href;
  } catch {
    return url;
  }
}

export function createLinkPreviewService(deps: {
  decks: DeckLookup;
  memberships: MembershipLookup;
  rateLimits: Pick<RateLimitService, 'enforce'>;
  /** The only outbound path (ADR-048); tests inject one that allows a local fixture server. */
  safeFetch: SafeFetch;
  extract: (html: string, url: string) => Pick<ExtractedPage, 'title' | 'og'>;
  cacheMax?: number;
  ttlMs?: number;
  log?: (message: string) => void;
}) {
  const { decks, memberships, rateLimits, safeFetch, extract } = deps;
  const log = deps.log ?? ((message: string) => console.error(message));
  // Wrapped, because lru-cache can't hold null and failures are cached too.
  const cache = new LRUCache<string, { preview: LinkPreview | null }>({
    max: deps.cacheMax ?? LINK_PREVIEW_CACHE_MAX,
    ttl: deps.ttlMs ?? LINK_PREVIEW_CACHE_TTL_MS,
  });

  async function fetchPreview(url: string): Promise<LinkPreview | null> {
    const result = await safeFetch(url);
    if (result.error || result.html === null) {
      log(`[link-preview] no preview: ${result.error ?? 'empty'}`);
      return null;
    }
    const preview = toLinkPreview(extract(result.html, result.finalUrl ?? url));
    if (!preview) log('[link-preview] no preview: nothing to show');
    return preview;
  }

  return {
    /** Never throws for fetch failures: those answer `null`, and the reason is only logged. */
    async lookup(input: {
      user: CurrentUser;
      deckId: string;
      url: string;
    }): Promise<LinkPreview | null> {
      const deck = await resolveDeck(decks, input.deckId, input.user);
      await authorize(input.user, deck, 'item.create', memberships);
      await rateLimits.enforce(rateKeys.linkPreviewUser(input.user.id), LINK_PREVIEW_RATE_PER_HOUR);

      const key = cacheKey(input.url);
      const hit = cache.get(key);
      if (hit) return hit.preview;

      let preview: LinkPreview | null;
      try {
        preview = await fetchPreview(input.url);
      } catch (err) {
        log(`[link-preview] no preview: ${err instanceof Error ? err.message : String(err)}`);
        preview = null;
      }
      cache.set(key, { preview });
      return preview;
    },
  };
}

export type LinkPreviewService = ReturnType<typeof createLinkPreviewService>;
