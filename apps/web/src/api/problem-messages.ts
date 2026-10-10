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
