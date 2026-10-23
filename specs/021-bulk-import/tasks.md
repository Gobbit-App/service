---

description: "Task list for 021-bulk-import"
---

# Tasks: Bulk import of notes

**Input**: Design documents from `/specs/021-bulk-import/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/import-api.md; `020-item-events` merged (publish events), else add the events when 020 lands

**Tests**: REQUIRED (constitution V). Every row of the plan's traceability table maps to a test task below.

**Organization**: Tasks are grouped by user story.

## Format: `[ID] [P?] [Story] [Tier?] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: US1 import, US2 bulk publish, US3 CLI
- **[Tier]**: `[unit]` `*.test.ts(x)` next to code, `[int]` `apps/api/test/*.int.test.ts` (Docker), `[e2e:smoke]` `e2e/tests/smoke/`, `[e2e:full]` `e2e/tests/full/` (tier rule: constitution V, ADR-053)

---

## Phase 1: Foundational (Blocking Prerequisites)

- [ ] T001 `'import'` in `ingestChannels`; `IMPORT_*`, `BULK_PUBLISH_MAX` in packages/shared/src/ingest/constants.ts; `INGEST_CHANNEL_DAILY_CAPS.import = 500` in packages/shared/src/limits.ts (+ limits.test.ts row)
- [ ] T002 Migration packages/db/migrations/00NN_import_channel.sql + down file; [int] round trip in apps/api/test/imports.int.test.ts
- [ ] T003 [P] packages/shared/src/schemas/import.ts (`importRowSchema`, `importRequestSchema`, `importResultSchema`, `bulkPublishSchema`, `bulkPublishResultSchema`); `./import` subpath export
- [ ] T004 [P] `CHANNEL_LABELS.import = 'Imported'` in apps/web/src/review/source-line.ts (+ test row)

**Checkpoint**: Channel exists end to end

---

## Phase 2: User Story 1 — Notes become proposals (Priority: P1) 🎯 MVP

**Goal**: Paste/upload → preview → proposals in review.

**Independent Test**: paste 40 lines → 40 proposals labelled "Imported".

### Tests for User Story 1

- [ ] T010 [P] [US1] [unit] parse-notes.test.ts with synthetic fixtures in packages/shared/src/import/fixtures/: lines (separators, URL-only, `title — body`, long line split, Hebrew), markdown (headings → category, lists, paragraphs, skips), csv (quoted commas/newlines, BOM, case-insensitive headers, missing column), detection, invalid rows with reasons
- [ ] T011 [P] [US1] [int] Import: proposals with channel `import`, `clientLabel`; new-category suggestion; duplicate flagged and counted; > 100 rows 400; cap reached mid-import → partial result + failed rows; combined cap unaffected; editor/reader 403; non-member 404; no `extract*` llm_calls, in apps/api/test/imports.int.test.ts
- [ ] T012 [P] [US1] [unit] ImportPreview.test.tsx: untick, edit, invalid badge, over-limit message, category mapping to existing ids
- [ ] T013 [P] [US1] [e2e:full] Paste 5 lines → preview 5 → import → review filtered by source shows 5 → select all → publish → 5 cards in the deck, in e2e/tests/full/import.spec.ts

### Implementation for User Story 1

- [ ] T014 [US1] `pnpm add papaparse` (+ types) in packages/shared; packages/shared/src/import/{parse-notes,parse-lines,parse-markdown,parse-csv}.ts
- [ ] T015 [US1] Combined cap excludes `import` in apps/api/src/services/ingest.service.ts (+ unit test row)
- [ ] T016 [US1] apps/api/src/services/imports.service.ts + apps/api/src/routes/imports.ts; register; `pnpm api:openapi`; example in api.http
- [ ] T017 [US1] Lazy apps/web/src/routes/d.$slug.import.tsx; apps/web/src/import/{ImportScreen,ImportPreview,ImportResult}.tsx; "Import notes" in the deck menu for admins

**Checkpoint**: 40 notes → 40 proposals locally

---

## Phase 3: User Story 2 — Bulk publish (Priority: P1)

**Goal**: Select and publish many proposals; duplicates left for a decision.

**Independent Test**: 40 proposals → select all → published, duplicates skipped.

### Tests for User Story 2

- [ ] T020 [P] [US2] [int] Bulk publish: `new` published with `published` events; `possible_duplicate`/`update` → `needs-decision`; already handled / other deck → `already-handled`; > 50 ids 400; editor 403; `?source=` filter, in apps/api/test/review.int.test.ts
- [ ] T021 [P] [US2] [unit] ReviewQueue.test.tsx: select mode, select all shown, publish selected, skipped toast, source filter chip

### Implementation for User Story 2

- [ ] T022 [US2] `review.service.publishMany` and list `source` filter in apps/api/src/services/review.service.ts; routes in apps/api/src/routes/review.ts; `pnpm api:openapi`
- [ ] T023 [US2] Select mode and source filter in apps/web/src/review/ReviewQueue.tsx; cache update in review-cache.ts

**Checkpoint**: Demo 6 works locally

---

## Phase 4: User Story 3 — CLI (Priority: P3)

**Goal**: `pnpm import:notes <file> --deck <slug>`.

**Independent Test**: 40-line file → 40 proposals; `--dry-run` imports nothing.

### Tests for User Story 3

- [ ] T030 [P] [US3] [unit] scripts/import-notes.test.ts: chunks by 100, dry run prints rows, exit code 1 on failures, missing env → clear error

### Implementation for User Story 3

- [ ] T031 [US3] scripts/import-notes.ts (uses `@pb/api-client` and `parseNotes`); `"import:notes"` in package.json

**Checkpoint**: All three stories work independently

---

## Phase 5: Close-out

- [ ] T050 `pnpm lint && pnpm format:check && pnpm typecheck && pnpm test:unit && pnpm test:int && pnpm build:web && pnpm budget`
- [ ] T051 [P] docs/design/ingestion.md: import channel, caps, bulk publish; docs/architecture.md map entry
- [ ] T052 [P] README.md: Import screen and CLI (`GOBBIT_API_URL`, `GOBBIT_TOKEN`)
- [ ] T053 [P] CLAUDE.md key commands: `pnpm import:notes`
- [ ] T054 PLAN.md: tick demo 6 only after quickstart section 4 has run on the deployed instance
- [ ] T055 Run quickstart.md validation
- [ ] T056 `/speckit-converge` until it reports Converged

---

## Dependencies & Execution Order

- **Foundational (Phase 1)**: blocks all stories
- **US1** and **US2**: independent after Phase 1 (US2 can be tested with shared proposals)
- **US3**: after US1 (parser + endpoint)
- **Close-out**: after all stories

### Within Each User Story

- Tests written and FAILING before implementation
- shared → db → service → route → `api:openapi` → web

---

## Notes

- [P] tasks = different files, no dependencies
- Fixtures are synthetic (no real notes, names or numbers: specs and tests are public)
- Log decisions the plan did not make, and deviations, in implementation-notes.md as you go
- Commit after each task or logical group (e.g. `feat(api): bulk import`)
