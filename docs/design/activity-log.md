# Activity log (Phase 8, `specs/020-item-events`)

_Overview: [architecture.md](../architecture.md). Decisions: [adr.md](../adr.md#adr-057-item-events-written-in-the-same-transaction-as-the-card-d186-d187)._

Every change to a card records who made it, through which client, and which fields changed. Owners and maintainers read the log per deck and per card.

**Table** `item_events` (migration `0015_item_events`, D186):

| Column | Notes |
| --- | --- |
| `deck_id` | FK, cascade: the log goes with the deck |
| `item_id` | FK, set null: a purged card keeps its lines, the PWA shows the title without a link |
| `actor_user_id` | FK, set null; a missing or soft-deleted user reads "Former member" |
| `via` | enum `actor_via`: `session` (web app, API scripts), `ingest` (proposals from shares). Phase 13 adds `mcp` |
| `kind` | enum `item_event_kind`: `created`, `proposed`, `published`, `updated`, `archived`, `restored`, `deleted`, `undeleted`, `discarded`, `merged` |
| `title` | snapshot of the card title after the change (≤ 200) |
| `changes` | field names only (`itemEventFields`), never values; only on `updated` and `merged` (CHECK) |

Indexes: `(deck_id, created_at desc, id desc)` for the deck log, `(item_id, created_at desc)` for a card's history.

**Writing (D187)**: `items.repo` and the review repos take a trailing `events: ItemEventInput[]` and insert them in the same transaction as the card write (`insertItemEvents`), so a line exists exactly when the write committed. Services build inputs with `eventFrom(actor, kind, title, changes?)` (`apps/api/src/events/item-event.ts`); updates name their changed fields with `diffFields(before, after)` (categories as sets, JSON by value). No line is written for:
- an update that changes nothing (`diffFields` is empty);
- system writes (`updatePayloadIf` from link checks and snapshots, embeddings, sweeps);
- a refused write (the transaction rolls back).

| Write | Lines |
| --- | --- |
| `items.service.create` | `created` (or `proposed` for a proposal) |
| `items.service.update` | `updated` with `changes`; a status move adds `published` or `archived` after it |
| archive / restore / remove / undelete | `archived` / `restored` / `deleted` / `undeleted` |
| `review.service.publish` (new card) | `published` |
| `review.service.publish` (`mode: 'update'`, merge) | one `merged` on the target with the changed fields; the proposal's own soft delete logs nothing |
| `review.service.discard` | `discarded` |
| `ingest/propose.ts` | `proposed` with `via: 'ingest'` and the sharer as actor |

**Reading (D188)**: `GET /decks/{id}/events?cursor=&limit=&itemId=` (`event.list`: owner, maintainer; editor and reader 403, non-member 404). Newest first, keyset cursor on `(createdAt, id)`, `limit` ≤ 50 (default 30), `itemId` filters to one card. The DTO carries `actor: { userId, displayName } | null`.

**PWA**: lazy route `/d/$slug/log` (`?item=<uuid>` for one card's history). Admins see an "Activity" link in the deck header (next to the Review pill) and a "History" button on the card page. The query is never persisted (`NOT_PERSISTED`) and refetches on focus.

## Deviations from the 020 plan

- **`events` array, not `event?`**: repository writes take a list, because one PATCH can log `updated` and a status move. Lines of one write are 1 ms apart (`now() + i ms`) so their order survives the shared transaction timestamp.
- **`status` is a field name**: a PATCH status move logs `updated` with `status` in `changes`, then `published`/`archived`.
- **Publish logs no `changes`**; a merge's `changes` include `verifiedAt` when the publish sets it.
- **Title**: taken from the written row (after the change), truncated to 200.
- **"Former member"** also covers soft-deleted users (the FK only nulls on a hard delete).
- **Header link instead of a deck menu**: the PWA has no deck menu, so "Activity" sits in the header actions.
- **Empty state** says the log starts "from the day the activity log was turned on" instead of a deploy date.
- **E2E (`e2e/tests/full/activity-log.spec.ts`)**: the owner makes both writes; a second admin can't sign in from e2e (an invite needs the emailed magic link). Names of other admins are covered by `apps/api/test/item-events.int.test.ts`.
