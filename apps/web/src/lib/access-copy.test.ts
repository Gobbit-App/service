import { describe, expect, it } from 'vitest';
import { ApiError } from '../api/api-error';
import { accessErrorCopy, isRetryable } from './access-copy';

describe('accessErrorCopy', () => {
  it('uses the no-access copy for 403 and 404', () => {
    expect(accessErrorCopy(new ApiError(404, null), 'card')).toMatch(
      /ask the person who shared it/,
    );
    expect(accessErrorCopy(new ApiError(403, null), 'card')).toMatch(
      /ask the person who shared it/,
    );
    expect(isRetryable(new ApiError(404, null))).toBe(false);
  });

  it('explains offline and generic failures', () => {
    expect(accessErrorCopy(new TypeError('Failed to fetch'), 'pocketbook')).toMatch(/offline/);
    expect(accessErrorCopy(new ApiError(500, null), 'card')).toBe("Couldn't load this card.");
    expect(isRetryable(new ApiError(500, null))).toBe(true);
  });
});
