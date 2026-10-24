import {
  htmlLang,
  ogLocale,
  SEARCH_Q_MAX,
  textDirection,
  type PublicCategory,
  type PublicDeck,
  type PublicItem,
} from '@pb/shared';
import { excerpt, OG_DESCRIPTION_MAX } from '../share/excerpt';
import { h, type Html } from './html';
import { layout, SITE_NAME, type PageHead } from './layout';
import { openInAppPath, publicPath, publicUrl, type PageTarget } from './public-url';
import { renderItem, type ImageUrlFor } from './render-item';

/** D177: cards per deck or category page. */
export const PUBLIC_PAGE_SIZE = 20;

/** Excerpt length of a card in a list. */
const LIST_EXCERPT_MAX = 160;

/** Per-request facts every page needs. */
export type PageContext = {
  /** Public origin (`APP_URL`), no trailing slash. */
  origin: string;
  /** D179: `noindex` for shared decks. */
  robots: PageHead['robots'];
  /** D178: a member who asked for `?view=public` sees a note. */
  publicViewNote: boolean;
  imageUrl: ImageUrlFor;
  /** Absolute URL of the static site image (deck and category pages). */
  siteImage: string;
};

type DeckRef = Pick<PublicDeck, 'slug' | 'name'>;

function languageOf(text: string): Pick<PageHead, 'lang' | 'dir' | 'locale'> {
  return { lang: htmlLang(text), dir: textDirection(text), locale: ogLocale(text) };
}

function publicViewNote(ctx: PageContext): Html | string {
  return ctx.publicViewNote
    ? h`<p class="note">You're viewing the public page. Members see more in the app.</p>`
    : '';
}

function openInApp(target: PageTarget): Html {
  return h`<footer><a href="${openInAppPath(target)}">Open in ${SITE_NAME}</a></footer>`;
}

/** D182: a plain GET form, so search works without JavaScript. */
function searchForm(deck: DeckRef, q = ''): Html {
  return h`<form class="search" method="get" action="/p/${encodeURIComponent(deck.slug)}/search" role="search">
<input type="search" name="q" value="${q}" maxlength="${SEARCH_Q_MAX}" required aria-label="Search ${deck.name}" placeholder="Search">
<button type="submit">Search</button>
</form>`;
}

function cardList(deck: DeckRef, items: PublicItem[], empty = 'No cards yet.'): Html {
  if (items.length === 0) return h`<p class="muted">${empty}</p>`;
  return h`<ul class="cards">${items.map((item) => {
    const summary = excerpt(item.body, LIST_EXCERPT_MAX);
    return h`<li><a class="title" href="${publicPath({ kind: 'item', slug: deck.slug, itemId: item.id })}">${item.title}</a>
${summary ? h`<div class="muted">${summary}</div>` : ''}</li>`;
  })}</ul>`;
}

function pager(path: string, nextCursor: string | null): Html | string {
  return nextCursor
    ? h`<p class="pager"><a href="${path}?cursor=${encodeURIComponent(nextCursor)}" rel="next">Older</a></p>`
    : '';
}

export type DeckPageModel = { deck: PublicDeck; items: PublicItem[]; nextCursor: string | null };

export function deckPage(ctx: PageContext, { deck, items, nextCursor }: DeckPageModel): string {
  const target: PageTarget = { kind: 'deck', slug: deck.slug };
  const description = excerpt(
    `${deck.name}: ${deck.categories.map((c) => c.name).join(', ')}`,
    OG_DESCRIPTION_MAX,
  );
  const head: PageHead = {
    title: deck.name,
    description,
    canonical: publicUrl(ctx.origin, target),
    image: ctx.siteImage,
    ogType: 'website',
    robots: ctx.robots,
    ...languageOf(deck.name),
  };
  return layout(
    head,
    h`${publicViewNote(ctx)}<h1>${deck.name}</h1>
${searchForm(deck)}
<nav class="cats" aria-label="Categories">${deck.categories.map(
      (c) =>
        h`<a href="${publicPath({ kind: 'category', slug: deck.slug, category: c.slug })}">${c.name} <span class="muted">${c.itemCount}</span></a>`,
    )}</nav>
${cardList(deck, items)}
${pager(publicPath(target), nextCursor)}
${openInApp(target)}`,
  );
}

export type CategoryPageModel = {
  deck: DeckRef;
  category: PublicCategory;
  items: PublicItem[];
  nextCursor: string | null;
};

export function categoryPage(
  ctx: PageContext,
  { deck, category, items, nextCursor }: CategoryPageModel,
): string {
  const target: PageTarget = { kind: 'category', slug: deck.slug, category: category.slug };
  const head: PageHead = {
    title: `${category.name} · ${deck.name}`,
    description: excerpt(`${category.name} in ${deck.name}`, OG_DESCRIPTION_MAX),
    canonical: publicUrl(ctx.origin, target),
    image: ctx.siteImage,
    ogType: 'website',
    robots: ctx.robots,
    ...languageOf(`${category.name} ${deck.name}`),
  };
  return layout(
    head,
    h`${publicViewNote(ctx)}<p class="muted"><a href="${publicPath({ kind: 'deck', slug: deck.slug })}">${deck.name}</a></p>
<h1>${category.name}</h1>
${searchForm(deck)}
${cardList(deck, items)}
${pager(publicPath(target), nextCursor)}
${openInApp(target)}`,
  );
}

export type ItemPageModel = { deck: DeckRef; item: PublicItem; ogImage: string };

export function itemPage(ctx: PageContext, { deck, item, ogImage }: ItemPageModel): string {
  const target: PageTarget = { kind: 'item', slug: deck.slug, itemId: item.id };
  const head: PageHead = {
    title: item.title,
    description: excerpt(item.body, OG_DESCRIPTION_MAX) || item.title,
    canonical: publicUrl(ctx.origin, target),
    image: ogImage,
    ogType: 'article',
    robots: ctx.robots,
    ...languageOf(`${item.title} ${item.body}`),
  };
  return layout(
    head,
    h`${publicViewNote(ctx)}<p class="muted"><a href="${publicPath({ kind: 'deck', slug: deck.slug })}">${deck.name}</a></p>
${renderItem(item, ctx.imageUrl)}
${
  item.categories.length > 0
    ? h`<nav class="cats" aria-label="Categories">${item.categories.map(
        (c) =>
          h`<a href="${publicPath({ kind: 'category', slug: deck.slug, category: c.slug })}">${c.name}</a>`,
      )}</nav>`
    : ''
}
${openInApp(target)}`,
  );
}

export type SearchPageModel = {
  deck: DeckRef;
  /** Trimmed query; empty → the form alone. */
  q: string;
  items: PublicItem[];
  /** Whether the meaning arm ran; false → "text matches only". */
  semantic: boolean;
};

/** D182: `/p/{slug}/search`. Always `noindex` (queries are unbounded). */
export function searchPage(
  ctx: PageContext,
  { deck, q, items, semantic }: SearchPageModel,
): string {
  const target: PageTarget = { kind: 'search', slug: deck.slug, q };
  const title = q ? `${q} · ${deck.name}` : `Search · ${deck.name}`;
  const head: PageHead = {
    title,
    description: excerpt(`Search ${deck.name}`, OG_DESCRIPTION_MAX),
    image: ctx.siteImage,
    ogType: 'website',
    robots: 'noindex',
    ...languageOf(`${q} ${deck.name}`),
  };
  return layout(
    head,
    h`${publicViewNote(ctx)}<p class="muted"><a href="${publicPath({ kind: 'deck', slug: deck.slug })}">${deck.name}</a></p>
<h1>Search</h1>
${searchForm(deck, q)}
${
  q
    ? h`${semantic ? '' : h`<p class="muted">Text matches only.</p>`}
${cardList(deck, items, 'No public cards match.')}`
    : ''
}
${openInApp(target)}`,
  );
}

function messagePage(title: string, message: string): string {
  return layout(
    {
      title,
      description: message,
      ogType: 'website',
      robots: 'noindex',
      lang: 'en',
      dir: 'ltr',
      locale: 'en_US',
    },
    h`<h1>${title}</h1><p>${message}</p><p><a href="/">${SITE_NAME}</a></p>`,
  );
}

/** One page for every "not public" reason, so it leaks nothing (D174). */
export function notFoundPage(): string {
  return messagePage('Not found', "This page doesn't exist or isn't public.");
}

export function rateLimitedPage(): string {
  return messagePage('Too many requests', 'Please wait a little and try again.');
}

export function badRequestPage(): string {
  return messagePage('Bad request', "That link isn't valid. Go back to the first page.");
}
