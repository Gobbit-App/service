import { LRUCache } from 'lru-cache';
import {
  LINK_PREVIEW_CACHE_MAX,
  LINK_PREVIEW_CACHE_TTL_MS,
  LINK_PREVIEW_RATE_PER_HOUR,
  type LinkPreview,
} from '@gobbit/shared';
import { authorize, type MembershipLookup } from '../access/authorize';
import type { ExtractedPage } from '../fetch/extract-page';
import { fetchLinkPreview } from '../fetch/link-preview';
import type { SafeFetch } from '../fetch/safe-fetch';
import { rateKeys } from '../lib/rate-window';
import { resolveDeck } from '../lib/resolve-deck';
import type { CurrentUser } from '../types';
import type { DeckLookup } from './media.service';
import type { RateLimitService } from './rate-limit.service';
import { lineSink } from '../lib/logger';

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
  const log = deps.log ?? lineSink('link-preview', 'warn');
  // Wrapped, because lru-cache can't hold null and failures are cached too.
  const cache = new LRUCache<string, { preview: LinkPreview | null }>({
    max: deps.cacheMax ?? LINK_PREVIEW_CACHE_MAX,
    ttl: deps.ttlMs ?? LINK_PREVIEW_CACHE_TTL_MS,
  });

  function fetchUncached(url: string): Promise<LinkPreview | null> {
    return fetchLinkPreview({ safeFetch, extract, log }, url);
  }

  /** Through the shared cache; never throws (failures answer `null` and are cached too). */
  async function fetchPreview(url: string): Promise<LinkPreview | null> {
    const key = cacheKey(url);
    const hit = cache.get(key);
    if (hit) return hit.preview;

    let preview: LinkPreview | null;
    try {
      preview = await fetchUncached(url);
    } catch (err) {
      log(`[link-preview] no preview: ${err instanceof Error ? err.message : String(err)}`);
      preview = null;
    }
    cache.set(key, { preview });
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

      return await fetchPreview(input.url);
    },

    /**
     * D163: the lookup core for the `link-snapshot` job: no access check and no per-user rate
     * limit (the job is not a user request), same cache and outbound path.
     */
    fetchPreview,
  };
}

export type LinkPreviewService = ReturnType<typeof createLinkPreviewService>;
