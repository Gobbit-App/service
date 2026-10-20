import { isApiError } from './api-error';

export const GENERIC_SAVE_ERROR = "Couldn't save the card.";

/** Field-level messages the API attaches to a problem (`errors[].message`). */
function fieldMessages(errors: unknown): string[] {
  if (!Array.isArray(errors)) return [];
  return errors.flatMap((entry: unknown) => {
    const message = (entry as { message?: unknown } | null)?.message;
    return typeof message === 'string' ? [message] : [];
  });
}

/**
 * Messages to show for a failed save: the API's field messages, else the problem detail,
 * else its title, else a generic line (network failures and unknown errors).
 */
export function problemMessages(err: unknown): string[] {
  if (!isApiError(err) || !err.problem) return [GENERIC_SAVE_ERROR];
  const fields = fieldMessages(err.problem.errors);
  if (fields.length > 0) return fields;
  if (err.problem.detail) return [err.problem.detail];
  if (err.problem.title) return [err.problem.title];
  return [GENERIC_SAVE_ERROR];
}

/** D131/D132: copy for the lifecycle problem types the API returns. */
export const LIFECYCLE_PROBLEM_COPY: Readonly<Record<string, string>> = {
  '/problems/use-restore': 'Archived cards come back with Restore.',
  '/problems/invalid-transition': "Proposals can't be archived or restored; review them instead.",
  '/problems/undo-expired':
    'This card was deleted more than 30 days ago and can no longer be brought back.',
  '/problems/item-needs-category':
    "This card's categories are gone. Add a category before bringing it back.",
};

/** The line a failed lifecycle action shows: known problem copy, else the generic fallbacks. */
export function lifecycleErrorMessage(err: unknown, fallback: string): string {
  if (!isApiError(err)) return `${fallback} Check your connection and try again.`;
  const copy = err.problem?.type ? LIFECYCLE_PROBLEM_COPY[err.problem.type] : undefined;
  if (copy) return copy;
  if (err.status === 403) return "You don't have permission to do that.";
  if (err.status === 404) return 'This card is no longer available.';
  return err.problem?.detail ?? fallback;
}
