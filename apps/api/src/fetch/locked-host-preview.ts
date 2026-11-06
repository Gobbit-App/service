import type { LinkPreview } from '@gobbit/shared';
import type { LockedHostMatch } from '@gobbit/shared/links';

/** Words a login wall or consent page puts around the site's name. */
const WALL_WORDS = /\b(log ?in|sign ?in|sign ?up|welcome to|join|on|or|and)\b/gu;

/** The words that make a site-name-only title a login or sign-up wall. */
const LOGIN_WORDS = /\b(log ?in|sign ?in|sign ?up|join)\b/u;

/**
 * D347: titles of a locked host's "this isn't here" pages, compared case-insensitively after
 * the site name and punctuation are removed.
 */
export const LOCKED_UNAVAILABLE_TITLES = [
  'page not found',
  'content unavailable',
  "this page isn't available",
  "post isn't available",
  "sorry, this page isn't available",
] as const;

/** D352: why a locked host's title is not a real one, or `real`. */
export type LockedPreviewVerdict = 'real' | 'generic' | 'login_wall' | 'unavailable';

function words(value: string): string {
  return value.replace(/[\p{P}\p{S}\s]+/gu, ' ').trim();
}

const UNAVAILABLE = new Set(LOCKED_UNAVAILABLE_TITLES.map((t) => words(t)));

/**
 * D167, D347: a title that only names the site ("Instagram", "facebook.com") is `generic`, one
 * that only names it around a login prompt ("Log in • Instagram") is `login_wall`, a known
 * missing-page title is `unavailable`; anything else is `real`.
 */
export function lockedPreviewVerdict(
  title: string | undefined | null,
  match: LockedHostMatch,
): LockedPreviewVerdict {
  if (!title?.trim()) return 'generic';
  const withoutSite = title
    .toLowerCase()
    .replaceAll(match.host, ' ')
    .replaceAll(match.label.toLowerCase(), ' ');
  if (UNAVAILABLE.has(words(withoutSite))) return 'unavailable';
  if (words(withoutSite.replace(WALL_WORDS, ' ')).length > 0) return 'real';
  return LOGIN_WORDS.test(withoutSite) ? 'login_wall' : 'generic';
}

/** D167: the page title says nothing about the post. */
export function isGenericLockedTitle(
  title: string | undefined | null,
  match: LockedHostMatch,
): boolean {
  return lockedPreviewVerdict(title, match) !== 'real';
}

/**
 * D347 (revises D168): a locked host's preview without a real title is discarded whole, its
 * image and description included (a wall carries the site logo and a "log in" blurb).
 */
export function isGenericLockedPreview(
  preview: LinkPreview | null,
  match: LockedHostMatch,
): boolean {
  if (!preview) return true;
  return isGenericLockedTitle(preview.title, match);
}
