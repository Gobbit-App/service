import type { IngestRaw, NormalizedSource } from '@gobbit/shared';
import { logPreviewBuilt, type PreviewBuild } from '../fetch/build-preview';
import { buildNormalizedSource } from '../fetch/normalize-source';
import type { Logger } from '../lib/logger';

export interface NormalizeDeps {
  /** D346: the one preview builder (fetch once, extract, candidates, lookups, locked rule). */
  buildPreview: (url: string, log?: Pick<Logger, 'info' | 'warn'>) => Promise<PreviewBuild>;
  /** The derived JPEG URL the model sees for an uploaded image (D101). */
  imageUrl: (publicId: string) => string;
  log?: Logger;
}

/** The job the source is normalized for, carried on the decision events (D352). */
export interface NormalizeContext {
  jobId: string;
  deckId: string;
}

/**
 * D102, D346: fetch the shared URL (if any) through the preview builder and build the record the
 * extractor sees. The builder's preview and image candidates ride along on the source, so a
 * retried job reuses them and the snapshot job never repeats the lookup.
 */
export async function normalizeRaw(
  raw: IngestRaw,
  deps: NormalizeDeps,
  ctx?: NormalizeContext,
): Promise<NormalizedSource> {
  const imageUrls = raw.images.map((img) => deps.imageUrl(img.publicId));
  if (!raw.url) return buildNormalizedSource({ raw, imageUrls });

  const log = deps.log?.child({ caller: 'ingest', ...ctx });
  const build = await deps.buildPreview(raw.url, log);
  if (log) logPreviewBuilt(log, 'ingest', build.decision, {});

  const source = buildNormalizedSource({
    raw,
    imageUrls,
    fetch: { ...build.fetch, page: build.page },
  });
  return {
    ...source,
    ...(build.preview ? { linkPreview: build.preview } : {}),
    imageCandidates: build.candidates,
  };
}
