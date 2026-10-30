import type { LandingRenderState, LandingVia } from '../services/landing.events';
import type { LandingState } from './landing';

/** Caddy sets this to `root` when it rewrote a cookieless `/` (it strips any client value first). */
export const VIA_HEADER = 'X-Gobbit-Via';

/** Contract § GET /welcome: the query picks a message state; anything else is the default page. */
export function landingStateFromQuery(query: {
  confirmed?: string;
  confirm?: string;
}): LandingState {
  if (query.confirmed === '1') return 'confirmed';
  if (query.confirm === 'invalid') return 'confirm-invalid';
  return 'default';
}

/** D242: how the visitor reached the page — Caddy's root rewrite, the SPA's signed-out redirect, or a link. */
export function landingVia(viaHeader: string | undefined, from: string | undefined): LandingVia {
  if (viaHeader === 'root') return 'root';
  if (from === 'app') return 'app';
  return 'direct';
}

/** Page states as decision-event values (snake_case, D242). */
export function renderStateName(state: LandingState): LandingRenderState {
  switch (state) {
    case 'confirm-invalid':
      return 'confirm_invalid';
    case 'signed-in':
      return 'signed_in';
    case 'invalid':
      // Only POST renders `invalid`, and POST records `landing.form` instead.
      throw new Error('the invalid state is never rendered by GET');
    default:
      return state;
  }
}

/** Whole minutes for the retry notice, never less than one. */
export function retryMinutes(retryAfterSeconds: number): number {
  return Math.max(1, Math.ceil(retryAfterSeconds / 60));
}
