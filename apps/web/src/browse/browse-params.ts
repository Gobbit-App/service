import type { ItemFilter } from '../api/query-keys';
import { chipHref, deckHref } from '../ui/chip-order';

/**
 * D141: the Browse address, `/d/$slug/browse?c=&i=`. D246: the old `pane` parameter is
 * ignored. This module is part of the route tree (initial chunk), so it stays dependency-free.
 */

/** The `c` value for the deck's All view. */
export const ALL_CATEGORIES = 'all';

const PARAM_MAX = 64;

export interface BrowseSearch {
  /** `'all'` or a category slug. */
  c: string;
  /** The current card's id; absent → the first card. */
  i?: string;
}

/** The router may hand numbers for JSON-looking values (`?c=2024`). */
function asParam(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= PARAM_MAX ? trimmed : null;
}

/** Lenient parse (data-model §1): anything malformed falls back to the defaults. */
export function parseBrowseSearch(search: Record<string, unknown>): BrowseSearch {
  const parsed: BrowseSearch = { c: asParam(search.c) ?? ALL_CATEGORIES };
  const i = asParam(search.i);
  if (i) parsed.i = i;
  return parsed;
}

/** `c` → the list's own filter, so Browse shares the list's cache key. */
export function filterFromCategory(c: string): ItemFilter {
  return c === ALL_CATEGORIES ? { kind: 'all' } : { kind: 'category', slug: c };
}

/** The list filter → `c`; views Browse doesn't cycle through (favorites, archived…) → null. */
export function categoryFromFilter(filter: ItemFilter): string | null {
  if (filter.kind === 'all') return ALL_CATEGORIES;
  if (filter.kind === 'category') return filter.slug;
  return null;
}

/** True on the Browse route (`/d/<slug>/browse`). */
export function isBrowsePath(pathname: string): boolean {
  return /^\/d\/[^/]+\/browse\/?$/.test(pathname);
}

/** Contract §1: the list a Browse of `c` closes to. */
export function listHref(deckSlug: string, c: string): string {
  return c === ALL_CATEGORIES
    ? deckHref(deckSlug)
    : chipHref(deckSlug, { kind: 'category', slug: c });
}

/** Stable string for a Browse filter: `'all'` or `'category:<slug>'` (return entry, keys). */
export function filterKey(filter: ItemFilter): string {
  return filter.kind === 'category' ? `category:${filter.slug}` : filter.kind;
}

/** `filterKey` → `c` (`'all'` or a category slug); other views → null. */
export function categoryFromFilterKey(key: string): string | null {
  if (key === ALL_CATEGORIES) return ALL_CATEGORIES;
  const prefix = 'category:';
  return key.startsWith(prefix) && key.length > prefix.length ? key.slice(prefix.length) : null;
}

/** D141: router location state of a Browse opened from a list; `listC` is that list's `c`. */
export interface BrowseFromListState {
  fromList: true;
  listC: string;
}

export function fromListState(listC: string): BrowseFromListState {
  return { fromList: true, listC };
}

/** The `c` of the list Browse was opened from, or null (deep link, reload in a new tab…). */
export function listCategoryFromState(state: unknown): string | null {
  if (typeof state !== 'object' || state === null) return null;
  const { fromList, listC } = state as { fromList?: unknown; listC?: unknown };
  return fromList === true && typeof listC === 'string' ? listC : null;
}
