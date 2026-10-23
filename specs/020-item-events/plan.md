# Implementation Plan: Deck activity log

**Branch**: `020-item-events` | **Date**: 2026-10-23 | **Spec**: [spec.md](./spec.md) | **Roadmap**: `PLAN.md` § Phase 8 (demo 5)

**Input**: Feature specification from `/specs/020-item-events/spec.md`

Project override of the core template. Written for outside readers: the repository is public.

## Summary

**Table.** A new append-only `item_events` table (D186):

- Columns: `deck_id` (cascade), `item_id` (set null), `actor_user_id` (set null), `via`, `kind`, `title`, `changes text[]` and `created_at`.
- `via` is an enum (`session`, `ingest`; Phase 13 adds `mcp`).
- `kind` is an enum of the ten card actions.

**Writes.** The repository write methods (`items.repo.create/update/softDelete/undelete` and the review transaction repos) take an optional `event` argument. They insert the line inside the transaction they already open, so a line exists exactly when the change committed (D187).

- Services build the event from the `Actor`.
- `review.service.publish/discard` move from `CurrentUser` to `Actor`.
- Ingest proposals log `proposed` with `via: 'ingest'`.
- Changed-field names come from one pure helper, `diffFields(before, after)`.

**Read.** `GET /decks/{id}/events?cursor&limit&itemId` with a new permission `event.list` (owner, maintainer) (D188).

- The PWA gets a lazy `/d/$slug/log` screen and a "History" entry on the card page for admins.
- **ADR-057** records the event model and the `via` contract for Phase 13.

## Starting point

- `main @ a980598`; 019 for the co-owner flow (not a code dependency).
- `Actor { user, via: 'session' }` (D130, `apps/api/src/types.ts`); `items.service` methods take `Actor`; `review.service.publish/discard` take `CurrentUser`.
- Transactions:
  - `items.repo.create` and `update` each open `db.transaction`;
  - `softDelete` and `undelete` are single statements;
  - `review.service` runs publish/discard/merge in `transaction(tx => …)` with `ReviewTxRepos`.
- Ingest: `ingest/propose.ts` `proposeItem` calls `items.create(…, status 'proposed')` for both the worker and `proposeDirect`.
- Purge: `items.repo.purgeDeletedBefore(cutoff)` hard-deletes old soft-deleted items.
- Migrations: next free number (after `0013_link_checks`, plus any 016–018 migration).

## Technical Context

**Language/Version**: TypeScript (strict, ESM, no build step) on Node ≥ 22; React 19

**Primary Dependencies**: Hono + `@hono/zod-openapi`, Drizzle; TanStack Router/Query. No new dependencies.

**Storage**: PostgreSQL 17. One migration: two enums, one table, two indexes.

**Testing**: Vitest unit; integration with Testcontainers; Playwright full

**E2E tier**: full — the log is an admin read view; the write invariant (one line per change, same transaction) is covered by int tests on every PR. One nightly journey: co-owner publishes, owner archives, owner's log shows both (demo 5).

**Target Platform**: Docker Compose on Dokploy

**Project Type**: pnpm monorepo — API, PWA, shared packages

**Performance Goals**: one extra insert per card write (< 2 ms); log page < 100 ms

**Constraints**: same transaction as the change; no content values in the log; append-only

**Scale/Scope**: thousands of events per deck per year

## Constitution Check

| Principle | How this plan complies |
|-----------|------------------------|
| I. Layered API | Services build the event; repositories insert it; `routes/events.ts` → `events.service` → `item-events.repo` |
| II. One source of truth | `itemEventKinds`, `actorVias`, `itemEventSchema` in `@pb/shared`; `ActorVia` type derives from `actorVias` |
| III. Invariants in the DB | FKs (cascade / set null), enums, `changes` only on `updated`/`merged` (CHECK); same transaction as the change |
| IV. Private by default | Owner/maintainer only; field names, not values; title snapshot only |
| V. Tests at the right tier | Unit (`diffFields`), int (one line per path, rollback, permissions, FK behaviour), e2e full journey |
| VI. Lean web | Lazy route; plain CSS |
| VII. Simple, optional | No env; no queue — a plain insert |

No violations.

## Decisions this plan pins down

Full reasoning in [research.md](./research.md).

| ID | Decision | ADR? |
|----|----------|------|
| D186 | `item_events` table: `id`, `deck_id` FK cascade, `item_id` FK set null, `actor_user_id` FK set null, `via actor_via` (`session`, `ingest`; Phase 13 adds `mcp` + `connection_id`), `kind item_event_kind` (created, proposed, published, updated, archived, restored, deleted, undeleted, discarded, merged), `title` snapshot (≤ 200), `changes text[]` (field names, only for `updated`/`merged`), `created_at`; index `(deck_id, created_at desc, id)` and `(item_id, created_at desc)`; append-only | yes → **ADR-057** |
| D187 | Events written in the change's own transaction via an optional `event` argument on repository writes; services build it from the `Actor`; `review.service.publish/discard` take `Actor`; ingest proposals log `proposed` with `via: 'ingest'` and the sharing user; no line for no-op saves or system work (link checks, snapshots, embeddings); merge logs one `merged` line on the target | yes → **ADR-057** |
| D188 | `GET /decks/{id}/events?cursor&limit&itemId` (limit ≤ 50, keyset on `(created_at, id)`), permission `event.list` (owner, maintainer); actor shown as display name or "Former member"; PWA `/d/$slug/log` (lazy) and card "History" for admins | no |

## Project Structure

### Documentation (this feature)

```text
specs/020-item-events/
├── spec.md
├── checklists/requirements.md
├── plan.md
├── research.md
├── data-model.md
├── contracts/events-api.md
├── quickstart.md
├── tasks.md
└── implementation-notes.md   # created during /speckit-implement
```

### Source Code (repository root)

```text
packages/db/src/schema/item-events.ts        # NEW table + enums
packages/db/migrations/00NN_item_events.sql  # generated; down file hand-written
packages/shared/src/
├── events/constants.ts                      # NEW: itemEventKinds, actorVias, ITEM_EVENT_PAGE_MAX
├── schemas/event.ts                         # NEW: itemEventSchema, itemEventPageSchema, itemEventListQuerySchema
└── authz/permissions.ts + can.ts            # + 'event.list'

apps/api/src/
├── types.ts                                 # ActorVia from @pb/shared actorVias
├── events/diff-fields.ts                    # NEW: changed field names (pure)
├── events/item-event.ts                     # NEW: ItemEventInput type, builder from Actor
├── repositories/item-events.repo.ts         # NEW: insert(tx, e), list(q)
├── repositories/items.repo.ts               # create/update/softDelete/undelete take event?
├── services/items.service.ts                # pass events
├── services/review.service.ts               # Actor; events in publish/discard/merge
├── ingest/propose.ts                        # proposed event, via 'ingest'
├── services/events.service.ts               # NEW: list with names
└── routes/events.ts                         # NEW: GET /decks/{id}/events
apps/api/test/item-events.int.test.ts        # NEW

apps/web/src/
├── routes/d.$slug.log.tsx                   # NEW (lazy)
├── events/EventLog.tsx, EventRow.tsx        # NEW
├── events/event-copy.ts                     # NEW: action labels
└── items/ItemHistoryLink.tsx                # NEW: card page entry for admins
e2e/tests/full/activity-log.spec.ts          # NEW
```

**Structure Decision**: events are passed into existing repository writes instead of a separate `events.record()` after the fact, because only the repository holds the transaction. A database trigger was rejected (it can't see the actor or `via`; see research).

## Invariant → test traceability

| Invariant / rule | Enforced in | Test (file, tier) |
|------------------|-------------|-------------------|
| FR-001 one line per change, same transaction | repos + services | `item-events.int.test.ts` (int: each of the ten actions → exactly one line; forced failure after insert → zero lines; no-op update → zero lines) |
| FR-002 fields recorded; FKs keep lines | schema | `item-events.int.test.ts` (int: purge → `item_id` null, title kept; user delete → actor null) |
| FR-003 `via` | `item-event.ts`, `propose.ts` | `item-events.int.test.ts` (int: app edit `session`; share/direct proposal `ingest`) |
| FR-004 owner/maintainer only | `event.list` | `item-events.int.test.ts` (int: editor/reader 403; non-member 404); `can.test.ts` (unit) |
| FR-005 order, pagination, filter | `item-events.repo.list` | `item-events.int.test.ts` (int: newest first, cursor stable, `itemId` filter) |
| FR-006 no values | `diff-fields.ts` | `diff-fields.test.ts` (unit: names only; categories compared as sets; no-op → empty) |
| FR-007 bundle | lazy route | `pnpm budget` |
| Demo 5 journey | — | `e2e/tests/full/activity-log.spec.ts` (e2e:full) |

## Rollout

- **Migrations**: `00NN_item_events` (enums, table, indexes, CHECK). Down drops them. No backfill: the log starts at deploy (stated on the screen's empty state).
- **Env / config**: none.
- **API client**: `pnpm api:openapi`.
- **Deploy order / flags**: migration then API (normal order).

## Risks

| Risk | Likelihood / impact | Mitigation |
|------|---------------------|------------|
| A new write path forgets the event | M / M | `event` argument on the repo writes; int test enumerates service paths; reviewers check ADR-057 |
| Log grows without bound | L / L | Thousands of rows a year; index on deck/time; retention revisited in Phase 11 |
| Personal data in the log | L / M | Title snapshot only; actor FK set null on user delete |

## Settle before starting

- [ ] Should `event.list` include editors for their own lines? The plan keeps admins only.
- [ ] Log category and member changes too (wider audit), or keep cards only for Phase 8?

## Complexity Tracking

None.
