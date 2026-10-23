import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import type { DeckRow } from '@pb/db';
import type { AssetRow } from '@pb/db';
import {
  MEDIA_CONFIRM_RATE_PER_HOUR,
  MEDIA_SIGN_RATE_PER_HOUR,
  MEDIA_UPLOAD_FAILURE_RATE_PER_HOUR,
} from '@pb/shared';
import { MemoryMediaStore } from '../media/media-store';
import { editorUploadFolder } from '../media/sign-upload';
import type { AssetsRepo, NewAsset } from '../repositories/assets.repo';
import { HttpError, rateLimited } from '../errors/http-errors';
import type { CurrentUser } from '../types';
import { createMediaService } from './media.service';
import { captureLogger } from '../../test/capture-logger';
import type { Logger } from '../lib/logger';

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

  let store: MemoryMediaStore;
  let upsert: Mock<AssetsRepo['upsert']>;

  const build = (cloudinary: typeof creds | null = creds, log?: Logger) =>
    createMediaService({
      decks,
      memberships,
      rateLimits,
      cloudinary,
      assets: { upsert } as unknown as AssetsRepo,
      store: cloudinary ? store : null,
      imageFetch: vi.fn(),
      now: () => new Date('2026-03-01T10:00:00Z'),
      log,
    });

  const role = (r: 'reader' | 'editor' | 'owner' | null) =>
    memberships.findActive.mockResolvedValue(
      r ? { role: r, acceptedAt: new Date(), deletedAt: null } : null,
    );

  beforeEach(() => {
    memberships = { findActive: vi.fn<Deps['memberships']['findActive']>() };
    rateLimits = { enforce: vi.fn<Deps['rateLimits']['enforce']>().mockResolvedValue(undefined) };
    store = new MemoryMediaStore();
    upsert = vi.fn<AssetsRepo['upsert']>(async (v: NewAsset) => ({
      row: { ...v, id: 'asset-1', createdAt: new Date('2026-03-01T10:00:00Z') } as AssetRow,
      created: true,
    }));
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

  describe('reportUploadFailure', () => {
    const report = {
      status: 401,
      message: 'Invalid Signature abc',
      fileType: 'image/jpeg',
      fileBytes: 1234,
    };

    it('logs the report as a warn line with deck and user', async () => {
      role('editor');
      const { lines, logger, flush } = captureLogger();

      await build(creds, logger).reportUploadFailure({ user, deckId: 'family', report });
      await flush();

      expect(rateLimits.enforce).toHaveBeenCalledWith(
        `media-upload-failure:user:${user.id}`,
        MEDIA_UPLOAD_FAILURE_RATE_PER_HOUR,
      );
      expect(lines).toHaveLength(1);
      expect(lines[0]).toMatchObject({
        level: 'warn',
        deckId,
        userId: user.id,
        cloudName: 'test-cloud',
        uploadStatus: 401,
        uploadError: 'Invalid Signature abc',
        fileType: 'image/jpeg',
        fileBytes: 1234,
      });
      expect(JSON.stringify(lines)).not.toContain('test-secret');
    });

    it('refuses a reader (403) without logging', async () => {
      role('reader');
      const { lines, logger, flush } = captureLogger();

      expect(
        await statusOf(build(creds, logger).reportUploadFailure({ user, deckId, report })),
      ).toBe(403);
      await flush();

      expect(lines).toEqual([]);
    });

    it('passes the rate limiter’s 429 through', async () => {
      role('editor');
      rateLimits.enforce.mockRejectedValue(rateLimited(120));
      expect(await statusOf(build().reportUploadFailure({ user, deckId, report }))).toBe(429);
    });
  });

  describe('confirmUpload (D157)', () => {
    const publicId = `${editorUploadFolder(deckId)}/abc123`;
    const body = (over: Partial<Record<string, unknown>> = {}) => ({
      publicId,
      version: 1700000000,
      signature: store.sign(publicId, 1700000000),
      width: 1200,
      height: 900,
      bytes: 2048,
      format: 'jpg',
      ...over,
    });

    it('records a verified upload as an editor asset of the deck', async () => {
      role('editor');
      const result = await build().confirmUpload({ user, deckId: 'family', body: body() });

      expect(result.created).toBe(true);
      expect(result.asset).toMatchObject({ publicId, width: 1200, height: 900, source: 'editor' });
      expect(upsert).toHaveBeenCalledWith(
        expect.objectContaining({ deckId, publicId, source: 'editor', uploadedBy: user.id }),
      );
      expect(rateLimits.enforce).toHaveBeenCalledWith(
        `media-confirm:user:${user.id}`,
        MEDIA_CONFIRM_RATE_PER_HOUR,
      );
    });

    it('passes a repeat through as created: false', async () => {
      role('editor');
      upsert.mockImplementationOnce(async (v) => ({
        row: { ...v, id: 'asset-1', createdAt: new Date() } as AssetRow,
        created: false,
      }));
      const result = await build().confirmUpload({ user, deckId, body: body() });
      expect(result.created).toBe(false);
    });

    it('refuses a signature that does not verify (422)', async () => {
      role('editor');
      const err = await build()
        .confirmUpload({ user, deckId, body: body({ signature: 'forged' }) })
        .catch((e: unknown) => e as HttpError);
      expect((err as HttpError).status).toBe(422);
      expect(upsert).not.toHaveBeenCalled();
    });

    it("refuses an image outside the deck's editor folder (422)", async () => {
      role('editor');
      const other = 'gobbit/decks/another/editor/abc';
      const err = await build()
        .confirmUpload({
          user,
          deckId,
          body: body({ publicId: other, signature: store.sign(other, 1700000000) }),
        })
        .catch((e: unknown) => e as HttpError);
      expect((err as HttpError).status).toBe(422);
      expect(upsert).not.toHaveBeenCalled();
    });

    it('refuses an image recorded for another deck (422)', async () => {
      role('editor');
      upsert.mockResolvedValueOnce(null);
      expect(await statusOf(build().confirmUpload({ user, deckId, body: body() }))).toBe(422);
    });

    it('refuses a reader (403), hides an unknown deck (404), 503 without a store', async () => {
      role('reader');
      expect(await statusOf(build().confirmUpload({ user, deckId, body: body() }))).toBe(403);
      role(null);
      expect(await statusOf(build().confirmUpload({ user, deckId, body: body() }))).toBe(404);
      role('editor');
      expect(await statusOf(build(null).confirmUpload({ user, deckId, body: body() }))).toBe(503);
    });

    it('passes the rate limiter’s 429 through before verifying', async () => {
      role('editor');
      rateLimits.enforce.mockRejectedValue(rateLimited(60));
      expect(await statusOf(build().confirmUpload({ user, deckId, body: body() }))).toBe(429);
      expect(upsert).not.toHaveBeenCalled();
    });
  });
});
