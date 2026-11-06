import { LRUCache } from 'lru-cache';
import {
  LINK_PREVIEW_CACHE_MAX,
  LINK_PREVIEW_CACHE_TTL_MS,
  LINK_PREVIEW_RATE_PER_HOUR,
  LINK_ARTICLE_IMAGE_MIN_PX,
  type LinkPreview,
} from '@gobbit/shared';
import { authorize, type MembershipLookup } from '../access/authorize';
import { buildLinkPreview, logPreviewBuilt, type BuildDeps } from '../fetch/build-preview';
import type { SafeFetch, SafeJsonFetch } from '../fetch/safe-fetch';
import { rateKeys } from '../lib/rate-window';
import { resolveDeck } from '../lib/resolve-deck';
import type { CurrentUser } from '../types';
import type { DeckLookup } from './media.service';
import type { RateLimitService } from './rate-limit.service';
import { childLogger, type Logger } from '../lib/logger';

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
  /** D345 host lookups; null turns them off. */
  fetchJson?: SafeJsonFetch | null;
  extract: BuildDeps['extract'];
  articleMinPx?: number;
  cacheMax?: number;
  ttlMs?: number;
  log?: Pick<Logger, 'info' | 'warn'>;
}) {
  const { decks, memberships, rateLimits } = deps;
  const log = deps.log ?? childLogger('link-preview');
  const buildDeps: BuildDeps = {
    safeFetch: deps.safeFetch,
    fetchJson: deps.fetchJson ?? null,
    extract: deps.extract,
    articleMinPx: deps.articleMinPx ?? LINK_ARTICLE_IMAGE_MIN_PX,
  };
  // Wrapped, because lru-cache can't hold null and failures are cached too.
  const cache = new LRUCache<string, { preview: LinkPreview | null }>({
    max: deps.cacheMax ?? LINK_PREVIEW_CACHE_MAX,
    ttl: deps.ttlMs ?? LINK_PREVIEW_CACHE_TTL_MS,
  });

  /**
   * D346: through the shared cache; never throws (failures answer `null` and are cached too).
   * A fresh build logs `link_preview.built` (caller `editor`, D352); cache hits log nothing.
   */
  async function fetchPreview(
    url: string,
    ids: { requestId?: string; deckId?: string } = {},
  ): Promise<LinkPreview | null> {
    const key = cacheKey(url);
    const hit = cache.get(key);
    if (hit) return hit.preview;

    const build = await buildLinkPreview(buildDeps, url, log);
    logPreviewBuilt(log, 'editor', build.decision, ids);
    cache.set(key, { preview: build.preview });
    return build.preview;
  }

  return {
    /** Never throws for fetch failures: those answer `null`, and the reason is only logged. */
    async lookup(input: {
      user: CurrentUser;
      deckId: string;
      url: string;
      requestId?: string;
    }): Promise<LinkPreview | null> {
      const deck = await resolveDeck(decks, input.deckId, input.user);
      await authorize(input.user, deck, 'item.create', memberships);
      await rateLimits.enforce(rateKeys.linkPreviewUser(input.user.id), LINK_PREVIEW_RATE_PER_HOUR);

      return await fetchPreview(input.url, { requestId: input.requestId, deckId: deck.id });
    },
  };
}

export type LinkPreviewService = ReturnType<typeof createLinkPreviewService>;
