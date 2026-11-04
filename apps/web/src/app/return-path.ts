import { safeNext } from '../api/session-redirect';

/** A deck page (`/d/<slug>…`) or a card page (`/i/<id>`), never an editor route. */
const RETURN_PATH = /^\/(d\/[^/?#]+(?:[/?#]|$)|i\/[^/?#]+(?:[?#]|$))/;

/**
 * The in-app page a screen was opened from, when it is safe to send the user back there:
 * same-origin (via `safeNext`) and a deck or card page only, so `?back=` can't point at the
 * editor itself, sign-in or anywhere outside the app. Anything else → null.
 */
export function safeReturnPath(value: unknown): string | null {
  const safe = safeNext(value);
  return safe !== null && RETURN_PATH.test(safe) ? safe : null;
}

/** The current page as a return path (pathname + search), or null when it isn't one. */
export function currentReturnPath(): string | null {
  if (typeof window === 'undefined') return null;
  return safeReturnPath(`${window.location.pathname}${window.location.search}`);
}
