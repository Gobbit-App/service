import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import type { DeckRow } from '@gobbit/db';
import type { AssetRow } from '@gobbit/db';
import {
  MEDIA_CONFIRM_RATE_PER_HOUR,
  MEDIA_SIGN_RATE_PER_HOUR,
  MEDIA_UPLOAD_FAILURE_RATE_PER_HOUR,
  MEDIA_MAX_BYTES_DEFAULTS,
  type MediaAssetConfirmRequest,
} from '@gobbit/shared';
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
    expect((err as HttpError).detail).toMatch(/Media uploads are not configured/);
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
    const body = (over: Partial<MediaAssetConfirmRequest> = {}): MediaAssetConfirmRequest => ({
      publicId,
      version: 1700000000,
      signature: store.sign(publicId, 1700000000),
      width: 1200,
      height: 900,
      bytes: 2048,
      format: 'jpg',
      kind: 'image' as const,
      resourceType: 'image' as const,
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

  describe('media kinds (045, D389, D390, D393)', () => {
    const publicId = `${editorUploadFolder(deckId)}/file1`;
    const file = (over: Partial<MediaAssetConfirmRequest>): MediaAssetConfirmRequest => ({
      publicId,
      version: 1700000000,
      signature: store.sign(publicId, 1700000000),
      bytes: 4096,
      format: 'pdf',
      kind: 'pdf',
      resourceType: 'image',
      pages: 3,
      width: 595,
      height: 842,
      ...over,
    });

    async function refusal(over: Partial<MediaAssetConfirmRequest>, path = 'file') {
      const { lines, logger, flush } = captureLogger();
      const err = await build(creds, logger)
        .confirmUpload({ user, deckId, body: file(over), requestId: 'req-1' })
        .catch((e: unknown) => e as HttpError);
      await flush();
      expect(err).toBeInstanceOf(HttpError);
      expect((err as HttpError).status).toBe(422);
      expect((err as HttpError).errors?.[0]?.path).toBe(path);
      expect(upsert).not.toHaveBeenCalled();
      return { lines, err: err as HttpError };
    }

    it('signs each kind with its own limit and logs media.sign', async () => {
      role('editor');
      const { lines, logger, flush } = captureLogger();
      const svc = build(creds, logger);
      const video = await svc.signUpload({ user, deckId, kind: 'video', requestId: 'req-1' });
      await flush();
      expect(video).toMatchObject({ kind: 'video', maxBytes: MEDIA_MAX_BYTES_DEFAULTS.video });
      expect(video.uploadUrl).toMatch(/\/video\/upload$/);
      expect(lines).toContainEqual(
        expect.objectContaining({
          event: 'media.sign',
          outcome: 'accepted',
          kind: 'video',
          requestId: 'req-1',
          deckId,
        }),
      );
      const image = await svc.signUpload({ user, deckId });
      expect(image.kind).toBe('image');
    });

    it('logs a refused signature when storage is off', async () => {
      role('editor');
      const { lines, logger, flush } = captureLogger();
      await build(null, logger)
        .signUpload({ user, deckId, kind: 'pdf', requestId: 'req-2' })
        .catch(() => {});
      await flush();
      expect(lines).toContainEqual(
        expect.objectContaining({
          event: 'media.sign',
          outcome: 'refused',
          reason: 'unavailable',
          level: 'warn',
        }),
      );
    });

    it('records a PDF with its pages and the kind derived from the format', async () => {
      role('editor');
      const { lines, logger, flush } = captureLogger();
      const result = await build(creds, logger).confirmUpload({
        user,
        deckId,
        body: file({ etag: 'abc', originalFilename: 'term-dates', format: 'PDF' }),
        requestId: 'req-1',
      });
      await flush();
      expect(upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: 'pdf',
          resourceType: 'image',
          pages: 3,
          durationMs: null,
          format: 'pdf',
          etag: 'abc',
          originalFilename: 'term-dates',
        }),
      );
      expect(result.asset).toMatchObject({ kind: 'pdf', pages: 3 });
      expect(lines).toContainEqual(
        expect.objectContaining({ event: 'media.confirm', outcome: 'accepted', kind: 'pdf' }),
      );
    });

    it('records audio without dimensions and video with them', async () => {
      role('editor');
      await build().confirmUpload({
        user,
        deckId,
        body: file({
          format: 'm4a',
          kind: 'audio',
          resourceType: 'video',
          durationMs: 4100,
          pages: undefined,
          width: 10,
          height: 10,
        }),
      });
      expect(upsert).toHaveBeenLastCalledWith(
        expect.objectContaining({ kind: 'audio', width: null, height: null, durationMs: 4100 }),
      );
      await build().confirmUpload({
        user,
        deckId,
        body: file({
          format: 'mov',
          kind: 'video',
          resourceType: 'video',
          durationMs: 9000,
          pages: undefined,
          width: 1080,
          height: 1920,
        }),
      });
      expect(upsert).toHaveBeenLastCalledWith(
        expect.objectContaining({ kind: 'video', width: 1080, height: 1920, pages: null }),
      );
    });

    it.each([
      ['format', { format: 'exe' }],
      ['kind_mismatch', { format: 'mp4', kind: 'pdf' as const }],
      ['kind_mismatch', { resourceType: 'video' as const }],
      ['too_large', { bytes: MEDIA_MAX_BYTES_DEFAULTS.pdf + 1 }],
      ['unreadable', { pages: undefined }],
      [
        'unreadable',
        {
          format: 'mp4',
          kind: 'video' as const,
          resourceType: 'video' as const,
          durationMs: undefined,
        },
      ],
    ])('refuses %s, deletes the stored file and logs both decisions', async (reason, over) => {
      role('editor');
      store.resources.set(publicId, {
        resourceType: (over as Partial<MediaAssetConfirmRequest>).resourceType ?? 'image',
        bytes: 1,
        format: 'pdf',
        width: null,
        height: null,
        pages: null,
        durationMs: null,
      });
      const { lines } = await refusal(over);
      expect(store.deleteCalls).toContainEqual([publicId]);
      expect(lines).toContainEqual(
        expect.objectContaining({ event: 'media.confirm', outcome: 'refused', reason }),
      );
      expect(lines).toContainEqual(
        expect.objectContaining({ event: 'media.refused_delete', outcome: 'deleted' }),
      );
      expect(JSON.stringify(lines)).not.toContain(publicId);
    });

    it('logs kind_mismatch at warn (tampering) and a failed delete at error', async () => {
      role('editor');
      store.failing.add(publicId);
      const { lines } = await refusal({ format: 'mp4', kind: 'pdf' });
      expect(lines).toContainEqual(
        expect.objectContaining({ event: 'media.confirm', reason: 'kind_mismatch', level: 'warn' }),
      );
      expect(lines).toContainEqual(
        expect.objectContaining({
          event: 'media.refused_delete',
          outcome: 'failed',
          level: 'error',
        }),
      );
    });

    it('never deletes a file outside the deck folder or with a bad signature', async () => {
      role('editor');
      await refusal({ signature: 'forged' }, 'signature');
      const other = 'gobbit/items/another-deck/x';
      await refusal({ publicId: other, signature: store.sign(other, 1700000000) }, 'publicId');
      expect(store.deleteCalls).toEqual([]);
    });

    it('enforces operator limits over the defaults', async () => {
      role('editor');
      const svc = createMediaService({
        decks,
        memberships,
        rateLimits,
        cloudinary: creds,
        assets: { upsert } as unknown as AssetsRepo,
        store,
        imageFetch: vi.fn(),
        now: () => new Date(),
        maxBytes: { ...MEDIA_MAX_BYTES_DEFAULTS, pdf: 100 },
      });
      expect((await svc.signUpload({ user, deckId, kind: 'pdf' })).maxBytes).toBe(100);
      expect(await statusOf(svc.confirmUpload({ user, deckId, body: file({ bytes: 101 }) }))).toBe(
        422,
      );
    });
  });
});
