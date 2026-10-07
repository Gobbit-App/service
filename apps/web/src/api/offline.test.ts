import { describe, expect, it } from 'vitest';
import { ApiError } from './api-error';
import { anyQueryOffline } from './offline';

const query = (error: unknown, data: unknown) => ({ state: { error, data } }) as never;

describe('anyQueryOffline', () => {
  it('is false with no failing queries', () => {
    expect(anyQueryOffline([query(null, { a: 1 })], true)).toBe(false);
  });

  it('is true when cached data is shown while the network fails', () => {
    expect(anyQueryOffline([query(new TypeError('Failed to fetch'), { a: 1 })], true)).toBe(true);
    expect(anyQueryOffline([query(new ApiError(502, null), [1])], true)).toBe(true);
  });

  it('is false for API errors that are not network failures', () => {
    expect(anyQueryOffline([query(new ApiError(404, null), [1])], true)).toBe(false);
  });
});
