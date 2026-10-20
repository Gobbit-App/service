import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import type { DeckRow } from '@pb/db';
import { MEDIA_SIGN_RATE_PER_HOUR } from '@pb/shared';
import { HttpError, rateLimited } from '../errors/http-errors';
import type { CurrentUser } from '../types';
import { createMediaService } from './media.service';

const deckId = '0b6f3a52-5d0e-4c55-9f43-2f1d8f6a7b10';
const deck = { id: deckId, ownerAccountId: 'account-owner', slug: 'family' } as DeckRow;
const creds = { cloudName: 'test-cloud', apiKey: 'test-key', apiSecret: 'test-secret' };
const user: CurrentUser = {
  id: 'user-1',
  accountId: 'account-1',
  email: 'member@example.test',
  displayName: 'member',
};

async function statusOf(promise: Promise<unknown>): Promise<number | null> {
  try {
    await promise;
    return null;
  } catch (err) {
    return err instanceof HttpError ? err.status : -1;
  }
}

describe('media.service signUpload', () => {
  type Deps = Parameters<typeof createMediaService>[0];
  let memberships: { findActive: Mock<Deps['memberships']['findActive']> };
  let rateLimits: { enforce: Mock<Deps['rateLimits']['enforce']> };
  const decks = {
    findById: vi.fn(async (id: string) => (id === deckId ? deck : null)),
    findBySlug: vi.fn(async (slug: string) => (slug === 'family' ? deck : null)),
    findDefaultForAccount: vi.fn(async () => null),
  };

  const build = (cloudinary: typeof creds | null = creds) =>
    createMediaService({
      decks,
      memberships,
      rateLimits,
      cloudinary,
      now: () => new Date('2026-03-01T10:00:00Z'),
    });

  const role = (r: 'reader' | 'editor' | 'owner' | null) =>
    memberships.findActive.mockResolvedValue(
      r ? { role: r, acceptedAt: new Date(), deletedAt: null } : null,
    );

  beforeEach(() => {
    memberships = { findActive: vi.fn<Deps['memberships']['findActive']>() };
    rateLimits = { enforce: vi.fn<Deps['rateLimits']['enforce']>().mockResolvedValue(undefined) };
  });

  it('signs for an editor without any HTTP layer (FR-016)', async () => {
    role('editor');
    const signed = await build().signUpload({ user, deckId: 'family' });
    expect(signed.folder).toBe(`gobbit/items/${deckId}`);
    expect(rateLimits.enforce).toHaveBeenCalledWith(
      `media-sign:user:${user.id}`,
      MEDIA_SIGN_RATE_PER_HOUR,
    );
  });

  it('signs for an owner membership', async () => {
    role('owner');
    expect(await statusOf(build().signUpload({ user, deckId }))).toBeNull();
  });

  it('refuses a reader with 403 before counting the rate limit', async () => {
    role('reader');
    expect(await statusOf(build().signUpload({ user, deckId }))).toBe(403);
    expect(rateLimits.enforce).not.toHaveBeenCalled();
  });

  it('hides a deck the caller has no role on (404)', async () => {
    role(null);
    expect(await statusOf(build().signUpload({ user, deckId }))).toBe(404);
    expect(await statusOf(build().signUpload({ user, deckId: 'unknown' }))).toBe(404);
  });

  it('answers 503 when Cloudinary is not configured (US3)', async () => {
    role('editor');
    const err = await build(null)
      .signUpload({ user, deckId })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(HttpError);
    expect((err as HttpError).status).toBe(503);
    expect((err as HttpError).detail).toMatch(/Image uploads are not configured/);
  });

  it('passes the rate limiter’s 429 through', async () => {
    role('editor');
    rateLimits.enforce.mockRejectedValue(rateLimited(120));
    expect(await statusOf(build().signUpload({ user, deckId }))).toBe(429);
  });
});
