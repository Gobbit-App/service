import {
  LINK_PREVIEW_DESCRIPTION_MAX,
  LINK_PREVIEW_TITLE_MAX,
  type LinkPreview,
} from '@gobbit/shared';
import type { ExtractedPage } from './extract-page';
import { resolveImageUrl } from './page-images';

/** One line, at most `max` code points (never splits a surrogate pair). */
export function clipLine(value: string | null | undefined, max: number): string | undefined {
  const line = value?.replace(/\s+/g, ' ').trim();
  if (!line) return undefined;
  const points = Array.from(line);
  return points.length > max ? points.slice(0, max).join('').trimEnd() : line;
}

/**
 * D134, D346: OG title (else `<title>`), OG description and `image` (the first image candidate;
 * the OG image when not given), capped to the preview limits. `siteName` is not part of the link
 * payload, so it is dropped. Null when there is nothing to show.
 */
export function toLinkPreview(
  page: Pick<ExtractedPage, 'title' | 'og'>,
  image: string | null | undefined = page.og.image,
): LinkPreview | null {
  const preview: LinkPreview = {};
  const title = clipLine(page.og.title ?? page.title, LINK_PREVIEW_TITLE_MAX);
  const description = clipLine(page.og.description, LINK_PREVIEW_DESCRIPTION_MAX);
  // Absolute only: a relative value has no page to resolve against here.
  const imageUrl = image && /^https?:\/\//i.test(image) ? resolveImageUrl(image, image) : null;
  if (title) preview.title = title;
  if (description) preview.description = description;
  if (imageUrl) preview.image = imageUrl;
  return Object.keys(preview).length > 0 ? preview : null;
}
