# Data Model: Browse mode

**Feature**: [spec.md](./spec.md) · **Plan**: [plan.md](./plan.md)

There is no server-side change: no table, column, migration or DTO. Browse reads the existing `Item` and `Category` DTOs (`packages/shared/src/schemas/item.ts`, `category.ts`) through the existing `itemsQuery` and `categoriesQuery`. Everything below is client state.

## 1. URL search params: `BrowseSearch`

Route `/d/$slug/browse`, validated in `apps/web/src/browse/browse-params.ts`. A local Zod schema is fine here; this is UI state, not an API contract.

| Param | Type | Default | Invalid / unknown value |
|-------|------|---------|-------------------------|
| `c` | `'all'` \| category slug (string, 1–64) | `'all'` | Slug not in the deck's visible categories → `'all'` (resolved after `categoriesQuery` loads) |
| `i` | item id (uuid) | absent → first card | Not found within 5 pages → first card + notice "That card isn't available here" |
| `pane` | `'content'` \| `'details'` \| `'source'` | `'content'` | → `'content'` |

```ts
// shape only
type BrowseSearch = { c: 'all' | string; i?: string; pane: 'content' | 'details' | 'source' };
```

- **Mapping to the list filter**: `c === 'all'` → `{ kind: 'all' }`; otherwise → `{ kind: 'category', slug: c }`. These are the existing `ItemFilter` values in `api/query-keys.ts`, so Browse uses the same query key `['items', slug, filter]` as the list. `favorites` and `archived` are never produced (spec Assumptions).
- **Updates**:
  - Card, category and pane changes all use `navigate({ search, replace: true })`.
  - A category change clears `i`.
  - A pane change keeps `i`.
- **Entry from the list**: `navigate({ to: '/d/$slug/browse', search: { c, i: firstVisibleId }, state: { fromList: true } })`. This is a push, so exactly one history entry is added.

## 2. In-memory position state (`BrowseScreen`)

| Field | Source | Notes |
|-------|--------|-------|
| `categories` | `['all', ...orderChips(categories).map(slug)]` | Header order (`category-cycle.ts`) |
| `items` | `data.pages.flatMap(p => p.items)` from `useInfiniteQuery(itemsQuery(...))` | Shared cache with the list; persisted for offline use |
| `currentId` | `IntersectionObserver` (threshold 0.6) → item id | Source of truth is the id, not the index, so data refreshes and rotation keep the card |
| `currentIndex` | derived: `items.findIndex(id)` | Drives ±1 mounting and "n of N" |
| `total` | `hasNextPage ? null : items.length` | Shown as "n of N" when known, else "n" |
| `notice` | deep-link seek failed | Cleared on the next card change |

- **Prefetch rule**: when `currentIndex >= items.length - 3` and `hasNextPage` and not already fetching, call `fetchNextPage()`.
- **Seek rule** (deep link with `i`): while `i` isn't loaded and `hasNextPage` and fewer than 5 pages are loaded, call `fetchNextPage()`. After that, give up and show the notice.

## 3. Return entry: `sessionStorage` `gobbit:browse-return`

`apps/web/src/browse/browse-return.ts`. Session-scoped, because it only bridges one Browse → list hop.

```ts
type BrowseReturn = { deckSlug: string; filterKey: string; itemId: string }; // JSON
// filterKey: 'all' | 'category:<slug>'
```

- **Write**: on a settled card change, debounced to 300 ms.
- **Read once and clear**: `ItemList` does this on mount when the entry matches its `deckSlug` and filter. It scrolls the `<article>` containing `#card-title-<itemId>` into view (`block: 'center'`), which overrides the D65 pathname-keyed restore.
- **Failure handling**: storage errors and malformed JSON → `null`, so the list keeps its normal scroll restoration.

## 4. First-run hint flag: `localStorage` `gobbit:browse-hint:v1`

`apps/web/src/browse/hint-store.ts`, following `lib/last-deck.ts` (`KeyValueStore` injection, `defaultStore()` with try/catch).

| Value | Meaning |
|-------|---------|
| absent | Show the overlay on open |
| `'dismissed'` | Never show it again on this device |

- Storage unavailable (private mode, quota) → the overlay shows each time. This is acceptable, and it never throws.
- The `v1` suffix lets a later redesign of the zones show the overlay again.

## 5. Derived view data (no storage)

- **Details pane**:
  - `item.entities`, grouped by kind via `cards/EntityChips` (moved there by `007-card-editor`).
  - The category names come from `item.categoryIds` mapped through `categoriesQuery`, and the type label from `item.type`.
  - Empty entities → "No details found for this card."
- **Source pane**:
  - `sourceKindLabel(item.sourceKind)` (`source-kind.ts`; manual/link/share/email/telegram/import/mcp).
  - `item.sourceUrl`: host as link text, full URL as `href`, `rel="noopener noreferrer"`.
  - `cardAge(item)` for added/edited.
  - `item.verifiedAt` → "Published " + `relativeTime(verifiedAt)`, omitted when null.
