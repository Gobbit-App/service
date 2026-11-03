import { screenFor, type RouteId } from './catalogue';

/**
 * D263: screens where the member prompt never appears — the editor and new card (unsaved input,
 * the save action) and Browse (full-page paging, the dock). Untracked screens (sign-in, auth
 * error) are excluded by the catalogue itself.
 */
const NO_PROMPT: ReadonlySet<RouteId> = new Set<RouteId>([
  '/i/$itemId_/edit',
  '/d/$slug/new',
  '/d/$slug/browse',
]);

/** D263: whether the member prompt may show on the deepest matched route. */
export function promptAllowedOn(routeId: string | undefined): boolean {
  if (!routeId || NO_PROMPT.has(routeId as RouteId)) return false;
  return screenFor(routeId) !== null;
}
