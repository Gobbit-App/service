# Public decks (Phase 8, `specs/016-public-read-api`, `specs/017-public-pages`, `specs/018-public-search`, ADR-056)

A shared or communal deck can publish some of its categories to anyone. Strangers read them without
signing in; members keep using `/decks/...`.

## Making a deck public (D176)

- `PATCH /decks/{id}` with `isPublic` needs role `owner` (co-owners included). A maintainer gets 403
  `/problems/owner-required` but can still change the deck's other fields. The personal deck answers
  409 `/problems/personal-deck`.
- `PATCH /decks/{id}/categories/{categoryId}` (`category.update`: owner, maintainer) takes
  `{ name?, visibility? }`, strict, at least one field. The slug never changes, so public URLs stay
  stable. The default category can change visibility and stays the default.

## Deck rule and reads (D174)

- `public-deck.service.resolvePublicDeck(slug)`: the deck must be live, `is_public`, not `personal`
  and not the default (personal) deck. Everything else, an unknown slug included, is the member
  routes' 404 `"Deck not found"`, so the answer leaks nothing.
- Reads use the member repositories with `role = null`: `visibleCategoriesWhere(null)` keeps only
  `public` categories. The service fixes `status = 'published'` and live rows; the query can't change them.
- Routes (`routes/public.ts`, `security: []`, tag `public`):
  - `GET /public/{slug}`: `PublicDeck` with public categories and their published card counts
    (`categories.repo.countPublished`).
  - `GET /public/{slug}/items?category=&cursor=&limit=`: newest first, member cursor format,
    `limit` ≤ `PUBLIC_PAGE_LIMIT_MAX` (50). A category slug that isn't public is a 404
    `"Category not found"`.
  - `GET /public/{slug}/items/{itemId}`: one card; a hidden, foreign or malformed id is a 404
    `"Item not found"`.
- Every answer carries `Cache-Control: public, max-age=60`.

## DTO allow-list

`toPublicItem` (`services/public-dtos.ts`) copies only `id, type, title, body, payload, entities,
sourceUrl, verifiedAt, createdAt, updatedAt` and the card's public categories as `{ slug, name }`.
No author, favourite, status, deck id, link health or review/ingest fields. A unit test pins the key
set to `publicItemSchema`.

## Caller identity

`/public/*` is in `CREDENTIAL_FREE_PREFIXES`: session-auth doesn't look at the cookie or bearer, so a
member gets the stranger's answer and a stale or bad credential never fails the request.

## Anonymous limiter (D175)

`lib/anon-rate-limiter.ts`: an `lru-cache` of fixed one-hour windows per key (max 10,000 keys, TTL one
hour). `middleware/public-rate-limit.ts` applies it to `/public/*` keyed by
`clientIp(c, CLIENT_IP_HEADER)`, at `PUBLIC_READ_PER_HOUR` (600). Over the limit: 429
`/problems/rate-limited` with `Retry-After`. It never touches the database, and it is per API
instance (one instance today). The limiter is injectable through `createApp({ anonLimiter })`.

## Public pages (017, D177)

- Routes (`routes/public-pages.ts`, plain `app.get`, outside OpenAPI): `GET /p/{slug}` (public
  categories + newest 20 cards, "Older" link by cursor), `GET /p/{slug}/c/{category}` and
  `GET /p/{slug}/i/{itemId}`. Caddy and the Vite dev proxy send `/p/*`, `/sitemap.xml` and
  `/robots.txt` to the API; the service worker's navigation fallback skips them.
- `services/public-pages.service.ts` reads through `public-deck.service` (`summaryFor`, `listFor`,
  `itemById`), so the deck rule, `role = null` filter and allow-list DTO are the same as `/public/*`.
- Rendering lives in `apps/api/src/public/`: `html.ts` (`hono/html`, escaped by default), `markdown.ts`
  (`micromark`, raw HTML and dangerous protocols off), `render-item.ts` (one renderer per card type;
  stored images through the media store's delivery URL), `pages.ts`, `layout.ts`, `styles.ts`
  (inline CSS, no JavaScript), `seo.ts` (OG/Twitter tags, canonical, sitemap and robots).
- Every public URL comes from `publicUrl(origin, target)` / `publicPath(target)` in `public-url.ts`;
  `appPath(target)` gives the member route.
- Card pages use the card's share image (`share.ogImageFor`, the same image `/s/` renders); deck and
  category pages use the site image.
- Answers: unknown deck, private deck, hidden category, hidden or foreign card and malformed ids all
  get one identical 404 page (`public, max-age=60`, `X-Robots-Tag: noindex`). A card asked for
  under another slug is a 301 to its current address. A malformed cursor is a 400 page. The anonymous
  limiter answers an HTML 429 with `Retry-After` on `/p/*` (`onLimited`); the budget is shared with
  `/public/*`.

The landing page (`/welcome`, and `/` without a session cookie) reuses this layout and escaping;
see [waitlist](waitlist.md#landing-page-030-d226d230-d242-adr-063).

## Member redirect (D178)

`/p/` is a lenient session path: a valid cookie or bearer sets `c.var.user`, a stale cookie is ignored.
If the user has any role on the deck (owner account or accepted membership), pages answer 302 to
`/d/{slug}`, `/d/{slug}/c/{category}` or `/i/{id}` with `private, no-store`. `?view=public` renders
the stranger's page with a "You're viewing the public page" note, also `private, no-store` and never
cached. Every page sends `Vary: Cookie`.

## Indexing (D179)

- Communal public decks: pages are indexable; `/sitemap.xml` (`repositories/sitemap.repo.ts`) lists the
  deck page, each public category and each public card with `lastmod` (card `updated_at`; deck and
  category = newest card).
- Shared public decks: reachable, `<meta name="robots" content="noindex">` and `X-Robots-Tag: noindex`,
  never in the sitemap.
- `/robots.txt` disallows the app and API paths and points at the sitemap.

## Page cache and purge (D180)

`public/page-cache.ts`: an `lru-cache` (500 entries, 5 minutes) of rendered anonymous 200 pages, keyed
by a per-deck generation plus path and normalised query. `purgeDeck(deckId)` bumps the generation;
`buildServices` passes it to the items (create, update, archive, restore, remove, undelete), review
(publish), categories (create, update) and decks (update, delete) services, which call it after
commit. HTTP: `public, max-age=300` for pages, the sitemap and robots.txt.

## Share links (D181)

`/s/{id}` for a public card (public deck, not personal, card visible to strangers) answers 302 to
`publicUrl(.., /p/{slug}/i/{id})` with the share cache header (`share.publicTarget`). Private mode is
unchanged.

## Analytics on public pages (033, D249)

With `ANALYTICS_SITE_ID` set, the deck, category, card and search pages set `analytics.page` (`{ pattern, screen }`, e.g. `/p/:deck/i/:item`, "Public card") on their head, and share previews of private cards (`/s/:item`) do the same. `layout()` then renders `<script defer src="/analytics/page.js" data-pattern data-screen>` before Umami's tag (`data-before-send`, `data-exclude-search`). `page.js` sends page views only: pattern, screen name, referrer origin, no id, no events, nothing offline. Error pages, the sitemap and robots never carry it. The share preview's instant redirect may win the race against the view (best effort).

## Public search (018, D182)

- `GET /public/{slug}/search?q=&limit=` (OpenAPI, `limit` 1–20, default 10) answers
  `{ data: [{ item: PublicItem, why, score }], semantic }` with `public, max-age=60`; a deck that is not
  public is the 016 404. `/public/{slug}/ask` doesn't exist.
- `GET /p/{slug}/search?q=` renders the results (10) under a search form; deck and category pages carry
  the same GET form. The page is always `noindex`, `public, max-age=60`, `Vary: Cookie`, and never in
  the page cache. An empty `q` renders the form only; a `q` over 200 code points is the 400 page;
  members get a 302 to `/d/{slug}/search?q=` (`private, no-store`).
- Both run `search.retrievePublic(deck, q, limit, ip)`; see [search](search.md#public-search-018-d182-d183)
  for budgets and logging.
- Limits: searches count in the read bucket and in their own in-process per-IP bucket
  (`PUBLIC_SEARCH_PER_HOUR` = 120); over it the JSON route answers the 429 problem and the page the HTML 429.

## Deviations from the 016 plan

- **404 body**: the contract shows `type: "about:blank"`. The routes use the existing `notFound()`
  problem (`/problems/not-found`), which is identical to the member routes' 404 as the research asks.
- **Credentials**: rather than marking `/public/` lenient for cookies only, session-auth skips
  `/public/*` entirely, so a bad bearer or an ingest token is ignored too (the contract's
  "a cookie or bearer sent anyway is ignored").
- **Tests**: the category PATCH and owner-only switch tests live in `test/public-settings.int.test.ts`,
  and the stale-cookie test in `test/public-read.int.test.ts`, rather than in `categories.int`,
  `decks.int` and `sessions.int`.
- **Deck rule**: the default deck is excluded as well as `kind = 'personal'`, matching
  `decks.service`'s personal-deck checks.

## Deviations from the 017 plan

- **Sitemap queries**: a dedicated `sitemap.repo` (three narrow queries) instead of
  `public-deck.service.sitemapEntries`/`lastChanged`; it applies the same deck and visibility rules.
- **Only 200 pages are cached**: 404s are cheap and would let a probe fill the cache.
- **Sitemap and robots** are neither cached in-process nor rate-limited; they carry
  `public, max-age=300`.
- **Shared limiter budget**: `/p/*` and `/public/*` share one per-IP budget rather than separate ones.
- **Service worker and Vite proxy**: the plan didn't list them; without the navigation denylist the
  installed PWA would serve the SPA shell for `/p/` links.
- **Link snapshots** (worker process) don't purge the API's in-process cache; the 5-minute TTL bounds
  staleness. Review **discard** doesn't purge: proposals are never public. There is no category delete.
- **Bad bearer on `/p/`**: still a 401 problem (lenient paths only forgive a stale cookie).
- **Refactors**: `public-deck.service` exposes `summaryFor`/`listFor` taking a resolved deck;
  `share.service` gained `publicTarget`, `ogImageFor`, `imageUrl`, `siteImageUrl` and `origin`.
- **Share test**: the "renders once and reuses the image" case moved to the `/p/` card page, since
  `/s/` now redirects public cards.

## Deviations from the 018 plan

- **Search bucket**: a second `AnonRateLimiter` instance mounted on both search paths, after the read
  bucket, rather than a per-route limit inside one limiter (the limit is fixed per instance).
- **Over-long `q` on the page**: the 400 page, like a bad cursor.
- **Search eval (T012)**: the AMKA card and its two pairs are in the fixtures, but the embedding cache
  isn't refreshed yet (no key); the hybrid recall check stays skipped until `pnpm test:search:update`
  runs with a key.
