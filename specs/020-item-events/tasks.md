---

description: "Task list for 020-item-events"
---

# Tasks: Deck activity log

**Input**: Design documents from `/specs/020-item-events/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/events-api.md; 019 recommended first for the demo (no code dependency)

**Tests**: REQUIRED (constitution V). Every row of the plan's traceability table maps to a test task below.

**Organization**: Tasks are grouped by user story.

## Format: `[ID] [P?] [Story] [Tier?] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: US1 deck log, US2 card history
- **[Tier]**: `[unit]` `*.test.ts(x)` next to code, `[int]` `apps/api/test/*.int.test.ts` (Docker), `[e2e:smoke]` `e2e/tests/smoke/`, `[e2e:full]` `e2e/tests/full/` (tier rule: constitution V, ADR-053)

---

## Phase 1: Foundational (Blocking Prerequisites)

**Purpose**: Table, constants, write path.

- [x] T001 `itemEventKinds`, `actorVias`, `ITEM_EVENT_PAGE_MAX` in packages/shared/src/events/constants.ts; `itemEventSchema`, `itemEventPageSchema`, `itemEventListQuerySchema` in packages/shared/src/schemas/event.ts
- [x] T002 packages/db/src/schema/item-events.ts; `pnpm db:generate` → packages/db/migrations/00NN_item_events.sql; hand-write packages/db/migrations/down/00NN_item_events.sql
- [x] T003 [P] `'event.list'` in packages/shared/src/authz/permissions.ts + can.ts; [unit] can.test.ts rows
- [x] T004 [P] `diffFields(before, after)` in apps/api/src/events/diff-fields.ts + [unit] test (names only, categories as sets, no-op → [])
- [x] T005 `ActorVia` from `actorVias` in apps/api/src/types.ts; `ItemEventInput` + `eventFrom(actor, kind, title, changes?)` in apps/api/src/events/item-event.ts
- [x] T006 apps/api/src/repositories/item-events.repo.ts (`insert(tx, e)`, `list(q)`); `event?` on `items.repo.create/update/softDelete/undelete` and `ReviewTxRepos`

**Checkpoint**: Migration applies and rolls back; repos accept events

---

## Phase 2: User Story 1 — Deck log (Priority: P1) 🎯 MVP

**Goal**: Every card change logged; admins read the deck's log.

**Independent Test**: co-owner publishes, owner archives; the log shows both.

### Tests for User Story 1

- [x] T010 [P] [US1] [int] One line for each of the ten actions with the right `kind`, `via`, actor, title, `changes`; forced failure → no line; no-op update → no line; system writes (link check, snapshot) → no line, in apps/api/test/item-events.int.test.ts
- [x] T011 [P] [US1] [int] Read: newest first; cursor stable across inserts; editor/reader 403; non-member 404; purge keeps the line with `itemId` null; deleted user → `actor` null, in apps/api/test/item-events.int.test.ts
- [x] T012 [P] [US1] [unit] EventRow.test.tsx: labels per kind, "Former member", ingest badge, no link when `itemId` is null
- [x] T013 [P] [US1] [e2e:full] Co-owner publishes a proposal; owner archives a card; owner's Activity shows both admins' names, in e2e/tests/full/activity-log.spec.ts

### Implementation for User Story 1

- [x] T014 [US1] Events in apps/api/src/services/items.service.ts (create, update, archive, restore, remove, undelete)
- [x] T015 [US1] `Actor` in `review.service.publish/discard`; `published`, `merged`, `discarded` events in apps/api/src/services/review.service.ts; route passes the actor in apps/api/src/routes/review.ts
- [x] T016 [US1] `proposed` event with `via: 'ingest'` in apps/api/src/ingest/propose.ts
- [x] T017 [US1] apps/api/src/services/events.service.ts + apps/api/src/routes/events.ts; register in app.ts; `pnpm api:openapi`; example in api.http
- [x] T018 [US1] Lazy apps/web/src/routes/d.$slug.log.tsx; apps/web/src/events/{EventLog,EventRow}.tsx, event-copy.ts; "Activity" in the deck menu for admins

**Checkpoint**: Demo 5 works locally

---

## Phase 3: User Story 2 — Card history (Priority: P2)

**Goal**: "History" on the card page for admins.

**Independent Test**: two edits and an archive → three lines in the card's history.

### Tests for User Story 2

- [x] T020 [P] [US2] [int] `itemId` filter returns only that card's lines, in apps/api/test/item-events.int.test.ts
- [x] T021 [P] [US2] [unit] ItemHistoryLink.test.tsx: shown for owner/maintainer only

### Implementation for User Story 2

- [x] T022 [US2] apps/web/src/items/ItemHistoryLink.tsx on the card page; `?item=` search param in the log route

**Checkpoint**: Both stories work independently

---

## Phase 4: Close-out

- [x] T050 `pnpm lint && pnpm format:check && pnpm typecheck && pnpm test:unit && pnpm test:int && pnpm build:web && pnpm budget`
- [x] T051 [P] docs/adr.md: **ADR-057** (D186, D187); docs/design: activity log; docs/architecture.md map entry
- [x] T052 [P] CLAUDE.md ground rules: card writes pass an `event` from the `Actor`
- [x] T053 [P] README.md: activity log
- [ ] T054 PLAN.md: tick demo 5 only after quickstart section 3 has run on the deployed instance
- [ ] T055 Run quickstart.md validation
- [ ] T056 `/speckit-converge` until it reports Converged

---

## Dependencies & Execution Order

- **Foundational (Phase 1)**: blocks both stories
- **US2**: after US1 (reuses the endpoint and screen)
- **Close-out**: after both

### Within Each User Story

- Tests written and FAILING before implementation
- shared → db → repo → service → route → `api:openapi` → web

---

## Notes

- [P] tasks = different files, no dependencies
- Log decisions the plan did not make, and deviations, in implementation-notes.md as you go
- Commit after each task or logical group (e.g. `feat(api): item events`)
