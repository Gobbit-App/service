import { describe, expect, it, vi } from 'vitest';
import type { OgImageRecord, ShareRecord, ShareRepo } from '../repositories/share.repo';
import { MemoryOgStore } from './og-store';
import type { OgRenderer } from './render';
import { ogCardTree } from './og-template';
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
      cover: null,
      ...overrides,
    },
    deck: { slug: 'family', name: 'Family', kind: 'shared', isPublic: true, isDefault: false },
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

const cardInput = {
  title: 'Grandma soup',
  excerpt: 'Boil water with salt.',
  categoryName: 'Recipes',
  deckName: 'Family',
};

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

describe('share service — visual (D393)', () => {
  const layer = (id: string) =>
    `l_${id.replaceAll('/', ':')},c_fill,g_auto,w_420,h_630/fl_layer_apply,g_east`;
  const failing = {
    renderer: async () => async () => {
      throw new Error('boom');
    },
  };

  it('layers the cover onto the generated card and renders with hasVisual', async () => {
    const { service, saved, render } = setup(
      makeRecord({ cover: { publicId: 'gobbit/items/d1/cover' } }),
    );
    const url = ogImage(await service.sharePage(ITEM_ID))!;

    expect(url).toContain(layer('gobbit/items/d1/cover'));
    expect(url).toContain(`/${saved[0]!.publicId}`);
    const tree = JSON.stringify(vi.mocked(render).mock.calls[0]![0]);
    expect(tree).toBe(JSON.stringify(ogCardTree({ ...cardInput, hasVisual: true })));
  });

  it('uses the link snapshot when there is no cover, and the cover beats it', async () => {
    const preview = { preview: { publicId: 'gobbit/links/snap' } };
    const snap = await setup(makeRecord({ type: 'link', payload: preview })).service.sharePage(
      ITEM_ID,
    );
    expect(ogImage(snap)).toContain(layer('gobbit/links/snap'));

    const both = await setup(
      makeRecord({ type: 'link', payload: preview, cover: { publicId: 'gobbit/items/d1/c' } }),
    ).service.sharePage(ITEM_ID);
    expect(ogImage(both)).toContain(layer('gobbit/items/d1/c'));
    expect(ogImage(both)).not.toContain('snap');
  });

  it('adds no layer without a visual', async () => {
    expect(ogImage(await setup(makeRecord()).service.sharePage(ITEM_ID))).not.toContain(
      'fl_layer_apply',
    );
  });

  it('falls back to the cropped visual, then to the private image, when rendering fails', async () => {
    const withCover = makeRecord({ cover: { publicId: 'gobbit/items/d1/cover' } });
    const html = await setup(withCover, failing).service.sharePage(ITEM_ID);
    expect(ogImage(html)).toContain('c_fill,g_auto,w_1200,h_630,f_jpg/gobbit/items/d1/cover');

    const plain = await setup(makeRecord(), failing).service.sharePage(ITEM_ID);
    expect(ogImage(plain)).toBe(`${ORIGIN}/og/private.png`);
  });

  it('re-renders when the visual changes', async () => {
    const a = await setup(makeRecord({ cover: { publicId: 'a/1' } }));
    const b = await setup(makeRecord({ cover: { publicId: 'a/2' } }));
    await a.service.sharePage(ITEM_ID);
    await b.service.sharePage(ITEM_ID);
    expect(a.saved[0]!.contentHash).not.toBe(b.saved[0]!.contentHash);
  });

  it('private mode ignores the cover entirely', async () => {
    const record = makeRecord({ cover: { publicId: 'gobbit/items/d1/cover' } });
    record.deck.isPublic = false;
    const html = await setup(record).service.sharePage(ITEM_ID);
    const missing = await setup(null).service.sharePage(ITEM_ID);
    expect(html).toBe(missing);
    expect(html).not.toContain('cover');
  });
});

describe('share service — public pages (D177, D181)', () => {
  it('publicTarget points a public card at its public page', async () => {
    const { service } = setup(makeRecord());
    expect(await service.publicTarget(ITEM_ID)).toBe(`${ORIGIN}/p/family/i/${ITEM_ID}`);
  });

  it('publicTarget is null for private cards, personal and default decks', async () => {
    const privateCard = makeRecord({ status: 'archived' });
    const personal = makeRecord();
    personal.deck.kind = 'personal';
    const byDefault = makeRecord();
    byDefault.deck.isDefault = true;

    for (const record of [null, privateCard, personal, byDefault]) {
      expect(await setup(record).service.publicTarget(ITEM_ID)).toBeNull();
    }
    expect(await setup(makeRecord()).service.publicTarget('not-a-uuid')).toBeNull();
  });

  it('ogImageFor uses the share image, or the private one for hidden cards', async () => {
    expect(await setup(makeRecord()).service.ogImageFor(ITEM_ID)).toMatch(
      /^https:\/\/res\.cloudinary\.com\/demo\//,
    );
    expect(await setup(null).service.ogImageFor(ITEM_ID)).toBe(`${ORIGIN}/og/private.png`);
  });

  it('imageUrl needs a media store', () => {
    expect(setup(null).service.imageUrl('a/b', 'w_10')).toContain('/demo/');
    expect(setup(null, { store: null }).service.imageUrl('a/b', 'w_10')).toBeNull();
  });
});

describe('share service — analytics (D257)', () => {
  it('adds the share-preview tracker only when analytics is on', async () => {
    const off = await setup(null).service.sharePage(ITEM_ID);
    expect(off).not.toMatch(/<script/i);

    const on = await setup(makeRecord(), {
      analytics: { siteId: 'site-1', host: 'gobbit.example' },
    }).service.sharePage(ITEM_ID);
    expect(on).toContain('data-pattern="/s/:item" data-screen="Share preview"');
    // 035 (D264): only the consent-aware loader; it injects Umami's tag itself.
    expect(on).toContain('<script defer src="/analytics/page.js" data-website-id="site-1"');
    expect(on).not.toContain('/stats/script.js');
    expect(on).not.toContain('data-do-not-track');
    expect(on.match(/<script[^>]*>/g)?.join('')).not.toContain(ITEM_ID);
  });
});
