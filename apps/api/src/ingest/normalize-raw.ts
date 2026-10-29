import type { IngestRaw, NormalizedSource } from '@gobbit/shared';
import { extractPage, type ExtractedPage } from '../fetch/extract-page';
import { buildNormalizedSource } from '../fetch/normalize-source';
import type { SafeFetch } from '../fetch/safe-fetch';

export interface NormalizeDeps {
  safeFetch: SafeFetch;
  /** The derived JPEG URL the model sees for an uploaded image (D101). */
  imageUrl: (publicId: string) => string;
}

function parsePage(html: string | null, url: string): ExtractedPage | null {
  if (!html) return null;
  try {
    return extractPage(html, url);
  } catch {
    // Unparseable markup falls back to OG/shared text like any other unreadable page.
    return null;
  }
}

/** D102: fetch the shared URL (if any) and build the record the extractor sees. */
export async function normalizeRaw(raw: IngestRaw, deps: NormalizeDeps): Promise<NormalizedSource> {
  const imageUrls = raw.images.map((img) => deps.imageUrl(img.publicId));
  if (!raw.url) return buildNormalizedSource({ raw, imageUrls });

  const res = await deps.safeFetch(raw.url);
  return buildNormalizedSource({
    raw,
    imageUrls,
    fetch: {
      status: res.status,
      finalUrl: res.finalUrl,
      ms: res.ms,
      error: res.error,
      page: parsePage(res.html, res.finalUrl ?? raw.url),
    },
  });
}
