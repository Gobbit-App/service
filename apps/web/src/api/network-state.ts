import { isApiError } from './api-error';

/**
 * Checks if error is network-level (TypeError, ApiError 0/502/503/504, not AbortError).
 */
export function isNetworkError(e: unknown): boolean {
  if (e instanceof TypeError) {
    return true;
  }

  if (e instanceof Error && e.name === 'AbortError') {
    return false;
  }

  if (isApiError(e)) {
    return e.status === 0 || e.status === 502 || e.status === 503 || e.status === 504;
  }

  return false;
}

/** Input for shouldShowOfflineBanner. */
export type BannerInput = {
  error: unknown;
  hasData: boolean;
  online: boolean;
};

/**
 * Determines if offline banner should be shown (has data and offline/network error).
 */
export function shouldShowOfflineBanner(input: BannerInput): boolean {
  if (!input.hasData) {
    return false;
  }

  if (!input.online) {
    return true;
  }

  return isNetworkError(input.error);
}
