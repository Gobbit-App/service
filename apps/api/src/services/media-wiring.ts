import type { Env } from '../env';
import type { MembershipLookup } from '../access/authorize';
import { extractPage } from '../fetch/extract-page';
import { createSafeFetch, type SafeFetch } from '../fetch/safe-fetch';
import { parseCloudinaryUrl } from '../lib/cloudinary-url';
import { createLinkPreviewService } from './link-preview.service';
import { createMediaService, type DeckLookup } from './media.service';
import type { RateLimitService } from './rate-limit.service';

/** Overrides for tests; production builds everything from env (D133, D134). */
export interface MediaWiring {
  /** Link preview fetcher; defaults to `createSafeFetch()` (ports 80/443, ip-guard). */
  safeFetch?: SafeFetch;
  log?: (message: string) => void;
}

export function buildMediaServices(deps: {
  env: Pick<Env, 'CLOUDINARY_URL'>;
  decks: DeckLookup;
  memberships: MembershipLookup;
  rateLimits: Pick<RateLimitService, 'enforce'>;
  now: () => Date;
  wiring?: MediaWiring;
}) {
  const { env, decks, memberships, rateLimits, now, wiring = {} } = deps;
  return {
    media: createMediaService({
      decks,
      memberships,
      rateLimits,
      // env.ts already rejects an invalid CLOUDINARY_URL at startup.
      cloudinary: env.CLOUDINARY_URL ? parseCloudinaryUrl(env.CLOUDINARY_URL) : null,
      now,
    }),
    linkPreview: createLinkPreviewService({
      decks,
      memberships,
      rateLimits,
      safeFetch: wiring.safeFetch ?? createSafeFetch(),
      extract: extractPage,
      log: wiring.log,
    }),
  };
}
