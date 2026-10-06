import { describe, it, expect } from 'vitest';
import { isNetworkError, shouldShowOfflineBanner, type BannerInput } from './network-state';
import { ApiError } from './api-error';

describe('isNetworkError', () => {
  it('returns true for TypeError', () => {
    const err = new TypeError('fetch failed');
    expect(isNetworkError(err)).toBe(true);
  });

  it('returns false for AbortError', () => {
    const err = new Error('Aborted');
    err.name = 'AbortError';
    expect(isNetworkError(err)).toBe(false);
  });

  it('returns true for ApiError with status 0', () => {
    const err = new ApiError(0, null);
    expect(isNetworkError(err)).toBe(true);
  });

  it('returns true for ApiError with status 502', () => {
    const err = new ApiError(502, null);
    expect(isNetworkError(err)).toBe(true);
  });

  it('returns true for ApiError with status 503', () => {
    const err = new ApiError(503, null);
    expect(isNetworkError(err)).toBe(true);
  });

  it('returns true for ApiError with status 504', () => {
    const err = new ApiError(504, null);
    expect(isNetworkError(err)).toBe(true);
  });

  it('returns false for ApiError 4xx statuses', () => {
    expect(isNetworkError(new ApiError(400, null))).toBe(false);
    expect(isNetworkError(new ApiError(404, null))).toBe(false);
    expect(isNetworkError(new ApiError(401, null))).toBe(false);
  });

  it('returns false for ApiError 500', () => {
    const err = new ApiError(500, null);
    expect(isNetworkError(err)).toBe(false);
  });

  it('returns false for non-errors', () => {
    expect(isNetworkError('error')).toBe(false);
    expect(isNetworkError(null)).toBe(false);
    expect(isNetworkError(undefined)).toBe(false);
  });

  it('returns false for regular Error', () => {
    const err = new Error('Some error');
    expect(isNetworkError(err)).toBe(false);
  });
});

describe('shouldShowOfflineBanner', () => {
  it('returns false for ApiError 404 with data', () => {
    const input: BannerInput = {
      error: new ApiError(404, null),
      hasData: true,
      online: true,
    };
    expect(shouldShowOfflineBanner(input)).toBe(false);
  });

  it('returns true for ApiError 503 with data', () => {
    const input: BannerInput = {
      error: new ApiError(503, null),
      hasData: true,
      online: true,
    };
    expect(shouldShowOfflineBanner(input)).toBe(true);
  });

  it('returns false for TypeError without data', () => {
    const input: BannerInput = {
      error: new TypeError('fetch failed'),
      hasData: false,
      online: true,
    };
    expect(shouldShowOfflineBanner(input)).toBe(false);
  });

  it('returns true when offline with data', () => {
    const input: BannerInput = {
      error: null,
      hasData: true,
      online: false,
    };
    expect(shouldShowOfflineBanner(input)).toBe(true);
  });

  it('returns false when online no error has data', () => {
    const input: BannerInput = {
      error: null,
      hasData: true,
      online: true,
    };
    expect(shouldShowOfflineBanner(input)).toBe(false);
  });

  it('returns false when offline without data', () => {
    const input: BannerInput = {
      error: null,
      hasData: false,
      online: false,
    };
    expect(shouldShowOfflineBanner(input)).toBe(false);
  });

  it('returns true for TypeError with data online', () => {
    const input: BannerInput = {
      error: new TypeError('fetch failed'),
      hasData: true,
      online: true,
    };
    expect(shouldShowOfflineBanner(input)).toBe(true);
  });
});
