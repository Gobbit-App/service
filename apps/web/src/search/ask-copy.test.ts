import { describe, expect, it } from 'vitest';
import { ApiError } from '../api/api-error';
import { askErrorCopy } from './ask-copy';

describe('askErrorCopy', () => {
  it('maps 429 to the rate-limit copy', () => {
    expect(askErrorCopy(new ApiError(429, null))).toBe(
      "You've asked a lot this hour — try again later.",
    );
  });

  it('maps 503 to the unavailable copy', () => {
    expect(askErrorCopy(new ApiError(503, null))).toBe('Ask is unavailable right now.');
  });

  it('maps 504 to the timeout copy', () => {
    expect(askErrorCopy(new ApiError(504, null))).toBe('That took too long — try again.');
  });

  it('maps a TypeError (network failure) to the connection copy', () => {
    expect(askErrorCopy(new TypeError('Failed to fetch'))).toBe('Ask needs a connection.');
  });

  it('maps ApiError with status 0 to the connection copy', () => {
    expect(askErrorCopy(new ApiError(0, null))).toBe('Ask needs a connection.');
  });

  it('maps ApiError 500 to the generic copy', () => {
    expect(askErrorCopy(new ApiError(500, null))).toBe('Something went wrong asking that.');
  });

  it('maps a plain Error to the generic copy', () => {
    expect(askErrorCopy(new Error('boom'))).toBe('Something went wrong asking that.');
  });
});
