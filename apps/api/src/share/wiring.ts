import type { Db } from '@pb/db';
import type { Env } from '../env';
import { createShareRepo } from '../repositories/share.repo';
import { createCloudinaryOgStore, type OgImageStore } from './og-store';
import type { OgRenderer } from './render';
import { createShareService } from './share.service';

export interface ShareWiring {
  /** Overrides the Cloudinary store (tests use MemoryOgStore); `null` disables generated images. */
  ogStore?: OgImageStore | null;
  /** Overrides the satori/resvg renderer (tests use a stub). */
  ogRenderer?: OgRenderer;
}

/**
 * Loads satori/resvg and the fonts on first use only, and retries after a failure
 * rather than caching a rejected promise forever.
 */
export function lazyRenderer(
  load: () => Promise<OgRenderer> = async () => (await import('./render')).createOgRenderer(),
): () => Promise<OgRenderer> {
  let pending: Promise<OgRenderer> | null = null;
  return () => {
    pending ??= load().catch((err: unknown) => {
      pending = null;
      throw err;
    });
    return pending;
  };
}

export function buildShareService(
  db: Db,
  env: Pick<Env, 'APP_URL' | 'API_URL' | 'CLOUDINARY_URL'>,
  wiring: ShareWiring = {},
) {
  const store =
    wiring.ogStore !== undefined
      ? wiring.ogStore
      : env.CLOUDINARY_URL
        ? createCloudinaryOgStore(env.CLOUDINARY_URL)
        : null;
  const { ogRenderer } = wiring;

  return createShareService({
    repo: createShareRepo(db),
    origin: env.APP_URL ?? env.API_URL,
    store,
    renderer: ogRenderer ? async () => ogRenderer : lazyRenderer(),
  });
}
