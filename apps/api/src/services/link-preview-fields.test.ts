import { describe, expect, it, vi } from 'vitest';
import type { AssetRow } from '@gobbit/db';
import type { LinkPayload } from '@gobbit/shared';
import { HttpError } from '../errors/http-errors';
import { createLinkPreviewFields } from './link-preview-fields';

function asset(o: Partial<AssetRow>): AssetRow {
  return {
    publicId: 'p',
    deckId: 'd1',
    source: 'link_snapshot',
    width: 1200,
    height: 630,
    ...o,
  } as AssetRow;
}

const assetsById: Record<string, AssetRow> = {
  snap: asset({ publicId: 'snap' }),
  photo: asset({ publicId: 'photo', source: 'editor', width: 800, height: 600 }),
  other: asset({ publicId: 'other', deckId: 'd2' }),
};
const fields = createLinkPreviewFields({
  byPublicId: vi.fn(async (id: string) => assetsById[id] ?? null),
});

const stored = (publicId: string): LinkPayload => ({
  url: 'https://x.test/',
  preview: { title: 'T', image: 'https://x.test/a.jpg', publicId, width: 1200, height: 630 },
});

describe('link preview server-owned fields (D163)', () => {
  it('keeps the stored copy over client values when nothing changed', async () => {
    const out = await fields(
      'd1',
      {
        url: 'https://x.test/',
        preview: { title: 'New', image: 'https://x.test/a.jpg', width: 5 },
      },
      stored('snap'),
    );
    expect(out.preview).toEqual({
      title: 'New',
      image: 'https://x.test/a.jpg',
      publicId: 'snap',
      width: 1200,
      height: 630,
    });
  });

  it('drops a link snapshot when the URL or image changed', async () => {
    const newUrl = await fields(
      'd1',
      { url: 'https://y.test/', preview: { image: 'https://x.test/a.jpg', publicId: 'snap' } },
      stored('snap'),
    );
    expect(newUrl.preview).toEqual({ image: 'https://x.test/a.jpg' });
    const newImage = await fields(
      'd1',
      { url: 'https://x.test/', preview: { image: 'https://x.test/b.jpg' } },
      stored('snap'),
    );
    expect(newImage.preview).toEqual({ image: 'https://x.test/b.jpg' });
  });

  it('keeps a member photo when the URL changes', async () => {
    const out = await fields(
      'd1',
      { url: 'https://y.test/', preview: { title: 'T' } },
      { url: 'https://x.test/', preview: { publicId: 'photo', width: 800, height: 600 } },
    );
    expect(out.preview).toEqual({ title: 'T', publicId: 'photo', width: 800, height: 600 });
  });

  it('accepts a new client publicId of the deck with the asset dimensions', async () => {
    const out = await fields(
      'd1',
      { url: 'https://x.test/', preview: { publicId: 'photo', width: 1, height: 1 } },
      null,
    );
    expect(out.preview).toEqual({ publicId: 'photo', width: 800, height: 600 });
  });

  it.each(['other', 'missing'])(
    'rejects a foreign or unknown publicId (%s) with 422',
    async (id) => {
      const err = await fields(
        'd1',
        { url: 'https://x.test/', preview: { publicId: id } },
        null,
      ).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(HttpError);
      expect((err as HttpError).status).toBe(422);
    },
  );

  it('removes the photo when the client sends publicId null (015)', async () => {
    for (const id of ['snap', 'photo']) {
      const out = await fields(
        'd1',
        { url: 'https://x.test/', preview: { title: 'T', publicId: null, width: 1200 } },
        stored(id),
      );
      expect(out).toEqual({ url: 'https://x.test/', preview: { title: 'T' } });
    }
  });

  it('leaves a payload without a preview alone', async () => {
    expect(await fields('d1', { url: 'https://x.test/' }, null)).toEqual({
      url: 'https://x.test/',
    });
  });
});
