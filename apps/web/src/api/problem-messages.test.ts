import { describe, it, expect } from 'vitest';
import { ApiError } from './api-error';
import { GENERIC_SAVE_ERROR, problemMessages } from './problem-messages';

describe('problemMessages', () => {
  it('returns the field messages of a validation problem', () => {
    const err = new ApiError(400, {
      title: 'Validation failed',
      errors: [{ path: 'body', message: 'Body must be at most 600 characters' }],
    });
    expect(problemMessages(err)).toEqual(['Body must be at most 600 characters']);
  });

  it('falls back to the detail, then the title', () => {
    expect(problemMessages(new ApiError(409, { title: 'Conflict', detail: 'Taken' }))).toEqual([
      'Taken',
    ]);
    expect(problemMessages(new ApiError(500, { title: 'Server error' }))).toEqual(['Server error']);
  });

  it('ignores malformed field entries and uses the next fallback', () => {
    const err = new ApiError(400, { title: 'Bad', errors: [null, { path: 'x' }, 'nope'] });
    expect(problemMessages(err)).toEqual(['Bad']);
  });

  it('returns the generic line for network failures and unknown errors', () => {
    expect(problemMessages(new TypeError('Failed to fetch'))).toEqual([GENERIC_SAVE_ERROR]);
    expect(problemMessages(new ApiError(500, null))).toEqual([GENERIC_SAVE_ERROR]);
    expect(problemMessages(undefined)).toEqual([GENERIC_SAVE_ERROR]);
  });
});
