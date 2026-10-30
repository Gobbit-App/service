import type { QueryClient } from '@tanstack/react-query';
import { clearLastDeck } from '../lib/last-deck';
import { api, unwrap } from './client';
import { signInHref } from './session-redirect';

/** Pages reachable without a session; a 401 there must not bounce to sign-in again. */
const PUBLIC_PATHS = ['/sign-in', '/auth/error'];

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/** Where a 401 sends the user; `full` targets live outside the SPA (a page load, not a route). */
export type UnauthorizedTarget = { href: string; full: boolean };

/** D227: the landing page, where the app home sends signed-out visitors. */
export const LANDING_FROM_APP = '/welcome?from=app';

/** The home with nothing but `utm_*` tags is the "front door" a stranger may have been sent to. */
function isFrontDoor({ pathname, search }: { pathname: string; search: string }): boolean {
  if (pathname !== '/') return false;
  return [...new URLSearchParams(search).keys()].every((key) => key.startsWith('utm_'));
}

/**
 * D66 / D227: where a 401 sends the user, or null when they are already on a public page.
 * The home goes to the landing page (keeping `utm_*` tags), every other page to sign-in.
 */
export function unauthorizedRedirect(location: {
  pathname: string;
  search: string;
}): UnauthorizedTarget | null {
  if (isPublicPath(location.pathname)) return null;
  if (isFrontDoor(location)) {
    const tags = new URLSearchParams(location.search).toString();
    return { href: tags ? `${LANDING_FROM_APP}&${tags}` : LANDING_FROM_APP, full: true };
  }
  return { href: signInHref(`${location.pathname}${location.search}`), full: false };
}

export type SignOutDeps = {
  queryClient: QueryClient;
  /** Removes the persisted cache from IndexedDB. */
  removePersisted: () => Promise<void>;
  /** D145: removes every unsaved editor draft (FR-013). */
  clearDrafts: () => Promise<void>;
  logout?: () => Promise<unknown>;
  log?: (message: string, err: unknown) => void;
};

/**
 * D66 / D145: end the session, then forget everything this user saw (cache, last deck, drafts). Local data is cleared even
 * when the logout call fails (offline), so a shared phone never keeps the previous user's cards.
 */
export async function signOut({
  queryClient,
  removePersisted,
  clearDrafts,
  logout = () => unwrap(api.POST('/auth/logout')),
  log = (message, err) => console.error(message, err),
}: SignOutDeps): Promise<void> {
  try {
    await logout();
  } catch (err) {
    log('[session] logout request failed; clearing local data anyway', err);
  }
  queryClient.clear();
  clearLastDeck();
  try {
    await removePersisted();
  } catch (err) {
    log('[session] could not clear the persisted cache', err);
  }
  try {
    await clearDrafts();
  } catch (err) {
    log('[session] could not clear the editor drafts', err);
  }
}
