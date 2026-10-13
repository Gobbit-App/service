import { isApiError } from '../api/api-error';
import { isNetworkError } from '../api/network-state';

/** Maps an ask failure to user-facing copy. Status checks run before the network check. */
export function askErrorCopy(error: unknown): string {
  if (isApiError(error)) {
    if (error.status === 429) {
      return "You've asked a lot this hour — try again later.";
    }
    if (error.status === 503) {
      return 'Ask is unavailable right now.';
    }
    if (error.status === 504) {
      return 'That took too long — try again.';
    }
  }

  if (isNetworkError(error)) {
    return 'Ask needs a connection.';
  }

  return 'Something went wrong asking that.';
}
