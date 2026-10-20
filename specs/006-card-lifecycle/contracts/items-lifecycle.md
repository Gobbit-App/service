# Contract: Item lifecycle routes (006)

All routes are under the API root (the web reaches it at `/api`, stripped by Caddy). Auth is a session (`gobbit_session` cookie or `Authorization: Bearer`); `ing_` ingest tokens get 401 (ADR-046). Errors are `application/problem+json` (RFC 9457). The responses below are in addition to the usual 400 `/problems/validation`, 401 and 404 (the deck or card doesn't exist, or the caller can't see it). Schemas come from `@pb/shared` (`itemSchema`, `itemPageSchema`, `itemListQuerySchema`); run `pnpm api:openapi` after the route changes.

The service methods behind every route take an `Actor` (`{ user, via: 'session' }`, D130). The routes add nothing beyond parsing.

## New

### `POST /items/{id}/restore`: archived → published (D131)

| | |
|---|---|
| Permission | `item.archive` (owner, maintainer, editor) |
| Body | none |
| 200 | `Item`, with `status: 'published'`. `verifiedAt` unchanged, `updatedAt` bumped. Already published → 200 with no write. |
| 403 `/problems/forbidden` | role lacks `item.archive` |
| 409 `/problems/invalid-transition` | card is a proposal |

The card is re-embedded only if stale (`embedQueue.enqueueIfStale()` after commit, as on every write; the embedding survives archive).

### `POST /items/{id}/undelete`: clear `deleted_at` (D132)

| | |
|---|---|
| Permission | `item.delete` (owner, maintainer) |
| Body | none |
| 200 | `Item` with its previous `status`, categories, `verifiedAt`; `deletedAt` absent. Live card → 200 with no write. |
| 403 `/problems/forbidden` | role lacks `item.delete` |
| 404 `/problems/not-found` | no such row, a deleted **proposal** (review-owned, D106), or already purged |
| 410 `/problems/undo-expired` | `deleted_at < now − ITEM_UNDELETE_DAYS` (30) and not yet purged |
| 422 `/problems/item-needs-category` | published card has no category left (D95 trigger; not reachable through today's routes) |

## Changed

### `GET /decks/{id}/items?status=deleted`

- `status` accepts `proposed | published | archived | deleted` (default `published`). `deleted` is a list-only value (`itemListStatuses`); the DB enum is unchanged.
- With `status=deleted`:
  - Permission `item.delete`; otherwise 403 `/problems/forbidden` (other statuses keep their current rules).
  - Returns deleted cards, any status except `proposed`, with `deleted_at ≥ now − 30 days`, ordered `deletedAt desc, id desc`. `cursor` and `limit` work as on the other statuses (limit ≤ 50); the cursor encodes `(deletedAt, id)`.
  - `category`, `type` and `favorite` filters still apply. Private categories stay hidden from roles that can't see them (`itemHasVisibleCategory`).
  - Each `Item` carries `deletedAt` (ISO string). Other statuses omit it.

```json
{
  "data": [
    { "id": "…", "status": "published", "title": "Bin day", "verifiedAt": "2026-09-01T08:00:00.000Z", "deletedAt": "2026-10-17T19:02:11.412Z", "…": "…" }
  ],
  "nextCursor": null
}
```

### `PATCH /items/{id}`

- `status: 'published'` on an **archived** card → 409 `/problems/use-restore` ("Use POST /items/{id}/restore"). No fields are written, even if others were sent.
- `status: 'archived'` follows the same rules as `POST /items/{id}/archive`, including 409 on a proposal.
- Other patches are unchanged. `verified_at` is never set by PATCH (D131).

### `POST /items/{id}/archive`

- 409 `/problems/invalid-transition` when the card is a proposal (it used to succeed).
- Otherwise unchanged: `item.archive`, 200 `Item`, idempotent.

### `DELETE /items/{id}`

- Unchanged: `item.delete`, 204, soft delete. A second DELETE is 404, because deleted rows are invisible to `findById`.

## Problem types added

| Type | Status | Helper |
|------|--------|--------|
| `/problems/invalid-transition` | 409 | `conflict(detail, '/problems/invalid-transition')` |
| `/problems/use-restore` | 409 | `conflict(detail, '/problems/use-restore')` |
| `/problems/undo-expired` | 410 | new `gone(detail, type)` in `errors/http-errors.ts` |

Web copy for each is added in `apps/web/src/api/problem-messages.ts`.

## Worker

| Queue | Schedule | Policy | Effect |
|-------|----------|--------|--------|
| `prune-deleted-items` (`QUEUES.pruneDeletedItems`) | `DELETED_ITEM_PRUNE_CRON = '0 5 * * 0'` | singleton | `DELETE FROM items WHERE deleted_at < now() − 30 days`. Returns the count, which is logged. FKs cascade or set null (`data-model.md`). |
