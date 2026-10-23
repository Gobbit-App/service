---

description: "Task list for 014-link-snapshots"
---

# Tasks: Link snapshots and link checks

**Input**: Design documents from `/specs/014-link-snapshots/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/link-checks.md; `012-media-assets` merged; `013-cloud-image` preferred (not required)

**Tests**: REQUIRED (constitution V). Every row of the plan's traceability table maps to a test task below.

**Organization**: Tasks are grouped by user story.

## Format: `[ID] [P?] [Story] [Tier?] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: US1 snapshots, US2 daily checks, US3 member actions
- **[Tier]**: `[unit]` `*.test.ts(x)` next to code, `[int]` `apps/api/test/*.int.test.ts` (Docker), `[e2e:smoke]` `e2e/tests/smoke/`, `[e2e:full]` `e2e/tests/full/` (tier rule: constitution V, ADR-053)

---

## Phase 1: Foundational (Blocking Prerequisites)

**Purpose**: Schema, migration, shared contracts, queues.

- [x] T001 `link_checks` table + `link_check_status` enum in packages/db/src/schema/link-checks.ts; export from packages/db/src/schema/index.ts
- [x] T002 `pnpm db:generate` → packages/db/migrations/0013_link_checks.sql; append the `item_search_text()` replacement (`WHEN 'link' THEN payload #- '{preview,publicId}'`), the `search_text` drop/re-add + `items_search_trgm_idx`, and `items_link_preview_public_id_idx`; hand-write packages/db/migrations/down/0013_link_checks.sql (restore the 0009 body)
- [x] T003 [P] Constants in packages/shared/src/links/constants.ts + packages/shared/src/links/index.ts; `"./links"` export in packages/shared/package.json
- [x] T004 [P] Link preview `publicId?`/`width?`/`height?` in packages/shared/src/schemas/payloads.ts; `linkHealthSchema`, `itemSchema.linkHealth`, `itemListQuerySchema.flag` in packages/shared/src/schemas/item.ts
- [x] T005 [P] [unit] Schema tests (old link payloads still parse; dimension bounds; `flag` values) in packages/shared/src/schemas/payloads.test.ts and packages/shared/src/schemas/item.test.ts
- [x] T006 [P] `QUEUES.linkSnapshot`, `QUEUES.linkCheckSweep`, `LinkSnapshotJob` in apps/api/src/jobs/queues.ts; `rateKeys.linkCheckUser` in apps/api/src/lib/rate-window.ts
- [x] T007 [P] `link-checks.repo.ts` (`due`, `upsert`, `flagsFor`, `dismiss`, `flaggedPage`) in apps/api/src/repositories/link-checks.repo.ts
- [x] T008 `toItemDto` + `createItemDtoMapper` fill `linkHealth` (one `flagsFor` per page) in apps/api/src/lib/mappers.ts and apps/api/src/services/item-dtos.ts; wire the repo in apps/api/src/services/index.ts
- [x] T009 [P] [int] Migration: search text unchanged for existing rows; round trip, in apps/api/test/search.int.test.ts

**Checkpoint**: Migration applies and rolls back; DTOs carry `linkHealth: null`

---

## Phase 2: User Story 1 — Link previews survive the site changing (Priority: P1) 🎯 MVP

**Goal**: Live link cards get a stored copy of their preview image; ingest proposals keep their preview.

**Independent Test**: Save a link card with a preview image → `preview.publicId` within 30 s → remote image gone → card still shows it.

### Tests for User Story 1

- [x] T010 [P] [US1] [unit] `enqueueIfNeeded`: live link with image and no `publicId` → enqueue; empty preview → enqueue; already snapshotted, non-link, archived → no; no Cloudinary → no, in apps/api/src/jobs/link-snapshot-queue.test.ts
- [x] T011 [P] [US1] [unit] Snapshot job steps with fakes (fill preview, copy, conditional write, requeue once, `enqueueIfStale`, failures logged not thrown) in apps/api/src/jobs/link-snapshot.test.ts
- [x] T012 [P] [US1] [unit] `extract-validate` link payload carries a clipped `og` preview in apps/api/src/ai/extract-validate.test.ts
- [x] T013 [P] [US1] [int] Create → job → snapshot asset (`link_snapshot`, `gobbit/links/<deckId>`); HTML at the image URL → no snapshot; edit between load and write → edit kept, in apps/api/test/link-snapshot.int.test.ts (fixture server, `MemoryMediaStore`)
- [x] T014 [P] [US1] [int] Server-owned fields: client `width` ignored; URL or image change drops a `link_snapshot` `publicId`/`width`/`height` but keeps an `editor` asset; foreign `preview.publicId` → 422, in apps/api/test/items.int.test.ts
- [x] T015 [P] [US1] [int] `preview.publicId` not searchable; title still is, in apps/api/test/search.int.test.ts
- [x] T016 [P] [US1] [int] Orphan sweep keeps a referenced link snapshot, deletes a replaced one, in apps/api/test/media-sweep.int.test.ts
- [x] T017 [P] [US1] [int] Ingest proposal for a URL has `preview` and enqueues the snapshot, in apps/api/test/ingest-pipeline.int.test.ts
- [x] T018 [P] [US1] [unit] `LinkCard`: `CloudImage` for `preview.publicId`; remote image fallback; none on error, in apps/web/src/cards/LinkCard.test.tsx

### Implementation for User Story 1

- [x] T019 [US1] Move `toLinkPreview` to apps/api/src/fetch/link-preview.ts; expose the rate-limit-free `fetchPreview` core from apps/api/src/services/link-preview.service.ts
- [x] T020 [US1] `items.repo.updatePayloadIf(id, updatedAt, payload)` in apps/api/src/repositories/items.repo.ts
- [x] T021 [US1] `link-snapshot-queue.ts` + `link-snapshot.ts` in apps/api/src/jobs/; work the queue in apps/api/src/worker.ts when `CLOUDINARY_URL` is set
- [x] T022 [US1] Server-owned preview fields + `enqueueIfNeeded` after commit in apps/api/src/services/items.service.ts; on publish in apps/api/src/services/review.service.ts; in apps/api/src/ingest/propose.ts
- [x] T023 [US1] Link preview from `og` in apps/api/src/ai/extract-validate.ts
- [x] T024 [US1] Orphan reference for link previews in apps/api/src/repositories/assets.repo.ts
- [x] T025 [US1] `LinkCard` snapshot rendering in apps/web/src/cards/LinkCard.tsx (+ CSS in apps/web/src/styles.css)
- [x] T026 [P] [US1] `pnpm links:snapshot-backfill` in apps/api/scripts/links-snapshot-backfill.ts; scripts in apps/api/package.json and root package.json

**Checkpoint**: Demo 3 part 1 works locally

---

## Phase 3: User Story 2 — Dead and changed links are flagged (Priority: P1)

**Goal**: The daily sweep checks due links and maintains `link_checks`.

**Independent Test**: A 404 link is flagged dead after its second sweep; a temporary error never flags it.

### Tests for User Story 2

- [x] T030 [P] [US2] [unit] `classify`: 2xx same/different title (normalization: case, spacing, punctuation, site suffix), 404/410/DNS/refused/blocked = definite, timeout/5xx/429/403/redirect loop = temporary, in apps/api/src/fetch/link-status.test.ts
- [x] T031 [P] [US2] [unit] State transitions (two strikes, retry in 1 day, `next_check_at` window, flag set/clear, dismissal kept while the status is unchanged) and per-host serialization in apps/api/src/services/link-checks.service.test.ts
- [x] T032 [P] [US2] [unit] `safe-fetch` `accept: 'any'`: non-HTML 2xx → alive without a body; HTML read capped; guard unchanged, in apps/api/src/fetch/safe-fetch.test.ts
- [x] T033 [P] [US2] [int] Sweep: 120 due → 100 checked; proposed/archived/deleted skipped; 404 twice → `dead`, `linkHealth` on the DTO; 200 → cleared; runs without a media store, in apps/api/test/link-checks.int.test.ts
- [x] T034 [P] [US2] [unit] Schedule registered with `LINK_CHECK_CRON` in apps/api/src/jobs/link-check-sweep.test.ts

### Implementation for User Story 2

- [x] T035 [US2] `accept: 'any'` mode in apps/api/src/fetch/safe-fetch.ts
- [x] T036 [US2] `classify` in apps/api/src/fetch/link-status.ts
- [x] T037 [US2] `link-checks.service` (`checkOne`, `sweep`) in apps/api/src/services/link-checks.service.ts
- [x] T038 [US2] `link-check-sweep` job in apps/api/src/jobs/link-check-sweep.ts; schedule in apps/api/src/worker.ts; add to apps/api/scripts/run-job.ts (from 012)
- [x] T039 [US2] `LinkHealthBadge` in apps/web/src/cards/LinkHealthBadge.tsx (+ test), used by apps/web/src/cards/LinkCard.tsx

**Checkpoint**: Flags appear on cards

---

## Phase 4: User Story 3 — Members act on flagged links (Priority: P2)

**Goal**: "Check again", "Dismiss" and "Links to check" for editors and up.

**Independent Test**: Flagged card listed; check again updates it; dismiss hides it for everyone; readers can't act.

### Tests for User Story 3

- [x] T040 [P] [US3] [int] Routes: `POST /items/{id}/link-check` (200, 404, 422 non-link, 429 on the 11th, manual 404 never sets dead), `DELETE …/flag` (204, 404 when none), `?flag=link` (list order, visibility, reader 403, 400 combos), in apps/api/test/link-checks.int.test.ts
- [x] T041 [P] [US3] [unit] `CardActions` shows Check again/Dismiss only with `item.update` and only for flagged links, in apps/web/src/items/CardActions.test.tsx
- [x] T042 [P] [US3] [e2e:full] Happy path: flagged card (seeded via a test helper) → badge → Dismiss → gone; "Links to check" empty state; reader sees the badge with no actions, in e2e/tests/full/links.spec.ts

### Implementation for User Story 3

- [x] T043 [US3] `checkNow`, `dismiss`, flag filter access in apps/api/src/services/link-checks.service.ts and apps/api/src/services/items.service.ts
- [x] T044 [US3] Routes and the `flag` query in apps/api/src/routes/items.ts; `pnpm api:openapi`
- [x] T045 [US3] `checkLink`, `dismissLinkFlag`, flag filter in apps/web/src/api/items.ts; actions in apps/web/src/items/CardActions.tsx
- [x] T046 [US3] "Links to check" route apps/web/src/routes/d.$slug.links.tsx (lazy) + deck menu entry for `item.update`

**Checkpoint**: All three stories work independently

---

## Phase 5: Close-out

- [x] T050 `pnpm lint && pnpm format:check && pnpm typecheck && pnpm test:unit && pnpm test:int && pnpm budget`
- [x] T051 [P] docs/adr.md: **ADR-055**; docs/architecture.md: one ADR index row, a "Links" row in the areas table and the two jobs in the Worker row; NEW docs/design/links.md: snapshots and checks (D163–D165, `safe-fetch` `accept: 'any'`) and Deviations; docs/design/search.md: the `item_search_text` change
- [x] T052 [P] README.md: the two jobs and their cadence, `pnpm links:snapshot-backfill`, the new routes
- [x] T053 [P] CLAUDE.md ground rules: link preview images render from snapshots; link checks only through `safe-fetch`
- [ ] T054 PLAN.md: link this spec under Phase 7; tick demo 3 only after quickstart section 3 step 8 has run on the deployed instance
- [ ] T055 Run quickstart.md validation
- [ ] T056 `/speckit-converge` until it reports Converged

---

## Dependencies & Execution Order

- **Foundational (Phase 1)**: blocks all stories
- **US1**: needs 012 (`uploadFromUrl`, assets, sweep)
- **US2**: independent of US1 after Phase 1
- **US3**: after US2 (flags must exist)
- **External**: `012-media-assets` merged; `013-cloud-image` for `CloudImage` (else a plain `<img>` with `cloudinaryImageUrl`); `015-locked-host-links` builds on US1 and US2
- **Close-out**: after all stories

### Within Each User Story

- Tests written and FAILING before implementation
- shared → repo → service → job/route → `api:openapi` → web

---

## Notes

- [P] tasks = different files, no dependencies
- Log decisions the plan did not make, and deviations, in implementation-notes.md as you go
- Commit after each task or logical group (e.g. `feat(api): link snapshot job`)
- Never fetch third-party URLs outside `safe-fetch`; never use Cloudinary remote fetch
