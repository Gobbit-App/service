import { describe, it, expect } from 'vitest';
import { assertDeckAccess } from './assert-deck-access';
import { HttpError } from '../errors/http-errors';
import type { CurrentUser } from '../types';

describe('assertDeckAccess', () => {
  const user: CurrentUser = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    accountId: 'account-owner',
    email: 'owner@example.com',
  };

  const ownerDeck = { ownerAccountId: 'account-owner' };
  const nonOwnerDeck = { ownerAccountId: 'account-other' };

  it('allows owner read access', () => {
    expect(() => {
      assertDeckAccess(user, ownerDeck, 'read');
    }).not.toThrow();
  });

  it('allows owner write access', () => {
    expect(() => {
      assertDeckAccess(user, ownerDeck, 'write');
    }).not.toThrow();
  });

  it('throws 404 for non-owner read access', () => {
    let error: unknown;
    try {
      assertDeckAccess(user, nonOwnerDeck, 'read');
    } catch (err) {
      error = err;
    }

    expect(error).toBeInstanceOf(HttpError);
    if (error instanceof HttpError) {
      expect(error.status).toBe(404);
      expect(error.detail).toBe('Deck not found');
    }
  });

  it('throws 404 for non-owner write access', () => {
    let error: unknown;
    try {
      assertDeckAccess(user, nonOwnerDeck, 'write');
    } catch (err) {
      error = err;
    }

    expect(error).toBeInstanceOf(HttpError);
    if (error instanceof HttpError) {
      expect(error.status).toBe(404);
      expect(error.detail).toBe('Deck not found');
    }
  });
});
