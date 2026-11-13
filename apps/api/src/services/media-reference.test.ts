import { describe, expect, it, vi } from 'vitest';
import type { AssetRow } from '@gobbit/db';
import { HttpError } from '../errors/http-errors';
import { createMediaReferenceCheck, fileName } from './media-reference';

const asset = (over: Partial<AssetRow> = {}) =>
  ({
    id: 'a1',
    deckId: 'd1',
    publicId: 'gobbit/items/d1/x',
    kind: 'image',
    resourceType: 'image',
    width: 1200,
    height: 900,
    durationMs: null,
    pages: null,
    format: 'jpg',
    originalFilename: null,
    rejectedAt: null,
    ...over,
  }) as AssetRow;

const lookup = (rows: AssetRow[]) =>
  vi.fn(async (id: string) => rows.find((r) => r.publicId === id) ?? null);

async function refusal(promise: Promise<unknown>): Promise<HttpError> {
  const err = await promise.catch((e: unknown) => e);
  expect(err).toBeInstanceOf(HttpError);
  expect((err as HttpError).status).toBe(422);
  return err as HttpError;
}

describe('createMediaReferenceCheck (D160, D390, D398)', () => {
  it('passes other card types through untouched', async () => {
    const byPublicId = vi.fn();
    const payload = { text: 'hi' };
    expect(await createMediaReferenceCheck({ byPublicId })('d1', 'text', payload)).toBe(payload);
    expect(byPublicId).not.toHaveBeenCalled();
  });

  it('replaces every gallery photo’s dimensions with the recorded ones, keeping order and alt', async () => {
    const check = createMediaReferenceCheck({
      byPublicId: lookup([
        asset({ publicId: 'a' }),
        asset({ publicId: 'b', width: null, height: null }),
      ]),
    });
    const out = await check('d1', 'media', {
      kind: 'image',
      images: [
        { publicId: 'b', alt: 'second', width: 5, height: 5 },
        { publicId: 'a', alt: 'cat', width: 1, height: 2 },
      ],
    });
    expect(out).toEqual({
      kind: 'image',
      images: [
        { publicId: 'b', alt: 'second' },
        { publicId: 'a', alt: 'cat', width: 1200, height: 900 },
      ],
    });
  });

  it('refuses the same photo twice in one gallery', async () => {
    const check = createMediaReferenceCheck({ byPublicId: lookup([asset({ publicId: 'a' })]) });
    const err = await refusal(
      check('d1', 'media', { kind: 'image', images: [{ publicId: 'a' }, { publicId: 'a' }] }),
    );
    expect(err.errors?.[0]?.path).toBe('payload.images.1.publicId');
  });

  it.each([
    ['an unknown file', []],
    ["another deck's file", [asset({ publicId: 'a', deckId: 'd2' })]],
    ['a file the verify pass rejected', [asset({ publicId: 'a', rejectedAt: new Date() })]],
  ])('refuses %s with 422 Unknown file', async (_label, rows) => {
    const check = createMediaReferenceCheck({ byPublicId: lookup(rows) });
    const err = await refusal(check('d1', 'media', { kind: 'image', images: [{ publicId: 'a' }] }));
    expect(err.errors?.[0]).toEqual({ path: 'payload.images.0.publicId', message: 'Unknown file' });
    const file = await refusal(check('d1', 'media', { kind: 'pdf', publicId: 'a' }));
    expect(file.errors?.[0]?.path).toBe('payload.publicId');
  });

  it('refuses a payload kind the file is not (FR-004)', async () => {
    const check = createMediaReferenceCheck({
      byPublicId: lookup([asset({ publicId: 'doc', kind: 'pdf', pages: 3 })]),
    });
    const inGallery = await refusal(
      check('d1', 'media', { kind: 'image', images: [{ publicId: 'doc' }] }),
    );
    expect(inGallery.errors?.[0]?.path).toBe('payload.kind');
    await refusal(check('d1', 'media', { kind: 'video', publicId: 'doc' }));
  });

  it('fills a PDF’s pages, first-page size and file name from the asset', async () => {
    const check = createMediaReferenceCheck({
      byPublicId: lookup([
        asset({
          publicId: 'doc',
          kind: 'pdf',
          pages: 3,
          width: 595,
          height: 842,
          format: 'pdf',
          originalFilename: 'term-dates',
        }),
      ]),
    });
    const out = await check('d1', 'media', {
      kind: 'pdf',
      publicId: 'doc',
      alt: 'Calendar',
      pages: 99,
      durationMs: 5,
      fileName: 'lie.exe',
    });
    expect(out).toEqual({
      kind: 'pdf',
      publicId: 'doc',
      alt: 'Calendar',
      width: 595,
      height: 842,
      pages: 3,
      fileName: 'term-dates.pdf',
    });
  });

  it('gives audio a duration and no dimensions, video both', async () => {
    const check = createMediaReferenceCheck({
      byPublicId: lookup([
        asset({
          publicId: 'au',
          kind: 'audio',
          resourceType: 'video',
          width: null,
          height: null,
          durationMs: 4100,
          format: 'm4a',
        }),
        asset({
          publicId: 'vi',
          kind: 'video',
          resourceType: 'video',
          width: 1080,
          height: 1920,
          durationMs: 9000,
          format: 'mov',
        }),
      ]),
    });
    expect(await check('d1', 'media', { kind: 'audio', publicId: 'au', width: 1 })).toEqual({
      kind: 'audio',
      publicId: 'au',
      durationMs: 4100,
    });
    expect(await check('d1', 'media', { kind: 'video', publicId: 'vi' })).toEqual({
      kind: 'video',
      publicId: 'vi',
      width: 1080,
      height: 1920,
      durationMs: 9000,
    });
  });
});

describe('fileName', () => {
  it('adds the format once and caps the length', () => {
    expect(fileName({ originalFilename: 'memo', format: 'm4a' })).toBe('memo.m4a');
    expect(fileName({ originalFilename: 'memo.m4a', format: 'm4a' })).toBe('memo.m4a');
    expect(fileName({ originalFilename: null, format: 'pdf' })).toBeNull();
    expect(fileName({ originalFilename: 'x'.repeat(300), format: 'pdf' })).toHaveLength(200);
  });
});
