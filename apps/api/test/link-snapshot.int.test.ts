import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { assets, items, type DeckRow, type ItemRow } from '@gobbit/db';
import { LINK_SNAPSHOT_REQUEUE_MAX, type LinkPayload } from '@gobbit/shared';
import { createDeck, createItem } from '@gobbit/db/test';
import { extractPage } from '../src/fetch/extract-page';
import { isBlockedAddress } from '../src/fetch/ip-guard';
import { fetchLinkPreview } from '../src/fetch/link-preview';
import { createSafeFetch, createSafeImageFetch } from '../src/fetch/safe-fetch';
import { createLinkSnapshotHandler } from '../src/jobs/link-snapshot';
import { QUEUES, type JobSender } from '../src/jobs/queues';
import { MemoryMediaStore } from '../src/media/media-store';
import { createAssetsRepo } from '../src/repositories/assets.repo';
import { createItemsRepo, type ItemsRepo } from '../src/repositories/items.repo';
import { createAssetUploader } from '../src/services/media-upload-from-url';
import { captureLogger } from './capture-logger';
import { setupApiTest } from './helpers';

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

const page = (title: string, image: string) => `<!doctype html><html><head>
  <title>${title}</title>
  <meta property="og:title" content="${title}">
  <meta property="og:description" content="About ${title}">
  <meta property="og:image" content="${image}">
</head><body></body></html>`;

/** Local site: an article with an OG image, and one whose OG image URL answers HTML. */
function fixtureSite() {
  const server: Server = createServer((req, res) => {
    if (req.url === '/article') {
      res.writeHead(200, { 'content-type': 'text/html' }).end(page('Sourdough guide', '/og.png'));
    } else if (req.url === '/og.png') {
      res.writeHead(200, { 'content-type': 'image/png' }).end(PNG);
    } else if (req.url === '/fake-image') {
      res.writeHead(200, { 'content-type': 'text/html' }).end('<html><body>hi</body></html>');
    } else {
      res.writeHead(404).end();
    }
  });
  return {
    start: () => new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve)),
    stop: () => new Promise<void>((resolve) => server.close(() => resolve())),
    url: (path: string) => `http://127.0.0.1:${(server.address() as AddressInfo).port}${path}`,
  };
}

class RecordingSender implements JobSender {
  readonly sent: { name: string; data: object; options?: object }[] = [];
  async send(name: string, data: object, options?: object): Promise<string | null> {
    this.sent.push({ name, data, options });
    return 'job-id';
  }
}

// Test wiring: allow the loopback fixture server (any port); everything else stays guarded.
const loopback = {
  allowedPorts: null,
  isBlocked: (ip: string) => ip !== '127.0.0.1' && isBlockedAddress(ip),
};

describe('link-snapshot job against a local site (D163)', () => {
  const ctx = setupApiTest();
  const site = fixtureSite();
  const store = new MemoryMediaStore();
  let deck: DeckRow;
  let sender: RecordingSender;
  let embedded: string[];

  beforeAll(async () => {
    await site.start();
    deck = await createDeck(ctx.t.db, ctx.world.owner);
  });
  afterAll(site.stop);
  beforeEach(() => {
    store.images.clear();
    sender = new RecordingSender();
    embedded = [];
  });

  function handler(
    opts: { items?: Pick<ItemsRepo, 'findById' | 'updatePayloadIf'>; store?: boolean } = {},
  ) {
    const log = captureLogger().logger;
    const uploader = createAssetUploader({
      assets: createAssetsRepo(ctx.t.db),
      store,
      imageFetch: createSafeImageFetch(loopback),
      log,
    });
    return createLinkSnapshotHandler({
      items: opts.items ?? createItemsRepo(ctx.t.db),
      fetchPreview: (url) =>
        fetchLinkPreview(
          { safeFetch: createSafeFetch(loopback), extract: extractPage, log: () => {} },
          url,
        ),
      uploadFromUrl: opts.store === false ? null : (input) => uploader.uploadFromUrl(input),
      sender,
      embedQueue: {
        async enqueueIfStale(id) {
          embedded.push(id);
        },
      },
      log,
    });
  }

  const linkCard = (payload: LinkPayload) =>
    createItem(ctx.t.db, deck, { card: { type: 'link', title: 'Bread', payload } });

  const reload = async (item: ItemRow) =>
    (await ctx.t.db.select().from(items).where(eq(items.id, item.id)))[0]!;

  const deckAssets = () => ctx.t.db.select().from(assets).where(eq(assets.deckId, deck.id));

  it('fills an empty preview and stores its image as a link_snapshot asset', async () => {
    const card = await linkCard({ url: site.url('/article') });

    expect(await handler()({ itemId: card.id })).toBe('written');

    const { payload } = await reload(card);
    const preview = (payload as LinkPayload).preview!;
    expect(preview).toMatchObject({
      title: 'Sourdough guide',
      description: 'About Sourdough guide',
      image: site.url('/og.png'),
      width: 800,
      height: 600,
    });
    expect(preview.publicId).toMatch(new RegExp(`^gobbit/links/${deck.id}/`));
    expect(store.images.has(preview.publicId!)).toBe(true);
    const [asset] = await deckAssets();
    expect(asset).toMatchObject({ publicId: preview.publicId, source: 'link_snapshot' });
    expect(embedded).toEqual([card.id]);

    // The copy is there: a re-delivered job does nothing.
    expect(await handler()({ itemId: card.id })).toBe('skipped');
  });

  it('keeps the remote image when the image URL answers HTML', async () => {
    const before = (await deckAssets()).length;
    const card = await linkCard({
      url: site.url('/elsewhere'),
      preview: { title: 'Odd page', image: site.url('/fake-image') },
    });

    expect(await handler()({ itemId: card.id })).toBe('unchanged');

    const preview = ((await reload(card)).payload as LinkPayload).preview!;
    expect(preview).toEqual({ title: 'Odd page', image: site.url('/fake-image') });
    expect(await deckAssets()).toHaveLength(before);
    expect(store.images.size).toBe(0);
  });

  it('fills the preview without copying when there is no image storage', async () => {
    const card = await linkCard({ url: site.url('/article') });

    expect(await handler({ store: false })({ itemId: card.id })).toBe('written');

    const preview = ((await reload(card)).payload as LinkPayload).preview!;
    expect(preview.title).toBe('Sourdough guide');
    expect(preview.publicId).toBeUndefined();
    expect(store.images.size).toBe(0);
  });

  it('never writes over an edit made while it ran, and sends itself again', async () => {
    const card = await linkCard({ url: site.url('/article') });
    const repo = createItemsRepo(ctx.t.db);
    // A member saves the card between the job's read and its write.
    const racing: Pick<ItemsRepo, 'findById' | 'updatePayloadIf'> = {
      findById: (id) => repo.findById(id),
      async updatePayloadIf(id, updatedAt, payload) {
        await ctx.t.db
          .update(items)
          .set({ title: 'Edited', updatedAt: new Date(updatedAt.getTime() + 1000) })
          .where(eq(items.id, id));
        return repo.updatePayloadIf(id, updatedAt, payload);
      },
    };

    expect(await handler({ items: racing })({ itemId: card.id })).toBe('requeued');

    const row = await reload(card);
    expect(row.title).toBe('Edited');
    expect((row.payload as LinkPayload).preview).toBeUndefined();
    expect(sender.sent).toEqual([
      {
        name: QUEUES.linkSnapshot,
        data: { itemId: card.id, attempt: 1 },
        options: expect.objectContaining({ singletonKey: card.id }),
      },
    ]);
    expect(embedded).toEqual([]);

    sender.sent.length = 0;
    const outcome = await handler({ items: racing })({
      itemId: card.id,
      attempt: LINK_SNAPSHOT_REQUEUE_MAX,
    });
    expect(outcome).toBe('superseded');
    expect(sender.sent).toEqual([]);
  });
});
