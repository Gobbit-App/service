import { describe, expect, it, vi } from 'vitest';
import type { ItemRow } from '@gobbit/db';
import type { LinkPayload, MediaAsset } from '@gobbit/shared';
import { createLinkSnapshotHandler } from './link-snapshot';

const updatedAt = new Date('2026-10-22T10:00:00.000Z');
const asset: MediaAsset = {
  publicId: 'gobbit/links/d1/abc',
  width: 1200,
  height: 630,
  bytes: 1000,
  format: 'jpg',
  source: 'link_snapshot',
  createdAt: updatedAt.toISOString(),
};

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

function harness(row: ItemRow | null, opts: { storage?: boolean; written?: boolean } = {}) {
  const items = {
    findById: vi.fn(async () => row),
    updatePayloadIf: vi.fn(async (_id: string, _at: Date, _payload: unknown) =>
      opts.written === false ? null : row,
    ),
  };
  const fetchPreview = vi.fn(async () => ({
    title: 'Dan the Plumber',
    image: 'https://x.test/og.jpg',
  }));
  const uploadFromUrl = vi.fn(async () => ({ asset }));
  const sender = { send: vi.fn(async () => 'job') };
  const embedQueue = { enqueueIfStale: vi.fn(async () => undefined) };
  const log = { info: vi.fn(), warn: vi.fn() };
  const handler = createLinkSnapshotHandler({
    items,
    fetchPreview,
    uploadFromUrl: opts.storage === false ? null : uploadFromUrl,
    sender,
    embedQueue,
    log,
  });
  return { handler, items, fetchPreview, uploadFromUrl, sender, embedQueue, log };
}

const withImage: LinkPayload = {
  url: 'https://x.test/',
  preview: { title: 'T', image: 'https://x.test/a.jpg' },
};

describe('link-snapshot job (D163)', () => {
  it('copies the preview image and writes the server-owned fields conditionally', async () => {
    const h = harness(linkRow(withImage));
    expect(await h.handler({ itemId: 'i1' })).toBe('written');
    expect(h.fetchPreview).not.toHaveBeenCalled();
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
      },
    });
    expect(h.embedQueue.enqueueIfStale).toHaveBeenCalledWith('i1');
  });

  it('fills an empty preview first, then copies its image', async () => {
    const h = harness(linkRow({ url: 'https://x.test/' }));
    expect(await h.handler({ itemId: 'i1' })).toBe('written');
    expect(h.fetchPreview).toHaveBeenCalledWith('https://x.test/');
    expect(h.uploadFromUrl).toHaveBeenCalledWith(
      expect.objectContaining({ url: 'https://x.test/og.jpg' }),
    );
    expect(h.items.updatePayloadIf.mock.calls[0]![2]).toMatchObject({
      preview: { title: 'Dan the Plumber', publicId: asset.publicId },
    });
  });

  it('without image storage still fills the preview, copies nothing', async () => {
    const h = harness(linkRow({ url: 'https://x.test/' }), { storage: false });
    expect(await h.handler({ itemId: 'i1' })).toBe('written');
    expect(h.uploadFromUrl).not.toHaveBeenCalled();
    expect(h.items.updatePayloadIf.mock.calls[0]![2]).toEqual({
      url: 'https://x.test/',
      preview: { title: 'Dan the Plumber', image: 'https://x.test/og.jpg' },
    });
  });

  it('a refused copy is logged, not thrown, and nothing is written', async () => {
    const h = harness(linkRow(withImage));
    h.uploadFromUrl.mockResolvedValueOnce({ asset: null, reason: 'not_image' } as never);
    expect(await h.handler({ itemId: 'i1' })).toBe('unchanged');
    expect(h.log.info).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'not_image' }),
      expect.any(String),
    );
    expect(h.items.updatePayloadIf).not.toHaveBeenCalled();
    expect(h.embedQueue.enqueueIfStale).not.toHaveBeenCalled();
  });

  it('nothing found for an empty preview: unchanged', async () => {
    const h = harness(linkRow({ url: 'https://x.test/' }));
    h.fetchPreview.mockResolvedValueOnce(null as never);
    expect(await h.handler({ itemId: 'i1' })).toBe('unchanged');
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
  ])('skips a row that is %s', async (_label, row) => {
    const h = harness(row);
    expect(await h.handler({ itemId: 'i1' })).toBe('skipped');
    expect(h.items.updatePayloadIf).not.toHaveBeenCalled();
  });
});

describe('link-snapshot job for locked hosts (D168)', () => {
  const post: LinkPayload = { url: 'https://www.instagram.com/p/abc/' };

  it('discards a preview that only names the site', async () => {
    const h = harness(linkRow(post));
    h.fetchPreview.mockResolvedValueOnce({ title: 'Instagram' } as never);
    expect(await h.handler({ itemId: 'i1' })).toBe('unchanged');
    expect(h.fetchPreview).toHaveBeenCalledTimes(1);
    expect(h.items.updatePayloadIf).not.toHaveBeenCalled();
  });

  it('keeps a real preview and copies its image', async () => {
    const h = harness(linkRow(post));
    expect(await h.handler({ itemId: 'i1' })).toBe('written');
    expect(h.uploadFromUrl).toHaveBeenCalledTimes(1);
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
    const written = h.items.updatePayloadIf.mock.calls[0]?.[2] as LinkPayload;
    expect(written.preview?.publicId).toBe('gobbit/ingest/d1/p');
  });

  it('stays quiet when the copy fails', async () => {
    const h = harness(linkRow(post));
    h.uploadFromUrl.mockResolvedValueOnce({ asset: null, reason: 'blocked' } as never);
    await h.handler({ itemId: 'i1' });
    expect(h.log.info).not.toHaveBeenCalled();
  });
});
