# Data model: Card avatar (044)

## Migration `0025_card_avatar`

One table changes; nothing is backfilled, because existing cards get no avatar (spec edge case).

### `items` (changed)

| Column | Type | Null | Notes |
|--------|------|------|-------|
| `avatar` | `jsonb` | yes | `{ "publicId": string, "width"?: int, "height"?: int }`; `NULL` = no avatar (D386). `width`/`height` are copied from the asset row at write time (D388) |

Constraints and indexes:

- `items_avatar_chk` (CHECK, D387):
  ```text
  avatar IS NULL
  OR (
    type::text IN ('text', 'reminder', 'event', 'table', 'calc')
    AND jsonb_typeof(avatar) = 'object'
    AND jsonb_typeof(avatar->'publicId') = 'string'
    AND char_length(avatar->>'publicId') BETWEEN 1 AND 255
    AND (NOT avatar ? 'width'  OR jsonb_typeof(avatar->'width')  = 'number')
    AND (NOT avatar ? 'height' OR jsonb_typeof(avatar->'height') = 'number')
  )
  ```
  The CHECK uses `type::text` like `items_reveal_at_chk`, and the type list matches
  `avatarItemTypes`.
- `items_avatar_public_id_idx`: btree on `((avatar->>'publicId')) WHERE avatar IS NOT NULL`, which
  the sweep's reference lookup uses (D389).

Unchanged on purpose:

- `item_search_text()`, the generated `search_text` and the embedding hash. The avatar isn't text
  (spec Assumptions).
- `payload` CHECKs. The avatar isn't in the payload, so `items_payload_size_chk` doesn't count it.
  The column CHECK bounds its size instead (FR-009).
- `item_events`: `changes` is a free `text[]`, and the new value `avatar` needs no migration (D390).

Down file `packages/db/migrations/down/0025_card_avatar.down.sql` drops the index, the CHECK and the
column. Dropping the column loses the avatars, which is acceptable for a rollback, and their assets
then become unreferenced and are swept after the grace period.

Drizzle: `packages/db/src/schema/items.ts` gains
`avatar: jsonb().$type<CardAvatar | null>()`, plus the check and the index. `itemColumns` picks it up,
so every member read path (list, search, review, card page) returns it without query changes.

## Shared types (`@gobbit/shared`)

- `card-avatar` subpath (zod-free, for the web):
  - `avatarItemTypes`;
  - `supportsAvatar(type: ItemType): boolean`;
  - `type CardAvatar = { publicId: string; width?: number; height?: number }`.
- `schemas/item.ts`:
  - `cardAvatarSchema` (output): `{ publicId, width?, height? }`.
  - `avatarInputSchema` (input): `z.object({ publicId: z.string().min(1).max(255) }).strict()`.
    Dimensions are refused on input (D388).
  - `itemSchema.avatar`: `cardAvatarSchema.nullable()`.
  - The create variants gain `avatar: avatarInputSchema.optional()` on the shared base.
    Type support is checked in the service so the error names the field (D387).
  - `itemPatchSchema.avatar`: `avatarInputSchema.nullable().optional()`.
- `events/constants.ts`: `itemEventFields` gains `'avatar'` (D390).

## Entity: card avatar

| Property | Rule | Enforced in |
|----------|------|-------------|
| At most one per card | single column | DB |
| Only on text, reminder, event, table, calc | `items_avatar_chk`; 422 `avatar` | DB + `items.service` |
| References an asset recorded for the card's deck | `assets.byPublicId(id).deckId === item.deckId`, else 422 `avatar.publicId` | `items.service` via `createAvatarReference` (D388) |
| Dimensions are the asset's | copied from `assets.width/height`; input schema refuses them | service + shared schema |
| Keeps its image from clean-up while the card exists (any status, incl. soft-deleted) | `unreferenced` predicate | `assets.repo` (D389) |
| Never set by ingestion or import | no input path | by construction (D394) |
| Never in public DTOs | `toPublicItem` allow-list | `public-dtos.ts` (D394) |

### State transitions

```text
none ──add (create or PATCH {avatar:{publicId}})──▶ set
set  ──replace (PATCH {avatar:{publicId'}})───────▶ set'   (old asset becomes unreferenced → swept after grace)
set  ──remove (PATCH {avatar:null})───────────────▶ none   (asset unreferenced → swept after grace)
any  ──archive / delete / undelete────────────────▶ unchanged (asset stays referenced until purge)
set  ──purge (prune-deleted-items, day 30)────────▶ row gone (asset unreferenced → swept after grace)
```

Each user-made add, replace or remove writes one `item_events` `updated` row with `changes ∋
'avatar'`, in the same transaction (ADR-057). A no-op PATCH (same `publicId`) writes nothing.

## Web draft (`apps/web/src/editor/draft.ts`)

| Field | Type | Notes |
|-------|------|-------|
| `Draft.avatar` | `CardAvatar \| null \| undefined` | `undefined` in drafts saved before 044 = unchanged; `withType` clears it for link/image (D392) |
