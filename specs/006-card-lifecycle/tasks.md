---

description: "Tasks for 006-card-lifecycle"
---

# Tasks: Card lifecycle (archive, restore, delete, undelete)

**Input**: Design documents from `/specs/006-card-lifecycle/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/items-lifecycle.md

**Tests**: REQUIRED (constitution V). Every row of the plan's traceability table maps to a test task below.

## Format: `[ID] [P?] [Story] [Tier?] Description`

- **[P]**: can run in parallel (different files, no dependencies)
- **[Story]**: US1 archive/restore, US2 delete/undelete, US3 same rules for every client
- **[Tier]**: `[unit]` `*.test.ts` next to code, `[int]` `*.int.test.ts` (Docker), `[e2e]` Playwright `@smoke`

## Phase 1: Foundational (Blocking Prerequisites)

**Purpose**: Baseline, actor plumbing, shared DTOs, index migration, link helper

- [ ] T001 Record the bundle baseline on main: `pnpm build:web && pnpm budget`, initial JS gzip into specs/006-card-lifecycle/implementation-notes.md (and the figure in PLAN.md § Phase 6)
- [ ] T002 `Actor`/`ActorVia` (`'session'`) in apps/api/src/types.ts; `getActor(c)` next to `getUser(c)` in apps/api/src/lib/current-user.ts (D130)
- [ ] T003 [P] [unit] `getActor` returns `{ user, via: 'session' }` for cookie and bearer, 401 without a user, in apps/api/src/lib/current-user.test.ts
- [ ] T004 Every `items.service` method takes `actor` first (`list`, `create`, `get`, `update`, `remove`, `archive`); `routes/items.ts` passes `getActor(c)`; existing unit tests in apps/api/src/services/items.service.test.ts updated (no behaviour change)
- [ ] T005 [P] `gone(detail, type)` → 410 in apps/api/src/errors/http-errors.ts (+ case in its existing test)
- [ ] T006 [P] `ITEM_UNDELETE_DAYS`, `DELETED_ITEM_PRUNE_CRON` in packages/shared/src/items/constants.ts, subpath `./item-constants` in packages/shared/package.json
- [ ] T007 [P] `itemListStatuses` in packages/shared/src/enums.ts; `itemListQuerySchema.status` uses it; `itemSchema.deletedAt` optional in packages/shared/src/schemas/item.ts
- [ ] T008 [P] [unit] list query accepts `deleted`, rejects others; `deletedAt` optional, in packages/shared/src/schemas/item.test.ts
- [ ] T009 `items_deleted_idx` (partial, `deleted_at IS NOT NULL`) in packages/db/src/schema/items.ts → `pnpm db:generate` → packages/db/migrations/0011_item_lifecycle.sql + hand-written packages/db/migrations/down/0011_item_lifecycle.down.sql
- [ ] T010 [int] `pnpm test:int` passes the existing round-trip in packages/db/test/migrations.int.test.ts with 0011
- [ ] T011 [P] `deckHref(slug, path)` in apps/web/src/ui/chip-order.ts; `chipHref` uses it; replace hand-built `/d/…` hrefs in review/ReviewPill.tsx, items/AddCardLink.tsx, routes/index.tsx, routes/i.$itemId.tsx, routes/d.$slug.new.tsx, share/ShareSent.tsx (D143)
- [ ] T012 [P] [unit] `deckHref` encodes the slug, joins paths, and `chipHref` output is unchanged, in apps/web/src/ui/chip-order.test.ts
- [ ] T013 [P] `UndoToast` (message, one action, 6 s auto-dismiss, `role="status"`) in apps/web/src/ui/UndoToast.tsx
- [ ] T014 [P] [unit] toast renders, fires the action once, dismisses on timeout, in apps/web/src/ui/UndoToast.test.tsx

**Checkpoint**: actor in place, DTOs and index ready, no behaviour change yet

---

## Phase 2: User Story 1 - Archive and restore (Priority: P1) 🎯 MVP

**Goal**: Archive refuses proposals; restore keeps `verified_at`; PATCH can't republish; web Archive/Restore with Undo.

**Independent Test**: As an editor, archive → no search hit → Archived → Restore → search hit, same age.

### Tests for User Story 1

- [ ] T015 [P] [US1] [unit] `archive` 409 `invalid-transition` on a proposal; `restore` keeps `verifiedAt`, idempotent on published, 409 on a proposal; `update` 409 `use-restore` on archived → published, in apps/api/src/services/items.service.test.ts
- [ ] T016 [P] [US1] [int] Role matrix for archive/restore (owner, maintainer, editor 200; reader 403; outsider 404); archived absent from `GET /decks/{id}/items` and `GET /decks/{id}/search`, present again after restore; `verifiedAt` unchanged, in apps/api/test/items-lifecycle.int.test.ts
- [ ] T017 [P] [US1] [int] Update the existing archive and PATCH-to-published cases in apps/api/test/items.int.test.ts to the new rules
- [ ] T018 [P] [US1] [unit] Optimistic remove/insert and rollback for archive/restore, search invalidation, in apps/web/src/api/item-lifecycle.test.ts
- [ ] T019 [P] [US1] [unit] `CardActions` shows Archive/Restore by `can()`, nothing for readers, disabled offline, in apps/web/src/items/CardActions.test.tsx
- [ ] T020 [P] [US1] [e2e] Demo 2: archive from the card view, Undo, archive again, search no hit, Archived → Restore, search hit; plus a negative path where a non-member deck link shows "unavailable", in e2e/tests/smoke/lifecycle.spec.ts

### Implementation for User Story 1

- [ ] T021 [US1] `archive` status check, new `restore`, `update` refusing archived → published and routing `status:'archived'` through `archive`, in apps/api/src/services/items.service.ts
- [ ] T022 [US1] `POST /items/{id}/restore` (200, 403, 404, 409) in apps/api/src/routes/items.ts; archive route documents 409
- [ ] T023 [US1] `pnpm api:openapi` (regenerate @pb/api-client)
- [ ] T024 [P] [US1] `insertIntoPages` next to `removeFromPages` in apps/web/src/api/favorite-cache.ts
- [ ] T025 [US1] `useArchive`/`useRestore` mutations (optimistic, rollback, invalidate `search` and `['item', id]`) in apps/web/src/api/item-lifecycle.ts
- [ ] T026 [US1] `CardActions` (Archive, Restore; slot for 007's Edit) in apps/web/src/items/CardActions.tsx; mounted in apps/web/src/routes/i.$itemId.tsx with `UndoToast`
- [ ] T027 [US1] Restore per card in apps/web/src/routes/d.$slug.archived.tsx
- [ ] T028 [P] [US1] Copy for `/problems/use-restore`, `/problems/invalid-transition` in apps/web/src/api/problem-messages.ts
- [ ] T029 [P] [US1] Restore request in apps/api/api.http

**Checkpoint**: Demo 2 works locally

---

## Phase 3: User Story 2 - Delete with a 30-day undo (Priority: P2)

**Goal**: Deleted listing, undelete within 30 days, weekly purge, Recently deleted in the web.

**Independent Test**: As a maintainer, delete → Recently deleted "30 days left" → Undelete → back in place; as an editor, none of it is offered.

### Tests for User Story 2

- [ ] T030 [P] [US2] [unit] `undelete`: within window clears, idempotent on live, 410 past 30 days (injected clock), 404 for a deleted proposal; `listDeleted` needs `item.delete`, in apps/api/src/services/items.service.test.ts
- [ ] T031 [P] [US2] [unit] `createPruneDeletedItems` passes the cutoff `now − 30 d` and logs the count, in apps/api/src/jobs/prune-deleted-items.test.ts
- [ ] T032 [P] [US2] [int] Delete/undelete/list role matrix (owner, maintainer 200; editor, reader 403); listing excludes proposals and > 30 days, newest first, cursor pages, private category hidden from roles that can't see it; undelete restores status, categories, favorites; 410 on a back-dated row; 422 `item-needs-category` when the link row is gone; purge run removes > 30 d rows with cascades and set-nulls (`ingest_jobs.result_item_id`), in apps/api/test/items-lifecycle.int.test.ts
- [ ] T033 [P] [US2] [unit] `daysLeft` (30 at 0 h, 27 at 3 d, floors, never < 0) in apps/web/src/items/days-left.test.ts
- [ ] T034 [P] [US2] [unit] Optimistic delete/undelete and rollback in apps/web/src/api/item-lifecycle.test.ts; Delete and Undelete only for `item.delete` roles in apps/web/src/items/CardActions.test.tsx
- [ ] T035 [P] [US2] [e2e] Delete with confirm → Undo; delete again → Recently deleted shows "30 days left" → Undelete, in e2e/tests/smoke/lifecycle.spec.ts

### Implementation for User Story 2

- [ ] T036 [US2] `findByIdIncludingDeleted`, `undelete`, `listDeleted` (cursor on `(deletedAt, id)`, excludes proposals, visibility filter), `purgeDeletedBefore` in apps/api/src/repositories/items.repo.ts
- [ ] T037 [US2] `undelete`, `listDeleted` (and `list` dispatching `status=deleted`) in apps/api/src/services/items.service.ts
- [ ] T038 [US2] `POST /items/{id}/undelete` (200, 403, 404, 410, 422) and the `status=deleted` list behaviour in apps/api/src/routes/items.ts
- [ ] T039 [US2] `pnpm api:openapi`
- [ ] T040 [US2] `createPruneDeletedItems` in apps/api/src/jobs/prune-deleted-items.ts; `QUEUES.pruneDeletedItems` in jobs/queues.ts; singleton in jobs/ensure-queues.ts (+ its test); schedule + work in apps/api/src/worker.ts
- [ ] T041 [US2] `ItemFilter { kind: 'deleted' }` in apps/web/src/api/query-keys.ts; `useDelete`/`useUndelete` in apps/web/src/api/item-lifecycle.ts
- [ ] T042 [US2] `daysLeft` in apps/web/src/items/days-left.ts; `DeletedSection` in apps/web/src/items/DeletedSection.tsx; rendered for `item.delete` roles in apps/web/src/routes/d.$slug.archived.tsx
- [ ] T043 [US2] Delete (with confirm) in apps/web/src/items/CardActions.tsx; copy for `/problems/undo-expired` in apps/web/src/api/problem-messages.ts
- [ ] T044 [P] [US2] Undelete and deleted-listing requests in apps/api/api.http

**Checkpoint**: Delete and undo work end to end; purge runs on schedule

---

## Phase 4: User Story 3 - The same rules for every client (Priority: P3)

**Goal**: Show that the rules hold for cookie and bearer clients alike, and that retries are safe.

**Independent Test**: The archive → restore → delete → undelete sequence over a bearer session matches the cookie session.

### Tests for User Story 3

- [ ] T045 [P] [US3] [int] The four-action sequence for each role run twice, once with a cookie session and once with a bearer, with identical status codes and bodies; every action repeated once is a no-op 200 (DELETE repeat 404); an `ing_` token on each route gives 401, in apps/api/test/items-lifecycle.int.test.ts

### Implementation for User Story 3

- [ ] T046 [US3] ADR-050 "Lifecycle rules in services, called with an actor" in docs/architecture.md (D130; how Phase 8 `item_events` and Phase 13 MCP use it)

**Checkpoint**: All stories pass

---

## Phase 5: Close-out

**Purpose**: Keep the repository's docs and gates true

- [ ] T047 `pnpm lint && pnpm format:check && pnpm typecheck && pnpm test:unit && pnpm test:int && pnpm build:web && pnpm budget` (delta vs T001 ≤ ~2 KB gzip, noted in implementation-notes.md)
- [ ] T048 [P] docs/architecture.md: lifecycle section (state machine, routes, problem types, purge job, `deckHref`), D130–D132, D143, D146, "Deviations from the plan" from implementation-notes.md
- [ ] T049 [P] README.md: new routes, the `prune-deleted-items` job in the worker list
- [ ] T050 [P] CLAUDE.md ground rules: "lifecycle transitions only through `items.service` with an actor; deck links via `deckHref`"
- [ ] T051 PLAN.md: link `specs/006-card-lifecycle` under Phase 6; tick demo 2 only after the deployed-instance run (quickstart §5)
- [ ] T052 Run quickstart.md (including the pre-merge purge count on the deployed instance)
- [ ] T053 `/speckit-converge` until it reports Converged

---

## Dependencies & Execution Order

- **Foundational (Phase 1)** blocks all stories. T004 depends on T002; T009 on nothing; T011 and T013 are web-only and parallel.
- **US1** before **US2**: both edit `items.service.ts`, `routes/items.ts`, `item-lifecycle.ts` and `CardActions.tsx`, so they run in order, not in parallel. **US3** after both.
- `specs/007-card-editor` starts after US1 (adds Edit to `CardActions`, uses `deckHref` and `UndoToast`). `specs/009-browse-mode` reuses `CardActions` and the mutations. `specs/008-card-media` doesn't depend on this feature.

### Within Each User Story

- Tests written and FAILING before implementation
- Schema → repository → service → route → `api:openapi` → web

## Notes

- Log decisions and deviations in implementation-notes.md as you go (e.g., the T001 baseline, the pre-merge purge count)
- Conventional commits, e.g. `feat(api): restore and undelete items`, `feat(web): card actions with undo`
