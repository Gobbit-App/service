# Data Model: Public read API for public decks

No migration. This feature reads existing columns and adds DTOs.

## Existing columns used

| Table | Column | Use |
|-------|--------|-----|
| `decks` | `kind`, `slug`, `name`, `is_public`, `deleted_at` | Public deck rule: `is_public AND kind <> 'personal' AND deleted_at IS NULL` |
| `categories` | `slug`, `name`, `visibility`, `position`, `is_default`, `deleted_at` | Public categories: `visibility = 'public' AND deleted_at IS NULL` |
| `items` | `status`, `deleted_at`, `created_at`, `id` | `status = 'published' AND deleted_at IS NULL`; keyset `(created_at, id)` |
| `item_categories` | `item_id`, `category_id` | Membership in a public category |

Existing indexes cover the reads: `items_list_idx (deck_id, status, created_at DESC, id DESC)` and the category unique index `(deck_id, slug) WHERE deleted_at IS NULL`.

## DTOs (`packages/shared/src/schemas/public.ts`)

### `PublicDeck`

| Field | Type | Notes |
|-------|------|-------|
| `slug` | string | |
| `name` | string | |
| `kind` | `'shared' \| 'communal'` | |
| `categories` | `PublicCategory[]` | Public categories in display order (default first, then `position`) |

### `PublicCategory`

| Field | Type | Notes |
|-------|------|-------|
| `slug` | string | |
| `name` | string | |
| `itemCount` | integer ≥ 0 | Published, live cards in this category |

### `PublicItem`

| Field | Type | Notes |
|-------|------|-------|
| `id` | uuid | |
| `type` | item type | |
| `title` | string | |
| `body` | string | Markdown, ≤ 600 code points |
| `payload` | object | As stored (link preview, image, table, calc) |
| `entities` | object | Extracted facts (phones, addresses) |
| `sourceUrl` | string \| null | |
| `verifiedAt`, `createdAt`, `updatedAt` | ISO timestamp \| null | |
| `categories` | `{ slug, name }[]` | Public categories only, non-empty |

Not included: `createdBy`, `favorite`, `status`, `deckId`, `linkHealth`, review and ingest fields.

### `PublicItemPage`

`{ data: PublicItem[], nextCursor: string | null }` — the same cursor encoding as `ItemPage`.

### `CategoryPatch`

`{ name?: string, visibility?: 'private' | 'shared' | 'public' }`, strict, at least one field.

## Constants (`packages/shared/src/limits.ts`)

| Name | Value | Use |
|------|-------|-----|
| `PUBLIC_READ_PER_HOUR` | 600 | Anonymous reads per IP per hour (D175) |
| `PUBLIC_PAGE_LIMIT_MAX` | 50 | Max `limit` on public lists (default 20) |
