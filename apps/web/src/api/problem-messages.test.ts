import { describe, it, expect } from 'vitest';
import { ApiError } from './api-error';
import { GENERIC_SAVE_ERROR, lifecycleErrorMessage, problemMessages } from './problem-messages';

describe('lifecycleErrorMessage', () => {
  it.each([
    ['/problems/use-restore', 'Restore'],
    ['/problems/invalid-transition', 'Proposals'],
    ['/problems/undo-expired', '30 days'],
    ['/problems/item-needs-category', 'categories'],
  ])('maps %s to its copy', (type, fragment) => {
    const err = new ApiError(409, { type, title: 'Conflict' });
    expect(lifecycleErrorMessage(err, "Couldn't archive the card.")).toContain(fragment);
  });

  it('uses role and availability copy for 403 and 404', () => {
    expect(lifecycleErrorMessage(new ApiError(403, { title: 'Forbidden' }), 'x')).toMatch(
      /permission/,
    );
    expect(lifecycleErrorMessage(new ApiError(404, { title: 'Not found' }), 'x')).toMatch(
      /no longer available/,
    );
  });

  it('falls back to the detail, then the given line; network errors mention the connection', () => {
    expect(lifecycleErrorMessage(new ApiError(500, { detail: 'Boom' }), 'Failed.')).toBe('Boom');
    expect(lifecycleErrorMessage(new ApiError(500, null), 'Failed.')).toBe('Failed.');
    expect(lifecycleErrorMessage(new TypeError('Failed to fetch'), 'Failed.')).toMatch(
      /connection/,
    );
  });
});

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
