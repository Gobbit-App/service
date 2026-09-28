import { describe, it, expect } from 'vitest';
import { assertPocketbookAccess } from './assert-pocketbook-access';
import { HttpError } from '../errors/http-errors';
import type { CurrentUser } from '../types';

describe('assertPocketbookAccess', () => {
  const user: CurrentUser = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    accountId: 'account-owner',
    email: 'owner@example.com',
  };

  const ownerPocketbook = { ownerAccountId: 'account-owner' };
  const nonOwnerPocketbook = { ownerAccountId: 'account-other' };

  it('allows owner read access', () => {
    expect(() => {
      assertPocketbookAccess(user, ownerPocketbook, 'read');
    }).not.toThrow();
  });

  it('allows owner write access', () => {
    expect(() => {
      assertPocketbookAccess(user, ownerPocketbook, 'write');
    }).not.toThrow();
  });

  it('throws 404 for non-owner read access', () => {
    let error: unknown;
    try {
      assertPocketbookAccess(user, nonOwnerPocketbook, 'read');
    } catch (err) {
      error = err;
    }

    expect(error).toBeInstanceOf(HttpError);
    if (error instanceof HttpError) {
      expect(error.status).toBe(404);
      expect(error.detail).toBe('Pocketbook not found');
    }
  });

  it('throws 404 for non-owner write access', () => {
    let error: unknown;
    try {
      assertPocketbookAccess(user, nonOwnerPocketbook, 'write');
    } catch (err) {
      error = err;
    }

    expect(error).toBeInstanceOf(HttpError);
    if (error instanceof HttpError) {
      expect(error.status).toBe(404);
      expect(error.detail).toBe('Pocketbook not found');
    }
  });
});
