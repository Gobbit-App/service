# Data model: Card lifecycle (006)

No new tables or columns. The lifecycle uses existing `items` columns (`packages/db/src/schema/items.ts`):

| Column | Type | Meaning in this feature |
|--------|------|-------------------------|
| `status` | `item_status` enum `proposed \| published \| archived` | Where the card is. Unchanged by delete and undelete. |
| `verified_at` | timestamptz, nullable | Publish date (D13 amended, #32). Set on create-as-published and on proposal publish only (D131). |
| `deleted_at` | timestamptz, nullable | Soft delete (ADR-005). Non-null = deleted; every read path filters `deleted_at IS NULL`. |
| `updated_at` | timestamptz | Bumped by the existing trigger on `status` and `deleted_at` changes (0009). |

## State machine

A card's state is `(status, deleted)`. Deleted is orthogonal: undelete returns the status the card had.

```text
             create(published)                     publish (review)
   ───────────────────────────► published ◄─────────────────────── proposed ◄── ingest / proposeDirect
                                 │     ▲                               │
                        archive  │     │ restore                       │ discard / publish{update}
                                 ▼     │                               ▼
                                archived                         proposed + deleted (not undeletable)

   published | archived ── remove ──► same status + deleted ── undelete (≤ 30 days) ──► same status
   any + deleted, deleted_at < now − 30 days ── prune-deleted-items ──► row removed
```

## Transitions

| From → To | Service method / route | Permission | `verified_at` | Other rules |
|-----------|------------------------|------------|---------------|-------------|
| — → published | `create` / `POST /decks/{id}/items` | `item.create` | now | ≥ 1 category (D95 trigger); unchanged |
| — → proposed | ingest worker, `ingest.service.proposeDirect` | per Phase 5 | null | unchanged |
| proposed → published | `review.service.publish` / `POST /items/{id}/publish` | `item.publish` | now | unchanged |
| published → published (edit) | `update` / `PATCH /items/{id}` | `item.update` | unchanged | content edits; 007 adds the UI |
| published → archived | `archive` / `POST /items/{id}/archive`, or `PATCH status:'archived'` | `item.archive` | unchanged | already archived → 200, no write |
| proposed → archived | — | — | — | 409 `/problems/invalid-transition` |
| archived → published | `restore` / `POST /items/{id}/restore` | `item.archive` | **unchanged** | already published → 200, no write; `PATCH status:'published'` → 409 `/problems/use-restore` |
| proposed → restore | — | — | — | 409 `/problems/invalid-transition` |
| published \| archived → deleted | `remove` / `DELETE /items/{id}` | `item.delete` | unchanged | 204 |
| proposed → deleted | `review.service.discard`, `publish{mode:'update'}` | `item.publish` | — | unchanged (D106); excluded from listing and undelete |
| deleted → previous status | `undelete` / `POST /items/{id}/undelete` | `item.delete` | unchanged | `deleted_at ≥ now − 30 d`, else 410 `/problems/undo-expired`; live card → 200 no write; deleted proposal → 404 |
| deleted, > 30 d → removed | `prune-deleted-items` job | worker | — | hard delete; FK effects below |

Undelete re-runs the deferred D95 trigger (`AFTER UPDATE OF status, deleted_at`). It passes because soft delete never removes `item_categories` rows.

## Index (migration `0011_item_lifecycle`)

```sql
CREATE INDEX items_deleted_idx ON items (deck_id, deleted_at DESC, id DESC) WHERE deleted_at IS NOT NULL;
```

Declared in the Drizzle schema (`index('items_deleted_idx').on(...).where(sql\`deleted_at IS NOT NULL\`)`), generated with `pnpm db:generate`. Down file `packages/db/migrations/down/0011_item_lifecycle.down.sql`: `DROP INDEX IF EXISTS items_deleted_idx;`. It serves both the deleted listing (per deck) and the purge (scan of `deleted_at < cutoff`, small).

## Hard purge: FK effects (no migration needed)

| Referencing table | FK | Effect when the item row is removed |
|-------------------|----|-------------------------------------|
| `item_categories` | composite `(item_id, deck_id)` | cascade |
| `favorites` | `item_id` | cascade |
| `og_images` | `item_id` | cascade |
| `ingest_jobs` | `result_item_id` | set null |
| `llm_calls` | `item_id` | set null |

The embedding lives on the `items` row and goes with it. Cloudinary assets of image cards are not removed (Phase 7 orphan sweep; see plan "Settle before starting").

## DTO changes (`@gobbit/shared`)

- `itemListQuerySchema.status`: `z.enum([...itemStatuses, 'deleted']).default('published')` (`itemListStatuses`).
- `Item` (`itemSchema`): optional `deletedAt: string (ISO) | null`, present only in the deleted listing.
- `items/constants.ts` (subpath `@gobbit/shared/item-constants`, like `ingest/constants.ts`): `ITEM_UNDELETE_DAYS = 30`, `DELETED_ITEM_PRUNE_CRON = '0 5 * * 0'`.
- Web helper `daysLeft(deletedAt, now)` = `max(0, floor(30 − (now − deletedAt)/1 day))`.
