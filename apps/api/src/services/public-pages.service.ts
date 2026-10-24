import {
  decodeCursor,
  InvalidCursorError,
  PUBLIC_SEARCH_LIMIT_DEFAULT,
  SEARCH_Q_MAX,
} from '@pb/shared';
import type { CurrentUser } from '../types';
import type { DecksRepo } from '../repositories/decks.repo';
import type { SitemapRepo } from '../repositories/sitemap.repo';
import { resolveRole, type MembershipLookup } from '../access/authorize';
import type { ShareService } from '../share/share.service';
import type { PageCache } from '../public/page-cache';
import { pageCacheKey } from '../public/page-cache';
import {
  categoryPage,
  deckPage,
  itemPage,
  PUBLIC_PAGE_SIZE,
  searchPage,
  type PageContext,
} from '../public/pages';
import { appPath, publicPath, publicUrl, type PageTarget } from '../public/public-url';
import {
  badRequest,
  htmlPage,
  notFound,
  PAGE_CACHE_CONTROL,
  PRIVATE_CACHE_CONTROL,
  redirect,
  SEARCH_PAGE_CACHE_CONTROL,
  type PageResponse,
} from '../public/responses';
import { robotsFor, robotsTxt, sitemapXml, type SitemapEntry } from '../public/seo';
import { isPublicDeck, type PublicDeckRow, type PublicDeckService } from './public-deck.service';
import type { SearchService } from './search.service';

/** Who is asking and how (D178). */
export type PageRequest = {
  user?: CurrentUser;
  /** `?view=public`: a member who wants the stranger's page. */
  view?: string;
  /** `?cursor=` of deck and category pages. */
  cursor?: string;
  /** `?q=` of the search page (D182). */
  q?: string;
};

/** How a request is answered once the deck is known. */
type Audience = 'stranger' | 'member' | 'member-public-view';

export function createPublicPagesService({
  publicDecks,
  decks,
  memberships,
  sitemap,
  share,
  cache,
  search,
}: {
  publicDecks: Pick<PublicDeckService, 'summaryFor' | 'listFor' | 'itemById'>;
  decks: Pick<DecksRepo, 'findBySlug'>;
  memberships: MembershipLookup;
  sitemap: SitemapRepo;
  share: Pick<ShareService, 'ogImageFor' | 'imageUrl' | 'siteImageUrl' | 'origin'>;
  cache: PageCache;
  search: Pick<SearchService, 'retrievePublic'>;
}) {
  const origin = share.origin;

  /** D178: any role on the deck makes the caller a member. */
  async function audienceOf(deck: PublicDeckRow, req: PageRequest): Promise<Audience> {
    const { user } = req;
    if (!user) return 'stranger';
    const membership =
      deck.ownerAccountId === user.accountId
        ? null
        : await memberships.findActive(deck.id, user.id);
    if (!resolveRole(user, deck, membership)) return 'stranger';
    return req.view === 'public' ? 'member-public-view' : 'member';
  }

  function contextFor(deck: PublicDeckRow, audience: Audience): PageContext {
    return {
      origin,
      robots: robotsFor(deck),
      publicViewNote: audience === 'member-public-view',
      imageUrl: share.imageUrl,
      siteImage: share.siteImageUrl,
    };
  }

  /**
   * Member redirect, cache lookup, render, cache store. `render` returns null for "not public"
   * (unknown category), which answers the 404 page.
   */
  async function answer(
    deck: PublicDeckRow,
    target: PageTarget,
    req: PageRequest,
    cacheKey: string,
    render: (ctx: PageContext) => Promise<string | null>,
  ): Promise<PageResponse> {
    const audience = await audienceOf(deck, req);
    if (audience === 'member') return redirect(302, appPath(target), PRIVATE_CACHE_CONTROL);

    const noindex = robotsFor(deck) === 'noindex';
    if (audience === 'member-public-view') {
      const html = await render(contextFor(deck, audience));
      return html === null ? notFound() : htmlPage(html, PRIVATE_CACHE_CONTROL, noindex);
    }

    const cached = cache.get(deck.id, cacheKey);
    if (cached) return cached;

    const html = await render(contextFor(deck, audience));
    if (html === null) return notFound();
    const page = htmlPage(html, PAGE_CACHE_CONTROL, noindex);
    cache.set(deck.id, cacheKey, { status: 200, html: page.html, headers: page.headers });
    return page;
  }

  async function publicDeckBySlug(slug: string): Promise<PublicDeckRow | null> {
    const deck = await decks.findBySlug(slug);
    return isPublicDeck(deck) ? deck : null;
  }

  function validCursor(cursor: string | undefined): boolean {
    if (cursor === undefined) return true;
    try {
      decodeCursor(cursor);
      return true;
    } catch (err) {
      if (err instanceof InvalidCursorError) return false;
      throw err;
    }
  }

  return {
    /** `GET /p/{slug}` */
    async deckPage(slug: string, req: PageRequest): Promise<PageResponse> {
      const deck = await publicDeckBySlug(slug);
      if (!deck) return notFound();
      if (!validCursor(req.cursor)) return badRequest();

      const target: PageTarget = { kind: 'deck', slug: deck.slug };
      const key = pageCacheKey(publicPath(target), { cursor: req.cursor });
      return await answer(deck, target, req, key, async (ctx) => {
        const [summary, page] = await Promise.all([
          publicDecks.summaryFor(deck),
          publicDecks.listFor(deck, { cursor: req.cursor, limit: PUBLIC_PAGE_SIZE }),
        ]);
        return deckPage(ctx, { deck: summary, items: page.data, nextCursor: page.nextCursor });
      });
    },

    /** `GET /p/{slug}/c/{category}` */
    async categoryPage(
      slug: string,
      categorySlug: string,
      req: PageRequest,
    ): Promise<PageResponse> {
      const deck = await publicDeckBySlug(slug);
      if (!deck) return notFound();
      if (!validCursor(req.cursor)) return badRequest();

      const target: PageTarget = { kind: 'category', slug: deck.slug, category: categorySlug };
      const key = pageCacheKey(publicPath(target), { cursor: req.cursor });
      return await answer(deck, target, req, key, async (ctx) => {
        const summary = await publicDecks.summaryFor(deck);
        const category = summary.categories.find((c) => c.slug === categorySlug);
        if (!category) return null;
        const page = await publicDecks.listFor(deck, {
          category: category.slug,
          cursor: req.cursor,
          limit: PUBLIC_PAGE_SIZE,
        });
        return categoryPage(ctx, {
          deck: summary,
          category,
          items: page.data,
          nextCursor: page.nextCursor,
        });
      });
    },

    /** `GET /p/{slug}/i/{itemId}`: the card id decides; another slug → 301 to the current one. */
    async itemPage(slug: string, itemId: string, req: PageRequest): Promise<PageResponse> {
      const found = await publicDecks.itemById(itemId);
      if (!found) return notFound();
      const { deck, item } = found;

      const target: PageTarget = { kind: 'item', slug: deck.slug, itemId: item.id };
      if (deck.slug !== slug) return redirect(301, publicPath(target), PAGE_CACHE_CONTROL);

      return await answer(deck, target, req, publicPath(target), async (ctx) =>
        itemPage(ctx, { deck, item, ogImage: await share.ogImageFor(item.id) }),
      );
    },

    /**
     * D182: `GET /p/{slug}/search?q=`. Public cards only, always `noindex`, never in the page
     * cache (queries are unbounded); members go to the app's search. `ip` keys the anonymous
     * embedding budgets.
     */
    async searchPage(slug: string, req: PageRequest, ip: string): Promise<PageResponse> {
      const deck = await publicDeckBySlug(slug);
      if (!deck) return notFound();
      const q = (req.q ?? '').trim();
      if ([...q].length > SEARCH_Q_MAX) return badRequest();

      const audience = await audienceOf(deck, req);
      const target: PageTarget = { kind: 'search', slug: deck.slug, q };
      if (audience === 'member') return redirect(302, appPath(target), PRIVATE_CACHE_CONTROL);

      const results = q
        ? await search.retrievePublic(deck, q, PUBLIC_SEARCH_LIMIT_DEFAULT, ip)
        : { data: [], semantic: true };
      const html = searchPage(contextFor(deck, audience), {
        deck,
        q,
        items: results.data.map((hit) => hit.item),
        semantic: results.semantic,
      });
      const cacheControl =
        audience === 'member-public-view' ? PRIVATE_CACHE_CONTROL : SEARCH_PAGE_CACHE_CONTROL;
      return htmlPage(html, cacheControl, true);
    },

    /** D179: communal public decks, their public categories and cards. */
    async sitemap(): Promise<string> {
      const entries: SitemapEntry[] = [];
      for (const deck of await sitemap.communalPublicDecks()) {
        const [cats, cards] = await Promise.all([
          sitemap.publicCategories(deck.id),
          sitemap.publicItems(deck.id),
        ]);
        const newest = cards.reduce<Date | null>(
          (max, c) => (max && max >= c.updatedAt ? max : c.updatedAt),
          null,
        );
        entries.push({
          loc: publicUrl(origin, { kind: 'deck', slug: deck.slug }),
          lastmod: newest,
        });
        for (const cat of cats) {
          entries.push({
            loc: publicUrl(origin, { kind: 'category', slug: deck.slug, category: cat.slug }),
            lastmod: cat.lastmod,
          });
        }
        for (const card of cards) {
          entries.push({
            loc: publicUrl(origin, { kind: 'item', slug: deck.slug, itemId: card.id }),
            lastmod: card.updatedAt,
          });
        }
      }
      return sitemapXml(entries);
    },

    robots(): string {
      return robotsTxt(origin);
    },
  };
}

export type PublicPagesService = ReturnType<typeof createPublicPagesService>;
