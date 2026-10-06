import { describe, it, expect } from 'vitest';
import { ApiError, isApiError, isUnauthorized, isNotFound, type Problem } from './api-error';

describe('ApiError', () => {
  it('uses provided message', () => {
    const err = new ApiError(400, null, 'Custom message');
    expect(err.message).toBe('Custom message');
  });

  it('uses problem.title as fallback message', () => {
    const problem: Problem = { title: 'Bad Request' };
    const err = new ApiError(400, problem);
    expect(err.message).toBe('Bad Request');
  });

  it('uses HTTP status as fallback when no title', () => {
    const err = new ApiError(400, null);
    expect(err.message).toBe('HTTP 400');
  });

  it('has correct status and problem properties', () => {
    const problem: Problem = {
      type: 'validation-error',
      detail: 'Invalid input',
    };
    const err = new ApiError(422, problem);
    expect(err.status).toBe(422);
    expect(err.problem).toBe(problem);
  });
});

describe('isApiError', () => {
  it('returns true for ApiError', () => {
    const err = new ApiError(400, null);
    expect(isApiError(err)).toBe(true);
  });

  it('returns false for other errors', () => {
    const err = new Error('Not an API error');
    expect(isApiError(err)).toBe(false);
  });

  it('returns false for non-errors', () => {
    expect(isApiError('string')).toBe(false);
    expect(isApiError(null)).toBe(false);
    expect(isApiError(undefined)).toBe(false);
  });
});

describe('isUnauthorized', () => {
  it('returns true for ApiError with status 401', () => {
    const err = new ApiError(401, null);
    expect(isUnauthorized(err)).toBe(true);
  });

  it('returns false for other ApiError statuses', () => {
    expect(isUnauthorized(new ApiError(400, null))).toBe(false);
    expect(isUnauthorized(new ApiError(403, null))).toBe(false);
  });

  it('returns false for non-ApiError', () => {
    expect(isUnauthorized(new Error('test'))).toBe(false);
  });
});

describe('isNotFound', () => {
  it('returns true for ApiError with status 404', () => {
    const err = new ApiError(404, null);
    expect(isNotFound(err)).toBe(true);
  });

  it('returns false for other ApiError statuses', () => {
    expect(isNotFound(new ApiError(400, null))).toBe(false);
    expect(isNotFound(new ApiError(403, null))).toBe(false);
  });

  it('returns false for non-ApiError', () => {
    expect(isNotFound(new Error('test'))).toBe(false);
  });
});
