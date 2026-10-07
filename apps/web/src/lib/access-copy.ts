import { isApiError } from '../api/api-error';
import { isNetworkError } from '../api/network-state';

/** P3.2: copy for a deck or card that failed to load with nothing cached. */
export function accessErrorCopy(error: unknown, what: 'card' | 'pocketbook'): string {
  if (isApiError(error) && (error.status === 403 || error.status === 404)) {
    return "You don't have access — ask the person who shared it.";
  }
  if (isNetworkError(error)) {
    return `You're offline and this ${what} isn't saved on this device yet.`;
  }
  return `Couldn't load this ${what}.`;
}

/** Retrying a 403/404 won't help; everything else may. */
export function isRetryable(error: unknown): boolean {
  return !(isApiError(error) && (error.status === 403 || error.status === 404));
}
