import { viewFromPath } from '../ui/chip-order';

/** The deck's search results page (`/d/{slug}/search`). */
export function isSearchPath(pathname: string): boolean {
  return /^\/?d\/[^/]+\/search\/?$/.test(pathname);
}

/**
 * The search box and category chips belong to the card lists (a chip view or search results).
 * Other deck pages (Your shares, Review, Log, Settings, Import, Upcoming) render without them.
 */
export function showsListTools(pathname: string): boolean {
  return isSearchPath(pathname) || viewFromPath(pathname) !== null;
}
