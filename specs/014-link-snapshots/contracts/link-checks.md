# Contract: Link snapshots and link checks

All errors are `application/problem+json` (RFC 9457). Auth: session cookie or `Authorization: Bearer`. Rows not visible to the caller answer 404 (no existence leak), as for other item routes.

## 1. Item DTO — `linkHealth`

Every `Item` (list, single item, search results, review) gains:

```json
"linkHealth": { "status": "dead", "checkedAt": "2026-11-20T06:30:12.345Z" }
```

It is `null` unless the item is a link card with an active flag (status `dead` or `changed`, not dismissed).

Link payloads may carry `preview.publicId`, `preview.width` and `preview.height` (server-owned; see [data-model.md](../data-model.md)).

## 2. `GET /decks/{id}/items?flag=link`

| | |
|---|---|
| Query | Existing list query + `flag=link` (combinable with `category`, `cursor`, `limit`; `status` must be `published` or omitted) |
| Access | `item.update` on the deck |
| 200 | `ItemPage` of flagged, not-dismissed, live published link cards in visible categories, `flagged_at DESC, id` |
| 400 | `flag=link` with `status` ≠ `published`, or with `type` ≠ `link` |
| 403 | Caller can't update items (reader, guest) |
| 404 | Deck not found / not visible |

## 3. `POST /items/{id}/link-check`

Checks one link now.

| | |
|---|---|
| Body | none |
| Access | `item.update` on the item's deck |
| Rate | `LINK_CHECK_RATE_PER_HOUR` (10) per user per hour → 429 with `Retry-After` |
| 200 | Updated `Item` (with `linkHealth` after the check) |
| 404 | Item not found / not visible |
| 422 | Item is not a live link card (`/problems/validation`, "Only link cards can be checked") |
| 429 | Rate limit |

The check applies the same classification and state rules as the sweep (research D164), with one exception: a definite failure from a manual check counts toward the two strikes but **never** marks a link dead on its own, even if it is the second strike. A manual check can confirm an `ok` and clear a flag; only the sweep reaches `dead`. This stops repeated clicks from producing the second strike within seconds.

## 4. `DELETE /items/{id}/link-check/flag`

| | |
|---|---|
| Access | `item.update` |
| 204 | Flag dismissed (`dismissed_at = now()`) |
| 404 | Item not found / not visible, or no active flag |

## 5. Jobs (worker)

| Queue | Trigger | Data | Behaviour |
|-------|---------|------|-----------|
| `link-snapshot` | after commit: link create/update (URL or image changed), publish, ingest propose; `pnpm links:snapshot-backfill` | `{ itemId, attempt? }`, singleton per item | Fill the empty preview → copy `preview.image` (`uploadFromUrl`, source `link_snapshot`) → conditional payload write → `enqueueIfStale`; requeue once on conflict |
| `link-check-sweep` | cron `30 6 * * *` | — | ≤ 100 due published link cards; one request per host at a time; update `link_checks`; log a summary |

Neither job throws for fetch failures: those are recorded or logged. Database errors are retried by pg-boss.

## 6. Web

| Element | Who | Behaviour |
|---------|-----|-----------|
| Link card badge | everyone who sees the card | "Link may be dead" / "Link may have changed"; `title` = check date |
| Card actions "Check again", "Dismiss" | `item.update` | Call §3 / §4; update the item query cache with the result |
| `/d/$slug/links` "Links to check" | `item.update` | List of §2; empty state "No links need attention" |
| Link preview image | everyone | `CloudImage` for `preview.publicId`, else the remote `preview.image`, else none |
