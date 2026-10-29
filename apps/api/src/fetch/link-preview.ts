import {
  LINK_PREVIEW_DESCRIPTION_MAX,
  LINK_PREVIEW_IMAGE_URL_MAX,
  LINK_PREVIEW_TITLE_MAX,
  type LinkPreview,
} from '@gobbit/shared';
import type { ExtractedPage } from './extract-page';
import type { SafeFetch } from './safe-fetch';

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

/**
 * One guarded lookup (ADR-048), uncached. Null when the page can't be read or shows nothing;
 * the reason goes to `log`. Shared by the editor lookup and the `link-snapshot` job.
 */
export async function fetchLinkPreview(
  deps: {
    safeFetch: SafeFetch;
    extract: (html: string, url: string) => Pick<ExtractedPage, 'title' | 'og'>;
    log: (message: string) => void;
  },
  url: string,
): Promise<LinkPreview | null> {
  const result = await deps.safeFetch(url);
  if (result.error || result.html === null) {
    deps.log(`[link-preview] no preview: ${result.error ?? 'empty'}`);
    return null;
  }
  const preview = toLinkPreview(deps.extract(result.html, result.finalUrl ?? url));
  if (!preview) deps.log('[link-preview] no preview: nothing to show');
  return preview;
}
