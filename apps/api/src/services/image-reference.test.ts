import { describe, expect, it, vi } from 'vitest';
import type { AssetRow } from '@gobbit/db';
import { HttpError } from '../errors/http-errors';
import { createCoverReference, createImageReferenceCheck } from './image-reference';

const asset = (over: Partial<AssetRow> = {}) =>
  ({
    id: 'a1',
    deckId: 'd1',
    publicId: 'gobbit/items/d1/x',
    width: 1200,
    height: 900,
    ...over,
  }) as AssetRow;

describe('createImageReferenceCheck (D160)', () => {
  it('passes non-image payloads through untouched', async () => {
    const byPublicId = vi.fn();
    const payload = { text: 'hi' };
    expect(await createImageReferenceCheck({ byPublicId })('d1', 'text', payload)).toBe(payload);
    expect(byPublicId).not.toHaveBeenCalled();
  });

  it('replaces client dimensions with the recorded ones', async () => {
    const check = createImageReferenceCheck({ byPublicId: vi.fn().mockResolvedValue(asset()) });
    const out = await check('d1', 'image', {
      publicId: 'gobbit/items/d1/x',
      alt: 'cat',
      width: 1,
      height: 2,
    });
    expect(out).toEqual({ publicId: 'gobbit/items/d1/x', alt: 'cat', width: 1200, height: 900 });
  });

  it('drops dimensions the asset does not know', async () => {
    const check = createImageReferenceCheck({
      byPublicId: vi.fn().mockResolvedValue(asset({ width: null, height: null })),
    });
    const out = await check('d1', 'image', { publicId: 'gobbit/items/d1/x', width: 5, height: 5 });
    expect(out).toEqual({ publicId: 'gobbit/items/d1/x' });
  });

  it.each([
    ['an unknown image', null],
    ["another deck's image", asset({ deckId: 'd2' })],
  ])('refuses %s with 422', async (_label, found) => {
    const check = createImageReferenceCheck({ byPublicId: vi.fn().mockResolvedValue(found) });
    const err = await check('d1', 'image', { publicId: 'gobbit/items/d1/x' }).catch(
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(HttpError);
    expect((err as HttpError).status).toBe(422);
  });
});

describe('createCoverReference (D388)', () => {
  it('returns the id and recorded dimensions for an asset of the same deck', async () => {
    const cover = createCoverReference({ byPublicId: vi.fn().mockResolvedValue(asset()) });
    expect(await cover('d1', 'gobbit/items/d1/x')).toEqual({
      ok: true,
      cover: { publicId: 'gobbit/items/d1/x', width: 1200, height: 900 },
    });
  });

  it('omits dimensions the asset lacks', async () => {
    const cover = createCoverReference({
      byPublicId: vi.fn().mockResolvedValue(asset({ width: null, height: null })),
    });
    expect(await cover('d1', 'gobbit/items/d1/x')).toEqual({
      ok: true,
      cover: { publicId: 'gobbit/items/d1/x' },
    });
  });

  it('reports unknown_image for an unrecorded id', async () => {
    const cover = createCoverReference({ byPublicId: vi.fn().mockResolvedValue(null) });
    expect(await cover('d1', 'nope')).toEqual({ ok: false, reason: 'unknown_image' });
  });

  it('reports other_deck for an asset of another deck', async () => {
    const cover = createCoverReference({
      byPublicId: vi.fn().mockResolvedValue(asset({ deckId: 'd2' })),
    });
    expect(await cover('d1', 'gobbit/items/d2/x')).toEqual({ ok: false, reason: 'other_deck' });
  });
});
