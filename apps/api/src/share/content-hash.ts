import { createHash } from 'node:crypto';

/** Default OG content template version. */
export const OG_TEMPLATE_VERSION = 2;

/** Content data for OG meta tags. */
export type OgContent = {
  title: string;
  excerpt: string;
  categoryName: string | null;
  deckName: string;
  imagePublicId: string | null;
  /** D397: a media card's kind (audio cards get a generated image); absent for other cards. */
  mediaKind?: string;
};

/** Compute SHA256 hash of OG content. */
export function ogContentHash(
  content: OgContent,
  templateVersion: number = OG_TEMPLATE_VERSION,
): string {
  const data = [
    templateVersion,
    content.title,
    content.excerpt,
    content.categoryName,
    content.deckName,
    content.imagePublicId,
    // Only media cards add it, so every other card keeps its stored image's hash.
    ...(content.mediaKind ? [content.mediaKind] : []),
  ];
  return createHash('sha256').update(JSON.stringify(data)).digest('hex');
}

/** Compute OG public ID from item ID and content hash. */
export function ogPublicId(itemId: string, hash: string): string {
  return `og/${itemId}-${hash.slice(0, 12)}`;
}
