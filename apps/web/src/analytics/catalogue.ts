import { OTHER_SCREEN, type Screen } from '@gobbit/shared/analytics';
import type { FileRouteTypes } from '../routeTree.gen';

export type RouteId = FileRouteTypes['id'];

const deckScreen = (segment: string, name: string): Screen => ({
  pattern: `/d/:deck/${segment}`,
  name,
});

/**
 * D244: every route id → the pattern and fixed name analytics may see; null = not tracked
 * (sign-in, auth error, layout routes). Typed as a full record, so a new route fails `tsc`
 * until it is listed here.
 */
export const SCREENS: Record<RouteId, Screen | null> = {
  __root__: null,
  '/': { pattern: '/', name: 'Home' },
  '/settings': { pattern: '/settings', name: 'Settings' },
  '/share': { pattern: '/share', name: 'Share' },
  '/sign-in': null,
  '/admin/waitlist': { pattern: '/admin/waitlist', name: 'Admin waitlist' },
  '/auth/error': null,
  '/d/$slug': null,
  '/i/$itemId': { pattern: '/i/:item', name: 'Card' },
  '/d/$slug/': { pattern: '/d/:deck', name: 'Deck' },
  '/d/$slug/archived': deckScreen('archived', 'Archived'),
  '/d/$slug/browse': deckScreen('browse', 'Browse'),
  '/d/$slug/favorites': deckScreen('favorites', 'Favorites'),
  '/d/$slug/import': deckScreen('import', 'Import'),
  '/d/$slug/links': deckScreen('links', 'Links'),
  '/d/$slug/log': deckScreen('log', 'Activity log'),
  '/d/$slug/new': deckScreen('new', 'New card'),
  '/d/$slug/review': deckScreen('review', 'Review'),
  '/d/$slug/search': deckScreen('search', 'Search'),
  '/d/$slug/settings': deckScreen('settings', 'Deck settings'),
  '/d/$slug/shares': deckScreen('shares', 'Shares'),
  '/i/$itemId_/edit': { pattern: '/i/:item/edit', name: 'Card editor' },
  '/d/$slug/c/$category': { pattern: '/d/:deck/c/:category', name: 'Category' },
};

/** D244: the screen of the deepest matched route; unknown ids count as "Other", never the path. */
export function screenFor(routeId: string | undefined): Screen | null {
  if (!routeId) return null;
  return routeId in SCREENS ? SCREENS[routeId as RouteId] : OTHER_SCREEN;
}
