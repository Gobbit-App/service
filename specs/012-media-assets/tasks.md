---

description: "Task list for 012-media-assets"
---

# Tasks: Media assets — registry, orphan cleanup and uploads from a URL

**Input**: Design documents from `/specs/012-media-assets/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/media-assets.md; `008-card-media` merged

**Tests**: REQUIRED (constitution V). Every row of the plan's traceability table maps to a test task below.

**Organization**: Tasks are grouped by user story.

## Format: `[ID] [P?] [Story] [Tier?] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: US1 recorded uploads + reference rule, US2 orphan sweep, US3 upload from URL
- **[Tier]**: `[unit]` `*.test.ts(x)` next to code, `[int]` `apps/api/test/*.int.test.ts` (Docker), `[e2e:smoke]` `e2e/tests/smoke/`, `[e2e:full]` `e2e/tests/full/` (tier rule: constitution V, ADR-053)

---

## Phase 1: Foundational (Blocking Prerequisites)

**Purpose**: Schema, migration, shared DTOs, Cloudinary port.

- [ ] T001 `assets` table + `asset_source` enum in packages/db/src/schema/assets.ts; export from packages/db/src/schema/index.ts
- [ ] T002 `pnpm db:generate` → packages/db/migrations/0012_media_assets.sql; append the backfill INSERT (one row per distinct image `payload->>'publicId'`, source by folder prefix) and `items_image_public_id_idx`; hand-write packages/db/migrations/down/0012_media_assets.sql
- [ ] T003 [P] Constants (`MEDIA_ORPHAN_GRACE_DAYS`, `MEDIA_SWEEP_CRON`, `MEDIA_SWEEP_BATCH`, `MEDIA_DELETE_CHUNK`, `MEDIA_CONFIRM_RATE_PER_HOUR`, `MEDIA_IMAGE_DIMENSION_MAX`) in packages/shared/src/media/constants.ts
- [ ] T004 [P] `mediaAssetConfirmRequestSchema`, `mediaAssetSchema` in packages/shared/src/schemas/media.ts; image payload `width?`/`height?` in packages/shared/src/schemas/payloads.ts
- [ ] T005 [P] [unit] Schema tests (strict confirm body, dimension bounds, image payload still strict and backwards compatible) in packages/shared/src/schemas/payloads.test.ts and packages/shared/src/media/index.test.ts
- [ ] T006 [P] `assets.repo.ts` (`upsert`, `byPublicId`, `orphans(graceDays, limit)`, `deleteByIds`) in apps/api/src/repositories/assets.repo.ts
- [ ] T007 [P] `MediaStore` port (`uploadBuffer`, `deleteMany` → per-id `deleted|not_found|failed`, `deleteByPrefix`, `verifyResponse`) with the Cloudinary adapter and `MemoryMediaStore` in apps/api/src/media/media-store.ts
- [ ] T008 Wire `assets` repo + `MediaStore` in apps/api/src/services/media-wiring.ts

**Checkpoint**: Migration applies and rolls back; the services can be built

---

## Phase 2: User Story 1 — Recorded uploads and the reference rule (Priority: P1) 🎯 MVP

**Goal**: Every editor and ingest upload is recorded; image cards reference only recorded images of their deck and carry server-owned dimensions.

**Independent Test**: Save an image card from the editor → asset row with dimensions; a foreign `publicId` → 422.

### Tests for User Story 1

> Write these first and make sure they FAIL before implementation.

- [ ] T010 [P] [US1] [unit] `confirmUpload`: signature verified via the store, folder prefix per deck, other-deck conflict, idempotent upsert, rate key in apps/api/src/services/media.service.test.ts
- [ ] T011 [P] [US1] [int] `POST /decks/{id}/media/assets`: 201, 200 repeat, 403 reader, 404 invisible deck, 422 bad signature / wrong folder / other deck, 429, 503 without Cloudinary, `no-store` in apps/api/test/media-assets.int.test.ts
- [ ] T012 [P] [US1] [int] Reference rule: create/update image card with unknown or foreign `publicId` → 422 pointer `/payload/publicId`; client dimensions overwritten by the asset's in apps/api/test/items.int.test.ts; publish with the same rule in apps/api/test/review.int.test.ts
- [ ] T013 [P] [US1] [int] Ingest image proposal records an asset (`source = ingest`, dimensions) in apps/api/test/ingest.int.test.ts
- [ ] T014 [P] [US1] [unit] `use-image-upload` state machine: uploading → confirming → done; confirm failure → retryable error in apps/web/src/editor/use-image-upload.test.ts

### Implementation for User Story 1

- [ ] T015 [US1] `media.service.confirmUpload({ user, deckId, body })` + `rateKeys.mediaConfirmUser` in apps/api/src/services/media.service.ts and apps/api/src/lib/rate-window.ts
- [ ] T016 [US1] Route + OpenAPI `POST /decks/{id}/media/assets` per contracts/media-assets.md in apps/api/src/routes/media.ts
- [ ] T017 [US1] D160 reference rule + dimension fill in apps/api/src/services/items.service.ts (create, update) and apps/api/src/services/review.service.ts (publish)
- [ ] T018 [US1] Record ingest uploads after `uploads.upload` in apps/api/src/services/ingest.service.ts (dimensions from the upload result; extend `IngestUploadStore.upload` to return them)
- [ ] T019 [US1] `pnpm api:openapi`
- [ ] T020 [US1] Confirm step in apps/web/src/editor/use-image-upload.ts + client call in apps/web/src/api/media.ts; 422 "Unknown image" on save → "Photo expired, add it again"
- [ ] T021 [US1] [e2e:smoke] The photo journey (from [`010-e2e-journeys`](../010-e2e-journeys/spec.md); e2e/tests/smoke/editor.spec.ts until it lands) asserts the saved card has `payload.width`

**Checkpoint**: Uploads are recorded; arbitrary image ids can't be saved

---

## Phase 3: User Story 2 — Orphan sweep (Priority: P1)

**Goal**: A daily job deletes recorded images that no card references after 7 days.

**Independent Test**: Backdated unreferenced asset → deleted from the store and the table; referenced assets kept across all statuses.

### Tests for User Story 2

- [ ] T030 [P] [US2] [unit] `sweepOrphans`: chunks of 100, max 500, `not_found` counts as deleted, failed ids kept, summary log; the store sees only `deleteMany` (never a list call) in apps/api/src/jobs/media-sweep.test.ts
- [ ] T031 [P] [US2] [int] Orphan query across statuses (proposed, published, archived, deleted in window kept; purged and never-saved deleted; younger than grace kept); backfill statement protects existing references in apps/api/test/media-sweep.int.test.ts
- [ ] T032 [P] [US2] [int] Deck delete → `deleteByPrefix` for the three `gobbit/*/<deckId>/` prefixes after commit in apps/api/test/decks.int.test.ts

### Implementation for User Story 2

- [ ] T033 [US2] `media.service.sweepOrphans({ now })` in apps/api/src/services/media.service.ts
- [ ] T034 [US2] `QUEUES.MEDIA_SWEEP` in apps/api/src/jobs/queues.ts; handler apps/api/src/jobs/media-sweep.ts; schedule in apps/api/src/worker.ts only when `CLOUDINARY_URL` is set
- [ ] T035 [US2] `media.deleteForDeck(deckId)` called after commit from apps/api/src/services/decks.service.ts (logged, never fails the delete)
- [ ] T036 [P] [US2] Dev helper apps/api/scripts/run-job.ts (enqueue a named queue once) for quickstart section 3
- [ ] T037 [P] [US2] `pnpm media:reconcile` (dry run by default, `--delete` explicit) in apps/api/scripts/media-reconcile.ts; scripts in apps/api/package.json and root package.json

**Checkpoint**: PLAN.md demo 1 cleanup works locally

---

## Phase 4: User Story 3 — Upload from a URL (Priority: P2)

**Goal**: A server-side service copies a public image into a deck's storage through `safe-fetch`.

**Independent Test**: Fixture image URL → asset recorded; private address, HTML, oversize → `{ asset: null, reason }`.

### Tests for User Story 3

- [ ] T040 [P] [US3] [unit] `safe-fetch` binary mode: image MIME allow-list, magic-byte mismatch → `not_image`, cap → `too_large`, private IP → `blocked`, HTML mode unchanged, in apps/api/src/fetch/safe-fetch.test.ts and apps/api/src/fetch/image-sniff.test.ts
- [ ] T041 [P] [US3] [unit] `uploadFromUrl`: folder and tags by source, asset recorded with returned dimensions, `unavailable` without Cloudinary, never throws in apps/api/src/services/media.service.test.ts
- [ ] T042 [P] [US3] [int] `uploadFromUrl` against a local fixture server (test wiring `allowedPorts: null`) in apps/api/test/media-assets.int.test.ts

### Implementation for User Story 3

- [ ] T043 [US3] `accept: 'image'` option in apps/api/src/fetch/safe-fetch.ts + apps/api/src/fetch/image-sniff.ts
- [ ] T044 [US3] `media.service.uploadFromUrl({ deckId, url, source, uploadedBy? })` in apps/api/src/services/media.service.ts

**Checkpoint**: All three stories work independently

---

## Phase 5: Close-out

- [ ] T050 `pnpm lint && pnpm format:check && pnpm typecheck && pnpm test:unit && pnpm test:int && pnpm budget`
- [ ] T051 [P] docs/adr.md: **ADR-054**; docs/architecture.md: one ADR index row and `media-sweep` in the Worker row (map stays < 250 lines); docs/design/card-media.md: "Media assets" section (D156–D160, storage conventions table, `safe-fetch` binary mode) and its Deviations list from implementation-notes.md
- [ ] T052 [P] README.md: the sweep and its grace period, `pnpm media:reconcile`, the new route
- [ ] T053 [P] CLAUDE.md ground rules: images are referenced only through recorded assets; outbound image downloads only through `safe-fetch` `accept: 'image'`
- [ ] T054 PLAN.md: link this spec under Phase 7; tick demo 1 only after quickstart section 3 has run on the deployed instance
- [ ] T055 Run quickstart.md validation
- [ ] T056 `/speckit-converge` until it reports Converged

---

## Dependencies & Execution Order

- **Foundational (Phase 1)**: blocks all stories
- **US1 → US2**: the sweep's safety depends on references matching recorded assets (T017, T018) and on the backfill (T002)
- **US3**: independent of US1 and US2 after Phase 1; `014-link-snapshots` depends on it
- **External**: `008-card-media` merged
- **Close-out**: after all stories

### Within Each User Story

- Tests written and FAILING before implementation
- shared → repo/store → service → route → `api:openapi` → web

---

## Notes

- [P] tasks = different files, no dependencies
- Log decisions the plan did not make, and deviations, in implementation-notes.md as you go
- Commit after each task or logical group (e.g. `feat(api): asset registry and orphan sweep`)
- Never list the Cloudinary account to find orphans; never download remote images outside `safe-fetch`
