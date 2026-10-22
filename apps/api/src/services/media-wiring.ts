import { LINK_CHECK_READ_BYTES } from '@pb/shared';
import type { Env } from '../env';
import type { MembershipLookup } from '../access/authorize';
import { extractPage } from '../fetch/extract-page';
import {
  createSafeFetch,
  createSafeImageFetch,
  type SafeFetch,
  type SafeImageFetch,
} from '../fetch/safe-fetch';
import { parseCloudinaryUrl } from '../lib/cloudinary-url';
import { createCloudinaryMediaStore, type MediaStore } from '../media/media-store';
import { noopLinkSnapshotQueue, type LinkSnapshotQueue } from '../jobs/link-snapshot-queue';
import type { AssetsRepo } from '../repositories/assets.repo';
import { createLinkPreviewService } from './link-preview.service';
import { createMediaService, type DeckLookup } from './media.service';
import type { RateLimitService } from './rate-limit.service';

/** Overrides for tests; production builds everything from env (D133, D134, D156–D159). */
export interface MediaWiring {
  /** Link preview fetcher; defaults to `createSafeFetch()` (ports 80/443, ip-guard). */
  safeFetch?: SafeFetch;
  /** D164 link checks; defaults to `createSafeFetch({ accept: 'any' })`. */
  linkCheckFetch?: SafeFetch;
  /** Image downloads for `uploadFromUrl`; defaults to `createSafeImageFetch()`. */
  imageFetch?: SafeImageFetch;
  /** `null` → no store; defaults to Cloudinary when `CLOUDINARY_URL` is set. */
  mediaStore?: MediaStore | null;
  /** D163: after-commit snapshot enqueue; the API server sends it when `CLOUDINARY_URL` is set. */
  linkSnapshotQueue?: LinkSnapshotQueue;
  log?: (message: string) => void;
}

export function resolveLinkSnapshotQueue(wiring: MediaWiring | undefined): LinkSnapshotQueue {
  return wiring?.linkSnapshotQueue ?? noopLinkSnapshotQueue;
}

/** D164: link checks read any 2xx answer, and at most the first 256 KB of an HTML page. */
export function resolveLinkCheckFetch(wiring: MediaWiring | undefined): SafeFetch {
  return (
    wiring?.linkCheckFetch ?? createSafeFetch({ accept: 'any', maxBytes: LINK_CHECK_READ_BYTES })
  );
}

export function buildMediaServices(deps: {
  env: Pick<Env, 'CLOUDINARY_URL'>;
  decks: DeckLookup;
  memberships: MembershipLookup;
  rateLimits: Pick<RateLimitService, 'enforce'>;
  assets: AssetsRepo;
  now: () => Date;
  wiring?: MediaWiring;
}) {
  const { env, decks, memberships, rateLimits, assets, now, wiring = {} } = deps;
  // env.ts already rejects an invalid CLOUDINARY_URL at startup.
  const cloudinary = env.CLOUDINARY_URL ? parseCloudinaryUrl(env.CLOUDINARY_URL) : null;
  const store =
    wiring.mediaStore !== undefined
      ? wiring.mediaStore
      : cloudinary
        ? createCloudinaryMediaStore(cloudinary)
        : null;

  return {
    media: createMediaService({
      decks,
      memberships,
      rateLimits,
      cloudinary,
      assets,
      store,
      imageFetch: wiring.imageFetch ?? createSafeImageFetch(),
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
