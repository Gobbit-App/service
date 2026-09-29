import { describe, it, expect, vi } from 'vitest';
import { HttpError } from '../errors/http-errors';
import { authorize, resolveRole } from './authorize';

const user = { id: 'u1', accountId: 'acc-1', email: 'a@b.c', displayName: 'A' };
const deck = { id: 'd1', ownerAccountId: 'acc-2' };
const ownDeck = { id: 'd2', ownerAccountId: 'acc-1' };

describe('resolveRole', () => {
  it('returns owner for the owner account even with a stray membership row', () => {
    const stray = { role: 'reader' as const, acceptedAt: new Date() };
    expect(resolveRole(user, ownDeck, stray)).toBe('owner');
  });

  it('returns null for a pending membership', () => {
    expect(resolveRole(user, deck, { role: 'editor', acceptedAt: null })).toBeNull();
  });

  it('returns the role of an accepted membership', () => {
    expect(resolveRole(user, deck, { role: 'editor', acceptedAt: new Date() })).toBe('editor');
  });

  it('returns null for a soft-deleted membership', () => {
    const m = { role: 'editor' as const, acceptedAt: new Date(), deletedAt: new Date() };
    expect(resolveRole(user, deck, m)).toBeNull();
  });

  it('returns null without a membership', () => {
    expect(resolveRole(user, deck, null)).toBeNull();
  });
});

describe('authorize', () => {
  it('throws 404 when the caller has no role', async () => {
    const memberships = { findActive: vi.fn().mockResolvedValue(null) };
    const err = await authorize(user, deck, 'deck.read', memberships).catch((e) => e);
    expect(err).toBeInstanceOf(HttpError);
    expect(err.status).toBe(404);
  });

  it('throws 403 with permission and role extensions when the role lacks the permission', async () => {
    const memberships = {
      findActive: vi.fn().mockResolvedValue({ role: 'reader', acceptedAt: new Date() }),
    };
    const err = await authorize(user, deck, 'deck.delete', memberships).catch((e) => e);
    expect(err).toBeInstanceOf(HttpError);
    expect(err.status).toBe(403);
    expect(err.extensions).toEqual({ permission: 'deck.delete', role: 'reader' });
  });

  it('returns the role when allowed', async () => {
    const memberships = {
      findActive: vi.fn().mockResolvedValue({ role: 'editor', acceptedAt: new Date() }),
    };
    await expect(authorize(user, deck, 'item.create', memberships)).resolves.toBe('editor');
    expect(memberships.findActive).toHaveBeenCalledWith('d1', 'u1');
  });

  it('skips the membership lookup for the owner account', async () => {
    const memberships = { findActive: vi.fn() };
    await expect(authorize(user, ownDeck, 'deck.delete', memberships)).resolves.toBe('owner');
    expect(memberships.findActive).not.toHaveBeenCalled();
  });
});
