# Data model: Card cover image (044)

## Migration `0025_card_cover`

One table changes; nothing is backfilled, because existing cards get no cover image (spec edge case).

### `items` (changed)

| Column | Type | Null | Notes |
|--------|------|------|-------|
| `cover` | `jsonb` | yes | `{ "publicId": string, "width"?: int, "height"?: int }`; `NULL` = no cover image (D386). `width`/`height` are copied from the asset row at write time (D388) |

Constraints and indexes:

- `items_cover_chk` (CHECK, D387):
  ```text
  cover IS NULL
  OR (
    type::text IN ('text', 'reminder', 'event', 'table', 'calc')
    AND jsonb_typeof(cover) = 'object'
    AND jsonb_typeof(cover->'publicId') = 'string'
    AND char_length(cover->>'publicId') BETWEEN 1 AND 255
    AND (NOT cover ? 'width'  OR jsonb_typeof(cover->'width')  = 'number')
    AND (NOT cover ? 'height' OR jsonb_typeof(cover->'height') = 'number')
  )
  ```
  The CHECK uses `type::text` like `items_reveal_at_chk`, and the type list matches
  `coverItemTypes`.
- `items_cover_public_id_idx`: btree on `((cover->>'publicId')) WHERE cover IS NOT NULL`, which
  the sweep's reference lookup uses (D389).

Unchanged on purpose:

- `item_search_text()`, the generated `search_text` and the embedding hash. The cover image isn't text
  (spec Assumptions).
- `payload` CHECKs. The cover image isn't in the payload, so `items_payload_size_chk` doesn't count it.
  The column CHECK bounds its size instead (FR-009).
- `item_events`: `changes` is a free `text[]`, and the new value `cover` needs no migration (D390).

Down file `packages/db/migrations/down/0025_card_cover.down.sql` drops the index, the CHECK and the
column. Dropping the column loses the cover images, which is acceptable for a rollback, and their assets
then become unreferenced and are swept after the grace period.

Drizzle: `packages/db/src/schema/items.ts` gains
`cover: jsonb().$type<CardCover | null>()`, plus the check and the index. `itemColumns` picks it up,
so every member read path (list, search, review, card page) returns it without query changes.

## Shared types (`@gobbit/shared`)

- `card-cover` subpath (zod-free, for the web):
  - `coverItemTypes`;
  - `supportsCover(type: ItemType): boolean`;
  - `type CardCover = { publicId: string; width?: number; height?: number }`.
- `schemas/item.ts`:
  - `cardCoverSchema` (output): `{ publicId, width?, height? }`.
  - `coverInputSchema` (input): `z.object({ publicId: z.string().min(1).max(255) }).strict()`.
    Dimensions are refused on input (D388).
  - `itemSchema.cover`: `cardCoverSchema.nullable()`.
  - The create variants gain `cover: coverInputSchema.optional()` on the shared base.
    Type support is checked in the service so the error names the field (D387).
  - `itemPatchSchema.cover`: `coverInputSchema.nullable().optional()`.
- `events/constants.ts`: `itemEventFields` gains `'cover'` (D390).

## Entity: card cover image

| Property | Rule | Enforced in |
|----------|------|-------------|
| At most one per card | single column | DB |
| Only on text, reminder, event, table, calc | `items_cover_chk`; 422 `cover` | DB + `items.service` |
| References an asset recorded for the card's deck | `assets.byPublicId(id).deckId === item.deckId`, else 422 `cover.publicId` | `items.service` via `createCoverReference` (D388) |
| Dimensions are the asset's | copied from `assets.width/height`; input schema refuses them | service + shared schema |
| Keeps its image from clean-up while the card exists (any status, incl. soft-deleted) | `unreferenced` predicate | `assets.repo` (D389) |
| Never set by ingestion or import | no input path | by construction (D394) |
| Never in public DTOs | `toPublicItem` allow-list | `public-dtos.ts` (D394) |

### State transitions

```text
none ──add (create or PATCH {cover:{publicId}})──▶ set
set  ──replace (PATCH {cover:{publicId'}})───────▶ set'   (old asset becomes unreferenced → swept after grace)
set  ──remove (PATCH {cover:null})───────────────▶ none   (asset unreferenced → swept after grace)
any  ──archive / delete / undelete────────────────▶ unchanged (asset stays referenced until purge)
set  ──purge (prune-deleted-items, day 30)────────▶ row gone (asset unreferenced → swept after grace)
```

Each user-made add, replace or remove writes one `item_events` `updated` row with `changes ∋
'cover'`, in the same transaction (ADR-057). A no-op PATCH (same `publicId`) writes nothing.

## Web draft (`apps/web/src/editor/draft.ts`)

| Field | Type | Notes |
|-------|------|-------|
| `Draft.cover` | `CardCover \| null \| undefined` | `undefined` in drafts saved before 044 = unchanged; `withType` clears it for link/image (D392) |
