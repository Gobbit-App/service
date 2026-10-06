import { htmlLang, ogLocale } from '@pb/shared';
import { isUuid } from '../lib/resolve-deck';
import type { ShareRecord, ShareRepo } from '../repositories/share.repo';
import { ogContentHash, ogPublicId, type OgContent } from './content-hash';
import { excerpt, OG_DESCRIPTION_MAX, OG_IMAGE_EXCERPT_MAX } from './excerpt';
import { shareMode } from './mode';
import { ogCardTree, OG_HEIGHT, OG_WIDTH } from './og-template';
import type { OgImageStore } from './og-store';
import type { OgRenderer } from './render';
import {
  PRIVATE_SHARE_DESCRIPTION,
  PRIVATE_SHARE_TITLE,
  renderSharePage,
  type ShareMeta,
} from './share-page';

/** D61: a first share waits at most this long for its image before falling back. */
export const OG_RENDER_BUDGET_MS = 3000;

/** D59: the one static private image (committed to apps/web/public by `pnpm og:static`). */
export const PRIVATE_OG_IMAGE_PATH = '/og/private.png';

/** Cloudinary transformation for an image card's own picture (D59). */
export const IMAGE_CARD_OG_TRANSFORMATION = 'c_fill,w_1200,h_630,f_jpg';

export interface ShareServiceDeps {
  repo: ShareRepo;
  /** Public origin of the PWA, e.g. https://gobbit.niranhome.win (no trailing slash). */
  origin: string;
  /** Absent when Cloudinary isn't configured: public items then use the private image. */
  store: OgImageStore | null;
  /** Lazily created so the fonts load on the first public share, not at boot of every test. */
  renderer: () => Promise<OgRenderer>;
  log?: (message: string, err?: unknown) => void;
  renderBudgetMs?: number;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timed out after ${ms} ms`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err: unknown) => {
        clearTimeout(timer);
        reject(err instanceof Error ? err : new Error(String(err)));
      },
    );
  });
}

/** First public category in display order (default first, then position). */
function publicCategoryName(record: ShareRecord): string | null {
  return record.categories.find((c) => c.visibility === 'public')?.name ?? null;
}

function imagePublicIdOf(record: ShareRecord): string | null {
  const id = record.item.type === 'image' ? record.item.payload.publicId : undefined;
  return typeof id === 'string' && id !== '' ? id : null;
}

export function createShareService(deps: ShareServiceDeps) {
  const {
    repo,
    origin,
    store,
    renderer,
    log = (message, err) => console.error(`[share] ${message}`, err ?? ''),
    renderBudgetMs = OG_RENDER_BUDGET_MS,
  } = deps;

  function frame(itemId: string): Pick<ShareMeta, 'canonicalUrl' | 'redirectPath'> {
    const id = encodeURIComponent(itemId);
    return { canonicalUrl: `${origin}/s/${id}`, redirectPath: `/i/${id}` };
  }

  /** D58/D59: identical for missing, deleted, invisible and private items. Nothing content-derived. */
  function privateMeta(itemId: string): ShareMeta {
    return {
      ...frame(itemId),
      title: PRIVATE_SHARE_TITLE,
      description: PRIVATE_SHARE_DESCRIPTION,
      imageUrl: `${origin}${PRIVATE_OG_IMAGE_PATH}`,
      imageWidth: OG_WIDTH,
      imageHeight: OG_HEIGHT,
      locale: 'en_US',
      lang: 'en',
    };
  }

  /** D60/D61: reuse the stored image while its hash matches; otherwise render, upload and record. */
  async function generatedImageUrl(itemId: string, content: OgContent): Promise<string | null> {
    if (!store) return null;

    const hash = ogContentHash(content);
    const existing = await repo.findOgImage(itemId);
    if (existing?.contentHash === hash) return store.deliveryUrl(existing.publicId);

    const publicId = ogPublicId(itemId, hash);
    try {
      await withTimeout(
        (async () => {
          const render = await renderer();
          const png = await render(
            ogCardTree({
              title: content.title,
              excerpt: content.excerpt,
              categoryName: content.categoryName,
              deckName: content.deckName,
            }),
          );
          await store.upload(publicId, png);
        })(),
        renderBudgetMs,
      );
    } catch (err) {
      log(`OG image for ${itemId} failed; serving the private image`, err);
      return null;
    }

    await repo.saveOgImage({ itemId, contentHash: hash, publicId });
    return store.deliveryUrl(publicId);
  }

  async function publicMeta(record: ShareRecord): Promise<ShareMeta> {
    const { item, deck } = record;
    const imagePublicId = imagePublicIdOf(record);
    const content: OgContent = {
      title: item.title,
      excerpt: excerpt(item.body, OG_IMAGE_EXCERPT_MAX),
      categoryName: publicCategoryName(record),
      deckName: deck.name,
      imagePublicId,
    };

    const imageUrl =
      imagePublicId && store
        ? store.deliveryUrl(imagePublicId, IMAGE_CARD_OG_TRANSFORMATION)
        : await generatedImageUrl(item.id, content);

    const text = `${item.title} ${item.body}`;
    return {
      ...frame(item.id),
      title: item.title,
      description: excerpt(item.body, OG_DESCRIPTION_MAX) || item.title,
      imageUrl: imageUrl ?? `${origin}${PRIVATE_OG_IMAGE_PATH}`,
      imageWidth: OG_WIDTH,
      imageHeight: OG_HEIGHT,
      locale: ogLocale(text),
      lang: htmlLang(text),
    };
  }

  return {
    /** HTML for `/s/:itemId`: OG tags for crawlers, a refresh to `/i/:itemId` for humans. */
    async sharePage(itemId: string): Promise<string> {
      const record = isUuid(itemId) ? await repo.findRecord(itemId) : null;
      const mode = shareMode(
        record && {
          status: record.item.status,
          deletedAt: record.item.deletedAt,
          deckIsPublic: record.deck.isPublic,
          categoryVisibilities: record.categories.map((c) => c.visibility),
        },
      );

      const meta = record && mode === 'public' ? await publicMeta(record) : privateMeta(itemId);
      return renderSharePage(meta);
    },
  };
}

export type ShareService = ReturnType<typeof createShareService>;
