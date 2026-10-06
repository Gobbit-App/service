import { describe, expect, it, vi } from 'vitest';
import { ApiError } from './api-error';
import { createAppQueryClient, shouldRetry } from './query-client';

const apiError = (status: number) => new ApiError(status, null);

describe('shouldRetry', () => {
  it('does not retry client errors', () => {
    expect(shouldRetry(0, apiError(404))).toBe(false);
    expect(shouldRetry(0, apiError(401))).toBe(false);
  });

  it('retries server and network errors up to twice', () => {
    expect(shouldRetry(0, apiError(503))).toBe(true);
    expect(shouldRetry(1, apiError(503))).toBe(true);
    expect(shouldRetry(2, apiError(503))).toBe(false);
    expect(shouldRetry(0, new TypeError('Failed to fetch'))).toBe(true);
    expect(shouldRetry(0, apiError(0))).toBe(true);
  });
});

describe('createAppQueryClient', () => {
  const failWith = (status: number) => async (onUnauthorized: () => void) => {
    const qc = createAppQueryClient(onUnauthorized);
    await qc
      .fetchQuery({
        queryKey: ['x'],
        queryFn: () => Promise.reject(apiError(status)),
        retry: false,
      })
      .catch(() => undefined);
  };

  it('calls onUnauthorized when a query fails with 401', async () => {
    const onUnauthorized = vi.fn();
    await failWith(401)(onUnauthorized);
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it('ignores other errors', async () => {
    const onUnauthorized = vi.fn();
    await failWith(403)(onUnauthorized);
    expect(onUnauthorized).not.toHaveBeenCalled();
  });
});
