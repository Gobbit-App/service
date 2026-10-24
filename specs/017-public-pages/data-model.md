# Data Model: Server-rendered public pages

No migration. Pages render 016's DTOs (`PublicDeck`, `PublicItem`, `PublicItemPage`).

## Read additions (`public-deck.service`)

| Method | Returns | Notes |
|--------|---------|-------|
| `itemById(itemId)` | `{ deck, item: PublicItem } \| null` | Card by id in any public deck (for the slug redirect) |
| `sitemapEntries()` | `{ path, lastmod }[]` | Communal public decks only: deck, public categories, public cards |
| `lastChanged(deckId, categoryId?)` | `Date \| null` | Newest `updated_at` of public cards (sitemap `lastmod`) |

Existing indexes cover these: `items_list_idx` for per-deck reads, `decks` slug unique index.

## In-process state

### Page cache (`public/page-cache.ts`)

| Field | Type | Notes |
|-------|------|-------|
| key | `${generation}:${path}?${query}` | Query normalised (sorted keys, only `cursor`) |
| value | `{ status, html, headers }` | Anonymous pages only, never redirects |
| generations | `Map<deckId, number>` | Incremented by `purgeDeck` |

Limits: `PUBLIC_PAGE_CACHE_MAX = 500` entries, `PUBLIC_PAGE_CACHE_TTL_MS = 300_000`.

## View models (`public/pages.ts`)

| Model | Fields |
|-------|--------|
| `PageHead` | `title`, `description`, `canonical`, `image`, `ogType`, `locale`, `lang`, `dir`, `robots` (`index` \| `noindex`) |
| `DeckPageModel` | `deck: PublicDeck`, `items: PublicItem[]`, `nextCursor`, `head` |
| `CategoryPageModel` | `deck`, `category`, `items`, `nextCursor`, `head` |
| `ItemPageModel` | `deck`, `item: PublicItem`, `calcResult?`, `head` |

## Constants

| Name | Value | Use |
|------|-------|-----|
| `PUBLIC_PAGE_SIZE` | 20 | Cards per deck/category page |
| `PUBLIC_PAGE_CACHE_CONTROL` | `public, max-age=300` | Pages, sitemap, robots |
| `PUBLIC_NOT_FOUND_CACHE_CONTROL` | `public, max-age=60` | 404 pages |
