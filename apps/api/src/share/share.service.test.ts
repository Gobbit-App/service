import { describe, expect, it, vi } from 'vitest';
import type { OgImageRecord, ShareRecord, ShareRepo } from '../repositories/share.repo';
import { MemoryOgStore } from './og-store';
import type { OgRenderer } from './render';
import { createShareService, type ShareServiceDeps } from './share.service';

const ITEM_ID = '0b9a3c1e-4f2d-4c6b-9a8e-1d2c3b4a5f60';
const ORIGIN = 'https://gobbit.example';
const PNG = new Uint8Array([137, 80, 78, 71]);

function makeRecord(overrides: Partial<ShareRecord['item']> = {}): ShareRecord {
  return {
    item: {
      id: ITEM_ID,
      type: 'text',
      status: 'published',
      title: 'Grandma soup',
      body: 'Boil **water** with salt.',
      payload: {},
      deletedAt: null,
      ...overrides,
    },
    deck: { name: 'Family', kind: 'shared', isPublic: true },
    categories: [
      { name: 'General', visibility: 'shared' },
      { name: 'Recipes', visibility: 'public' },
    ],
  };
}

function fakeRepo(record: ShareRecord | null, existing: OgImageRecord | null = null) {
  const saved: OgImageRecord[] = [];
  const repo = {
    findRecord: vi.fn(async () => record),
    findOgImage: vi.fn(async () => existing),
    saveOgImage: vi.fn(async (row: OgImageRecord) => {
      saved.push(row);
    }),
  } as unknown as ShareRepo;
  return { repo, saved };
}

function setup(record: ShareRecord | null, overrides: Partial<ShareServiceDeps> = {}) {
  const { repo, saved } = fakeRepo(record);
  const store = new MemoryOgStore('demo');
  const render: OgRenderer = vi.fn(async () => PNG);
  const log = vi.fn();
  const service = createShareService({
    repo,
    origin: ORIGIN,
    store,
    renderer: async () => render,
    log,
    ...overrides,
  });
  return { service, repo, saved, store, render, log };
}

const ogImage = (html: string) => /property="og:image" content="([^"]+)"/.exec(html)?.[1];

describe('share service — private mode (D58/D59)', () => {
  it('serves identical bodies for a missing item and a private one', async () => {
    const missing = await setup(null).service.sharePage(ITEM_ID);
    const privateDeck = makeRecord();
    privateDeck.deck.isPublic = false;
    const hidden = await setup(privateDeck).service.sharePage(ITEM_ID);

    expect(hidden).toBe(missing);
    expect(missing).toContain('A card was shared with you');
    expect(missing).not.toContain('Grandma');
    expect(ogImage(missing)).toBe(`${ORIGIN}/og/private.png`);
  });

  it('does not query the database for a non-uuid id', async () => {
    const { service, repo } = setup(makeRecord());
    const html = await service.sharePage('not-a-uuid');

    expect(repo.findRecord).not.toHaveBeenCalled();
    expect(html).toContain('A card was shared with you');
  });

  it('treats proposed, archived and deleted items as private', async () => {
    for (const item of [
      { status: 'proposed' as const },
      { status: 'archived' as const },
      { deletedAt: new Date() },
    ]) {
      const html = await setup(makeRecord(item)).service.sharePage(ITEM_ID);
      expect(html).not.toContain('Grandma');
    }
  });
});

describe('share service — public mode (D59–D61)', () => {
  it('renders, uploads and records a new image, then reuses it', async () => {
    const { service, store, saved, render } = setup(makeRecord());
    const html = await service.sharePage(ITEM_ID);

    expect(html).toContain('Grandma soup');
    expect(html).toContain('Boil water with salt.');
    expect(render).toHaveBeenCalledOnce();
    expect(saved).toHaveLength(1);
    expect(store.uploads.get(saved[0]!.publicId)).toBe(PNG);
    expect(ogImage(html)).toBe(store.deliveryUrl(saved[0]!.publicId));

    const { repo: cachedRepo } = fakeRepo(makeRecord(), saved[0]!);
    const cachedRender = vi.fn(async () => PNG);
    const cached = createShareService({
      repo: cachedRepo,
      origin: ORIGIN,
      store,
      renderer: async () => cachedRender,
    });
    expect(ogImage(await cached.sharePage(ITEM_ID))).toBe(ogImage(html));
    expect(cachedRender).not.toHaveBeenCalled();
  });

  it('uses the card picture for image items without rendering', async () => {
    const record = makeRecord({ type: 'image', payload: { publicId: 'family/soup', alt: 'Soup' } });
    const { service, render } = setup(record);
    const html = await service.sharePage(ITEM_ID);

    expect(render).not.toHaveBeenCalled();
    expect(ogImage(html)).toContain('c_fill,w_1200,h_630,f_jpg/family/soup');
  });

  it('falls back to the private image and logs when rendering fails', async () => {
    const { service, saved, log } = setup(makeRecord(), {
      renderer: async () => async () => {
        throw new Error('boom');
      },
    });
    const html = await service.sharePage(ITEM_ID);

    expect(html).toContain('Grandma soup');
    expect(ogImage(html)).toBe(`${ORIGIN}/og/private.png`);
    expect(saved).toHaveLength(0);
    expect(log).toHaveBeenCalledOnce();
  });

  it('falls back when rendering exceeds the budget', async () => {
    const { service, log } = setup(makeRecord(), {
      renderBudgetMs: 5,
      renderer: async () => () => new Promise<Uint8Array>((r) => setTimeout(() => r(PNG), 50)),
    });

    expect(ogImage(await service.sharePage(ITEM_ID))).toBe(`${ORIGIN}/og/private.png`);
    expect(log).toHaveBeenCalledOnce();
  });

  it('uses the private image when no store is configured', async () => {
    const { service, render } = setup(makeRecord(), { store: null });

    expect(ogImage(await service.sharePage(ITEM_ID))).toBe(`${ORIGIN}/og/private.png`);
    expect(render).not.toHaveBeenCalled();
  });

  it('derives lang and locale from the card text', async () => {
    const { service } = setup(makeRecord({ title: 'מרק של סבתא', body: 'מים ומלח' }));
    const html = await service.sharePage(ITEM_ID);

    expect(html).toContain('<html lang="he">');
    expect(html).toContain('he_IL');
  });
});
