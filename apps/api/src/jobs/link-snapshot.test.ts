import { describe, expect, it, vi } from 'vitest';
import type { ItemRow } from '@gobbit/db';
import { LINK_IMAGE_RULES_VERSION, type LinkPayload, type MediaAsset } from '@gobbit/shared';
import type { PreviewBuild } from '../fetch/build-preview';
import { PREVIEW_EVENTS } from '../fetch/preview-events';
import { createLinkSnapshotHandler } from './link-snapshot';

const updatedAt = new Date('2026-10-22T10:00:00.000Z');
const asset: MediaAsset = {
  publicId: 'gobbit/links/d1/abc',
  kind: 'image',
  resourceType: 'image',
  durationMs: null,
  pages: null,
  originalFilename: null,
  width: 1200,
  height: 630,
  bytes: 1000,
  format: 'jpg',
  source: 'link_snapshot',
  createdAt: updatedAt.toISOString(),
};
const V = LINK_IMAGE_RULES_VERSION;

function linkRow(payload: LinkPayload, o: Partial<ItemRow> = {}): ItemRow {
  return {
    id: 'i1',
    deckId: 'd1',
    type: 'link',
    status: 'published',
    deletedAt: null,
    updatedAt,
    payload,
    ...o,
  } as ItemRow;
}

function built(o: Partial<PreviewBuild> = {}): PreviewBuild {
  return {
    page: null,
    fetch: { status: 200, finalUrl: null, ms: 1, error: null },
    preview: { title: 'Dan the Plumber', image: 'https://x.test/og.jpg' },
    candidates: ['https://x.test/og.jpg', 'https://x.test/b.jpg', 'https://x.test/c.jpg'],
    decision: {
      outcome: 'preview',
      host: 'x.test',
      lockedHost: null,
      imageSource: 'og',
      titleSource: 'og',
      lookup: 'skipped',
      ms: 1,
    },
    ...o,
  };
}

function harness(row: ItemRow | null, opts: { storage?: boolean; written?: boolean } = {}) {
  const items = {
    findById: vi.fn(async () => row),
    updatePayloadIf: vi.fn(async (_id: string, _at: Date, _payload: unknown) =>
      opts.written === false ? null : row,
    ),
  };
  const buildPreview = vi.fn(async (_url: string) => built());
  const uploadFromUrl = vi.fn(
    async (_input: {
      url: string;
    }): Promise<{ asset: MediaAsset } | { asset: null; reason: string }> => ({
      asset,
    }),
  );
  const sender = { send: vi.fn(async () => 'job') };
  const embedQueue = { enqueueIfStale: vi.fn(async () => undefined) };
  const log = { info: vi.fn(), warn: vi.fn() };
  const handler = createLinkSnapshotHandler({
    items,
    buildPreview,
    uploadFromUrl: opts.storage === false ? null : (uploadFromUrl as never),
    sender,
    embedQueue,
    log,
    imageTries: 3,
    minStoredPx: 200,
  });
  const written = () => items.updatePayloadIf.mock.calls[0]?.[2] as LinkPayload | undefined;
  const imageEvent = () =>
    [...log.info.mock.calls, ...log.warn.mock.calls]
      .map(([fields]) => fields as Record<string, unknown>)
      .find((f) => f.event === PREVIEW_EVENTS.snapshotImage);
  return {
    handler,
    items,
    buildPreview,
    uploadFromUrl,
    sender,
    embedQueue,
    log,
    written,
    imageEvent,
  };
}

const withImage: LinkPayload = {
  url: 'https://x.test/',
  preview: { title: 'T', image: 'https://x.test/a.jpg' },
};

describe('link-snapshot job (D163)', () => {
  it('copies the preview image and writes the server-owned fields conditionally', async () => {
    const h = harness(linkRow(withImage));
    expect(await h.handler({ itemId: 'i1' }, { jobId: 'j1' })).toBe('written');
    expect(h.buildPreview).not.toHaveBeenCalled();
    expect(h.uploadFromUrl).toHaveBeenCalledWith({
      deckId: 'd1',
      url: 'https://x.test/a.jpg',
      source: 'link_snapshot',
    });
    expect(h.items.updatePayloadIf).toHaveBeenCalledWith('i1', updatedAt, {
      url: 'https://x.test/',
      preview: {
        title: 'T',
        image: 'https://x.test/a.jpg',
        publicId: asset.publicId,
        width: 1200,
        height: 630,
        imageLookup: V,
      },
    });
    expect(h.embedQueue.enqueueIfStale).toHaveBeenCalledWith('i1');
    expect(h.imageEvent()).toEqual({
      event: PREVIEW_EVENTS.snapshotImage,
      outcome: 'copied',
      jobId: 'j1',
      itemId: 'i1',
      deckId: 'd1',
      host: 'x.test',
      tries: 1,
    });
  });

  it('fills an empty preview first, then copies its image', async () => {
    const h = harness(linkRow({ url: 'https://x.test/' }));
    expect(await h.handler({ itemId: 'i1' })).toBe('written');
    expect(h.buildPreview).toHaveBeenCalledTimes(1);
    expect(h.buildPreview.mock.calls[0]![0]).toBe('https://x.test/');
    expect(h.uploadFromUrl).toHaveBeenCalledWith(
      expect.objectContaining({ url: 'https://x.test/og.jpg' }),
    );
    expect(h.written()).toMatchObject({
      preview: { title: 'Dan the Plumber', publicId: asset.publicId },
    });
    expect(h.log.info).toHaveBeenCalledWith(
      expect.objectContaining({ event: PREVIEW_EVENTS.built, caller: 'snapshot', itemId: 'i1' }),
      expect.any(String),
    );
  });

  it('without image storage still fills the preview, copies nothing, stamps nothing', async () => {
    const h = harness(linkRow({ url: 'https://x.test/' }), { storage: false });
    expect(await h.handler({ itemId: 'i1' })).toBe('written');
    expect(h.uploadFromUrl).not.toHaveBeenCalled();
    expect(h.written()).toEqual({
      url: 'https://x.test/',
      preview: { title: 'Dan the Plumber', image: 'https://x.test/og.jpg' },
    });
  });

  it('nothing found for an empty preview: unchanged', async () => {
    const h = harness(linkRow({ url: 'https://x.test/' }));
    h.buildPreview.mockResolvedValueOnce(built({ preview: null, candidates: [] }));
    expect(await h.handler({ itemId: 'i1' })).toBe('unchanged');
    expect(h.items.updatePayloadIf).not.toHaveBeenCalled();
  });

  it('losing the race to an edit requeues once, then gives up', async () => {
    const h = harness(linkRow(withImage), { written: false });
    expect(await h.handler({ itemId: 'i1' })).toBe('requeued');
    expect(h.sender.send).toHaveBeenCalledWith(
      'link-snapshot',
      { itemId: 'i1', attempt: 1 },
      expect.objectContaining({ singletonKey: 'i1' }),
    );
    expect(await h.handler({ itemId: 'i1', attempt: 1 })).toBe('superseded');
    expect(h.sender.send).toHaveBeenCalledTimes(1);
    expect(h.embedQueue.enqueueIfStale).not.toHaveBeenCalled();
  });

  it('the requeue keeps the ingest candidates', async () => {
    const h = harness(linkRow(withImage), { written: false });
    await h.handler({ itemId: 'i1', candidates: ['https://x.test/b.jpg'] });
    expect(h.sender.send.mock.calls[0]).toContainEqual({
      itemId: 'i1',
      attempt: 1,
      candidates: ['https://x.test/b.jpg'],
    });
  });

  it.each([
    ['gone', null],
    ['archived', linkRow(withImage, { status: 'archived' })],
    [
      'already copied',
      linkRow({
        url: 'https://x.test/',
        preview: { image: 'https://x.test/a.jpg', publicId: 'p' },
      }),
    ],
    [
      'already looked at',
      linkRow({ url: 'https://x.test/', preview: { title: 'T', imageLookup: V } }),
    ],
  ])('skips a row that is %s', async (_label, row) => {
    const h = harness(row);
    expect(await h.handler({ itemId: 'i1' })).toBe('skipped');
    expect(h.items.updatePayloadIf).not.toHaveBeenCalled();
    expect(h.buildPreview).not.toHaveBeenCalled();
  });
});

describe('link-snapshot image candidates (D349)', () => {
  it('moves on to the job candidates when the first image fails', async () => {
    const h = harness(linkRow(withImage));
    h.uploadFromUrl.mockResolvedValueOnce({ asset: null, reason: 'not_image' });
    const out = await h.handler({ itemId: 'i1', candidates: ['https://x.test/b.jpg'] });
    expect(out).toBe('written');
    expect(h.buildPreview).not.toHaveBeenCalled();
    expect(h.written()?.preview).toMatchObject({
      image: 'https://x.test/b.jpg',
      publicId: asset.publicId,
      imageLookup: V,
    });
    expect(h.imageEvent()).toMatchObject({ outcome: 'copied', tries: 2 });
  });

  it('builds the page once when the card image fails and no candidates came', async () => {
    const h = harness(linkRow(withImage));
    h.uploadFromUrl.mockResolvedValueOnce({ asset: null, reason: 'http_error' });
    expect(await h.handler({ itemId: 'i1' })).toBe('written');
    expect(h.buildPreview).toHaveBeenCalledTimes(1);
    expect(h.uploadFromUrl.mock.calls.map(([i]) => i.url)).toEqual([
      'https://x.test/a.jpg',
      'https://x.test/og.jpg',
    ]);
  });

  it('treats a too-small copy as a failure', async () => {
    const h = harness(linkRow(withImage));
    h.uploadFromUrl.mockResolvedValueOnce({ asset: { ...asset, width: 150, height: 150 } });
    await h.handler({ itemId: 'i1', candidates: ['https://x.test/b.jpg'] });
    expect(h.uploadFromUrl).toHaveBeenCalledTimes(2);
    expect(h.written()?.preview?.image).toBe('https://x.test/b.jpg');
  });

  it('a wide but very short copy is too small too', async () => {
    const h = harness(linkRow(withImage));
    h.uploadFromUrl.mockResolvedValue({ asset: { ...asset, width: 800, height: 60 } });
    await h.handler({ itemId: 'i1', candidates: [] });
    expect(h.imageEvent()).toMatchObject({ outcome: 'dropped', reason: 'too_small' });
  });

  it('drops the image and stamps the lookup when every try fails (FR-013)', async () => {
    const h = harness(linkRow(withImage));
    h.uploadFromUrl.mockResolvedValue({ asset: null, reason: 'not_image' });
    const job = {
      itemId: 'i1',
      candidates: ['https://x.test/b.jpg', 'https://x.test/c.jpg', 'https://x.test/d.jpg'],
    };
    expect(await h.handler(job)).toBe('written');
    expect(h.uploadFromUrl).toHaveBeenCalledTimes(3);
    expect(h.written()).toEqual({
      url: 'https://x.test/',
      preview: { title: 'T', imageLookup: V },
    });
    expect(h.log.warn).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: 'dropped', reason: 'not_image', tries: 3 }),
      expect.any(String),
    );
  });

  it('keeps the remote image unstamped when our storage fails', async () => {
    const h = harness(linkRow(withImage));
    h.uploadFromUrl.mockResolvedValueOnce({ asset: null, reason: 'upload_failed' });
    expect(await h.handler({ itemId: 'i1', candidates: ['https://x.test/b.jpg'] })).toBe(
      'unchanged',
    );
    expect(h.uploadFromUrl).toHaveBeenCalledTimes(1);
    expect(h.imageEvent()).toMatchObject({ outcome: 'kept', reason: 'upload_failed', tries: 1 });
  });

  it('looks for an image on a text-only card not yet looked at', async () => {
    const h = harness(linkRow({ url: 'https://x.test/', preview: { title: 'T' } }));
    expect(await h.handler({ itemId: 'i1' })).toBe('written');
    expect(h.buildPreview).toHaveBeenCalledTimes(1);
    expect(h.written()?.preview).toMatchObject({
      title: 'T',
      image: 'https://x.test/og.jpg',
      publicId: asset.publicId,
      imageLookup: V,
    });
  });

  it('stamps a text-only card whose page has no image', async () => {
    const h = harness(linkRow({ url: 'https://x.test/', preview: { title: 'T' } }));
    h.buildPreview.mockResolvedValueOnce(built({ candidates: [] }));
    expect(await h.handler({ itemId: 'i1' })).toBe('written');
    expect(h.uploadFromUrl).not.toHaveBeenCalled();
    expect(h.written()).toEqual({
      url: 'https://x.test/',
      preview: { title: 'T', imageLookup: V },
    });
    expect(h.imageEvent()).toMatchObject({ outcome: 'none', tries: 0 });
  });

  it("never undoes a member's Remove photo (D350)", async () => {
    const h = harness(linkRow({ url: 'https://x.test/', preview: { imageRemoved: true } }));
    expect(await h.handler({ itemId: 'i1' })).toBe('written');
    expect(h.uploadFromUrl).not.toHaveBeenCalled();
    expect(h.written()?.preview).toEqual({ imageRemoved: true, title: 'Dan the Plumber' });
    expect(h.imageEvent()).toMatchObject({ outcome: 'member_choice' });
  });

  it('logs ids and closed-set values only, never URLs', async () => {
    const h = harness(linkRow(withImage));
    h.uploadFromUrl.mockResolvedValue({ asset: null, reason: 'blocked' });
    await h.handler({ itemId: 'i1', candidates: [] });
    const all = JSON.stringify([...h.log.info.mock.calls, ...h.log.warn.mock.calls]);
    expect(all).not.toMatch(/a\.jpg|og\.jpg|Dan the Plumber/);
  });
});

describe('link-snapshot job for locked hosts (D168)', () => {
  const post: LinkPayload = { url: 'https://www.instagram.com/p/abc/' };

  it('writes nothing when the builder discards a wall page', async () => {
    const h = harness(linkRow(post));
    h.buildPreview.mockResolvedValueOnce(built({ preview: null, candidates: [] }));
    expect(await h.handler({ itemId: 'i1' })).toBe('unchanged');
    expect(h.buildPreview).toHaveBeenCalledTimes(1);
    expect(h.items.updatePayloadIf).not.toHaveBeenCalled();
  });

  it("copies a real post's image (T025)", async () => {
    const h = harness(linkRow(post));
    expect(await h.handler({ itemId: 'i1' })).toBe('written');
    expect(h.uploadFromUrl).toHaveBeenCalledTimes(1);
    expect(h.written()?.preview?.publicId).toBe(asset.publicId);
  });

  it('tries once: no requeue after losing the race with an edit', async () => {
    const h = harness(linkRow(post), { written: false });
    expect(await h.handler({ itemId: 'i1' })).toBe('superseded');
    expect(h.sender.send).not.toHaveBeenCalled();
  });

  it('never replaces a set publicId', async () => {
    const h = harness(
      linkRow({
        url: post.url,
        preview: { publicId: 'gobbit/ingest/d1/p', width: 1080, height: 1350 },
      }),
    );
    expect(await h.handler({ itemId: 'i1' })).toBe('written');
    expect(h.uploadFromUrl).not.toHaveBeenCalled();
    expect(h.written()?.preview?.publicId).toBe('gobbit/ingest/d1/p');
  });
});
