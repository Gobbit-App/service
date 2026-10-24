import { describe, expect, it } from 'vitest';
import { ApiError } from '../api/api-error';
import { adminErrorMessages } from './admin-errors';

describe('adminErrorMessages', () => {
  it.each([
    ['/problems/own-role', 'own role'],
    ['/problems/implicit-owner', 'Account owners'],
    ['/problems/invite-pending', 'Invite them again'],
    ['/problems/last-owner', 'at least one co-owner'],
  ])('maps %s to its copy', (type, fragment) => {
    expect(adminErrorMessages(new ApiError(409, { type, title: 'Conflict' }))[0]).toContain(
      fragment,
    );
  });

  it('uses permission copy for a 403', () => {
    expect(adminErrorMessages(new ApiError(403, { title: 'Forbidden' }))).toEqual([
      "You don't have permission to do that.",
    ]);
  });

  it('shows field messages, else a connection hint instead of the card copy', () => {
    const invalid = new ApiError(400, { errors: [{ message: 'Invalid email address' }] });
    expect(adminErrorMessages(invalid)).toEqual(['Invalid email address']);
    expect(adminErrorMessages(new TypeError('Failed to fetch'))[0]).toMatch(/connection/);
  });
});
