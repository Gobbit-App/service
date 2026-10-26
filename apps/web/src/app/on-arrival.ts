import type { RouterHistory } from '@tanstack/react-router';

/**
 * Runs `run` once the next navigation lands on `pathname`; any other next navigation (or
 * none, when the unsaved-changes guard is answered with Keep editing) cancels it. Returns
 * the cancel function. Used by sign-out so the session ends only after the page was left
 * (022 FR-011: a held sign-out must not sign out).
 */
export function onArrival(history: RouterHistory, pathname: string, run: () => void): () => void {
  const unsubscribe = history.subscribe(({ location }) => {
    unsubscribe();
    if (location.pathname === pathname) run();
  });
  return unsubscribe;
}
