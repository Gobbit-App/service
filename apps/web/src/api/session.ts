import type { QueryClient } from '@tanstack/react-query';
import { clearLastDeck } from '../lib/last-deck';
import { api, unwrap } from './client';
import { signInHref } from './session-redirect';

/** Pages reachable without a session; a 401 there must not bounce to sign-in again. */
const PUBLIC_PATHS = ['/sign-in', '/auth/error'];

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/** D66: where a 401 sends the user, or null when they are already on a public page. */
export function unauthorizedRedirect(location: {
  pathname: string;
  search: string;
}): string | null {
  return isPublicPath(location.pathname)
    ? null
    : signInHref(`${location.pathname}${location.search}`);
}

export type SignOutDeps = {
  queryClient: QueryClient;
  /** Removes the persisted cache from IndexedDB. */
  removePersisted: () => Promise<void>;
  logout?: () => Promise<unknown>;
  log?: (message: string, err: unknown) => void;
};

/**
 * D66: end the session, then forget everything this user saw. Local data is cleared even
 * when the logout call fails (offline), so a shared phone never keeps the previous user's cards.
 */
export async function signOut({
  queryClient,
  removePersisted,
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
}
