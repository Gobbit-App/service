import { isApiError } from '../api/api-error';
import { GENERIC_SAVE_ERROR, problemMessages } from '../api/problem-messages';

/** D185 problem types (and the usual refusals) in the screen's own words. */
const ADMIN_PROBLEM_COPY: Readonly<Record<string, string>> = {
  '/problems/own-role': "You can't change your own role.",
  '/problems/implicit-owner': 'Account owners always own the deck; their role can’t change.',
  '/problems/invite-pending':
    'This invite isn’t accepted yet. Invite them again with the new role.',
  '/problems/last-owner': 'A deck needs at least one co-owner.',
};

const FALLBACK = "Couldn't save the change. Check your connection and try again.";

/** Lines to show under a failed admin action. */
export function adminErrorMessages(err: unknown): string[] {
  const type = isApiError(err) ? err.problem?.type : undefined;
  const copy = type ? ADMIN_PROBLEM_COPY[type] : undefined;
  if (copy) return [copy];
  if (isApiError(err) && err.status === 403) return ["You don't have permission to do that."];
  return problemMessages(err).map((m) => (m === GENERIC_SAVE_ERROR ? FALLBACK : m));
}
