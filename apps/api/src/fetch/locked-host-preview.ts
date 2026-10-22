import type { LinkPreview } from '@pb/shared';
import type { LockedHostMatch } from '@pb/shared/links';

/** Words a login wall or consent page puts around the site's name. */
const WALL_WORDS = /\b(log ?in|sign ?in|sign ?up|welcome to|join|on|or|and)\b/gu;

/**
 * D167: a page title that only names the site ("Instagram", "Log in • Instagram",
 * "facebook.com") says nothing about the post.
 */
export function isGenericLockedTitle(title: string | undefined, match: LockedHostMatch): boolean {
  if (!title) return true;
  const rest = title
    .toLowerCase()
    .replaceAll(match.host, ' ')
    .replaceAll(match.label.toLowerCase(), ' ')
    .replace(WALL_WORDS, ' ')
    .replace(/[\p{P}\p{S}\s]+/gu, '');
  return rest.length === 0;
}

/** D168: a fetched preview with only a generic title and nothing else is discarded. */
export function isGenericLockedPreview(
  preview: LinkPreview | null,
  match: LockedHostMatch,
): boolean {
  if (!preview) return true;
  return isGenericLockedTitle(preview.title, match) && !preview.description && !preview.image;
}
