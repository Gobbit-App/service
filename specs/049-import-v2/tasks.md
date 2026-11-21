---

description: "Task list for Import v2 — seed a communal deck from curated Markdown"
---

# Tasks: Import v2 — seed a communal deck from curated Markdown

**Input**: Design documents from `/specs/049-import-v2/` — [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/import-v2-api.md](./contracts/import-v2-api.md), [quickstart.md](./quickstart.md)

**Prerequisites**: plan.md, spec.md (both present). No migration (data-model.md): there is no schema or down-file task.

**Tests**: REQUIRED (constitution V). Every logic task has a test task at the tier named in plan.md's traceability table. **E2E tier: full** (plan) — one `@full` journey, no smoke.

**Organization**: grouped by user story. **Two PRs** (plan Summary): **PR 1** = Phases 1–7 (US1–US6); **PR 2** = Phase 8 (US7, media from the CLI). Close-out (Phase 9) runs per PR for the parts that PR touches.

## Format: `[ID] [P?] [Story] [Tier?] Description`

- **[P]**: different files, no dependency on an incomplete task
- **[Tier]** on test tasks: `[unit]` `*.test.ts` next to code, `[int]` `*.int.test.ts` in `apps/api/test/` (Docker), `[e2e:full]` `e2e/tests/full/`
- **UI tasks** (`.tsx`/`.css`) name their sibling (plan "UI reference") and end with "screenshots: phone 412 px + desktop 1280 px, light + dark, compared with <sibling>"; without screenshots the task is blocked, not done
- Fixtures use made-up content only (the repository is public)

---

## Phase 1: Foundational (Blocking Prerequisites)

**Purpose**: shared shapes, constants, env and the decision-event catalogue every story uses

- [X] T001 Add constants in `packages/shared/src/ingest/constants.ts`: `IMPORT_DAILY_CAP_DEFAULT = 500`, `IMPORT_ROWS_PER_PREVIEW = IMPORT_DAILY_CAP_DEFAULT`, `IMPORT_DISCARD_MAX = 1000`, `IMPORT_UNMATCHED_MAX = 5` (`IMPORT_ROWS_PER_REQUEST` stays 100); point `INGEST_CHANNEL_DAILY_CAPS.import` in `packages/shared/src/limits.ts` at `IMPORT_DAILY_CAP_DEFAULT`; replace every use of the old 150 / old preview limit (grep `IMPORT_ROWS_PER_PREVIEW` and `INGEST_CHANNEL_DAILY_CAPS` in `apps/`)
- [X] T002 [P] [unit] Cap and preview-limit values (500, preview = cap, request 100, discard max 1000) in `packages/shared/src/limits.test.ts`
- [X] T003 Reshape the parsed row in `packages/shared/src/import/constants.ts` per data-model.md "Parsed row": `categories: string[]` replaces `category: string | null`; `type` gains `media` (`importCardTypes`); add `cover: string | null`, `image: string | null`; `ImportParseResult` gains `ignored: { line: number; text: string }[]`. Update `note-row.ts` `rowError` (checks per-category name length, `categories` and field errors), and migrate the 021 parsers (`parse-markdown.ts`, plain text, CSV `category` column → one-entry `categories`) and their callers in `apps/web/src/import/` and `apps/api/scripts/lib/import-notes-cli.ts` so the whole repo typechecks with 021 behaviour unchanged
- [X] T004 [P] [unit] Existing 021 parser cases kept green after T003, plus CSV and Markdown rows now report `categories` as an array, in `packages/shared/src/import/parse-notes.test.ts` (and the sibling parser tests)
- [X] T005 Extend `packages/shared/src/schemas/import.ts` per data-model.md "Request draft" (draft stays `.strict()`): optional `type` (`text` | `link` | `media`), `categoryIds` (uuid[], unique), `unmatched` (string[] "≤ 5, each ≤ `NAME_MAX`"), `cover` (`coverInputSchema`, `{ publicId }`), `payload` (`mediaPayloadSchema`, `type: media` only); request gains `strict?: boolean` (default false); `importResultSchema` = `{ imported, duplicates, refused, failed[] }` with `failed[]` unchanged (`{ index, problem, detail? }`); the "failed" count FR-010 asks for is the entries of `failed[]` whose problem is `/problems/internal`, the other entries are the `refused` count — clients derive it, no extra field; add `discardImportRequestSchema` `{ source: string (1…IMPORT_LABEL_MAX, trimmed) }` and `discardImportResultSchema` `{ discarded: int ≥ 0, skipped: int ≥ 0 }`
- [X] T006 [P] [unit] Schema tests (old request body without `strict`/`unmatched` still valid; `unmatched` > 5 rejected; empty `source` rejected; unknown key rejected) in `packages/shared/src/schemas/import.test.ts`
- [X] T007 Add `INGEST_IMPORT_DAILY_CAP` (`positiveInt`, optional, default `IMPORT_DAILY_CAP_DEFAULT`) to `apps/api/src/env.ts` and apply it as the `import` entry of `dailyCaps` in `apps/api/src/services/ingest-wiring.ts` (D447; `createCapGuard` unchanged)
- [X] T008 [P] [unit] Env override of the import cap (unset → 500, set → value, invalid → rejected) in `apps/api/src/env.test.ts` (or the existing ingest-wiring test)
- [X] T009 [P] Create the decision catalogue `apps/api/src/imports/imports.events.ts` (model on `items.events.ts`): `imports.rows_refused` (reasons `daily_cap`, `unmatched_category`, `invalid_row`; fields requestId, actorId, deckId, count, cap for `daily_cap`), `imports.completed` (imported, duplicates, refused), `imports.discarded` (discarded, skipped), `imports.discard_refused` (reasons `forbidden`, `no_pending`), `categories.slug_derived` (reason `hash_fallback`, categoryId) — ids and counts only, never names, titles, labels or card text (plan Accountability table; one event per reason per request, D451)
- [X] T010 [P] Reserve D443–D451 and ADR-082 in `specs/README.md` (reservations list) so parallel work does not reuse them

**Checkpoint**: shared shapes, cap and event catalogue exist; the repo typechecks and the 021 tests pass.

---

## Phase 2: User Story 1 — One card per section, formatting kept (Priority: P1) 🎯 MVP

**Goal**: a `##` file imports as one proposal per section with title, verbatim body and the `#` category (FR-001–FR-003, FR-006).

**Independent Test**: import a fixture with a three-paragraph Hebrew card under a `##` heading; one proposal arrives with the same title and body in the heading's category.

### Tests for User Story 1

> Write first; they must FAIL before implementation.

- [X] T011 [P] [US1] [unit] Made-up fixtures `packages/shared/src/import/fixtures/{hebrew-health,english-city,greek-mixed,legacy-h2-group,no-h2}.md` (Hebrew/English/Greek; paragraphs, single line breaks, list, bold, link, a fenced code block holding a `## ` line, `###` inside a body, text outside any section, a section before any `#`)
- [X] T012 [P] [US1] [unit] Parser cases in `packages/shared/src/import/parse-sections.test.ts`: `#` = category, `##` = card, body is the raw text up to the next `#`/`##` with blank edge lines trimmed and the interior kept (no whitespace collapse), `###` and deeper are body, `##` inside a code fence is body (D443), text outside any section → `ignored` with its line, section before any `#` → no category (reported), over-limit title/body → row error with the `##` line (FR-001, FR-002); RTL body line after the fields stays body
- [X] T013 [P] [US1] [unit] A file with no `##` parses exactly as 021 (the legacy fixtures) and a file with `##` switches mode, in `packages/shared/src/import/parse-notes.test.ts`
- [X] T014 [P] [US1] [unit] CLI and shared parser agree: `apps/api/scripts/lib/import-notes-cli.test.ts` parses the same fixtures as T012 and compares rows (FR-006)
- [X] T015 [P] [US1] [int] A card-per-section row reaches `proposeDirect` with body verbatim (paragraphs, list, bold, link survive; stored as proposed; `llm_calls` empty) in `apps/api/test/imports.int.test.ts`

### Implementation for User Story 1

- [X] T016 [US1] Create `packages/shared/src/import/parse-sections.ts` (zod-free, line-based, linear): fence tracking, `#` / `##` detection, section body capture, `ignored` collection; reuse `rowError`, `withError`, `matchCategory` helpers (plan Reuse check); no Markdown library
- [X] T017 [US1] In `packages/shared/src/import/parse-notes.ts` detect "a `##` heading outside a code fence" and route to `parse-sections.ts`, else the existing 021 path; export from the `@gobbit/shared/import` subpath
- [X] T018 [US1] `toImportDraft` in `packages/shared/src/import/to-draft.ts` passes `title` and the raw `body` through (no stripping) for section rows
- [X] T019 [US1] Preview rows: show title, body excerpt and "ignored text" notice with its line in `apps/web/src/import/preview-rows.ts` and `ImportPreviewRow.tsx`; add one help-text line on `ImportInput.tsx` saying `##` now starts a card and `#` groups (spec Edge Cases, plan Rollout). UI reference: the invalid-row state and category chip text in `ImportPreviewRow.tsx`; screenshots: phone 412 px + desktop 1280 px, light + dark, compared with the existing import preview
- [X] T020 [P] [US1] [unit] Preview mapping and ignored-text notice in `apps/web/src/import/preview-rows.test.ts` and `ImportPreview.test.tsx`

**Checkpoint**: US1 works and is demoable on its own (one category per file, no fields yet).

---

## Phase 3: User Story 2 — Per-card fields and several categories (Priority: P1)

**Goal**: `source`, `categories`, `type`, `cover`, `image` lines under the heading; a card can be filed in several categories (FR-004, FR-005).

**Independent Test**: import a section with each supported key; the proposal carries source, both categories and the type; `colour: red` is a row error naming key and line.

### Tests for User Story 2

- [X] T021 [P] [US2] [unit] Field cases in `packages/shared/src/import/parse-sections.test.ts`: each key parsed; `categories` split on `,` `،` `，`, trimmed, de-duplicated by the `matchCategory` key; `type` ∈ `text`/`link`/`media`, other → error; `link` card takes URL from `source`, and `type: link` without `source` → error; `type: media` without `image` and `image` without `type: media` → error; unknown / empty / malformed (`source` not a web address) / repeated key → row error with key and line; a `key: value` line after body started is body; field block ends at the first non-field line (D444, Acceptance 2.1–2.5)
- [X] T022 [P] [US2] [unit] `toImportDraft` maps several names to several `categoryIds`, drops repeats, in `packages/shared/src/import/to-draft.test.ts`
- [X] T023 [P] [US2] [int] Multi-category row: proposal carries both categories; link row carries `sourceUrl`; categories the caller cannot see are refused (as `proposeDirect` does today) in `apps/api/test/imports.int.test.ts`

### Implementation for User Story 2

- [X] T024 [US2] Add field-line parsing to `packages/shared/src/import/parse-sections.ts` (keys, validation, line numbers, error messages naming key and line) per D444
- [X] T025 [US2] `toImportDraft` in `packages/shared/src/import/to-draft.ts`: map each category name to an existing id by name or address (same matching as today), emit `categoryIds` (unique), `type`, `sourceUrl`; unmatched names go to `unmatched` (consumed in US3)
- [X] T026 [US2] Accept several categories in `apps/api/src/ingest/import-rows.ts` and `apps/api/src/services/imports.service.ts`: `categoryIds` list, `type`, `sourceUrl` into `proposeDirect`; old single-`categoryId`/`newCategory` clients unchanged
- [X] T027 [US2] Preview shows every category of a row as chips in `apps/web/src/import/ImportPreviewRow.tsx` (UI reference: the existing category chip text there); screenshots: phone 412 px + desktop 1280 px, light + dark, compared with the existing preview row

- [X] T027a [US2] PR 1 guard until PR 2 lands: a row with `cover`, `image` or `type: media` is a row error ("media is not supported yet") in `packages/shared/src/import/parse-sections.ts` (so the app preview, the CLI and the dry run all refuse it instead of silently dropping the media); T066/T064 replace this guard with the "import from the command line" state and the upload. Test: `[unit]` case in `parse-sections.test.ts`

**Checkpoint**: US1 + US2 give a complete English seed path with existing categories.

---

## Phase 4: User Story 3 — Categories that match, in any script (Priority: P1)

**Goal**: non-Latin category names get a stable derived address; strict mode refuses unmatched names (FR-007, FR-008).

**Independent Test**: create `בריאות` from the app (succeeds); strict import with one matching and one misspelled name → one proposal, one refusal naming the misspelling; publish a proposal suggesting a Hebrew category (succeeds).

### Tests for User Story 3

- [X] T028 [P] [US3] [unit] `toCategorySlug` in `apps/api/src/lib/slug.test.ts`: Latin name unchanged; name `slugify` reduces to nothing → `c-` + first 8 hex of SHA-256 of the NFC-normalised, lower-cased name; same name in different case/normalisation → same address; mixed script keeps today's slug (D445)
- [X] T029 [P] [US3] [unit] Category create emits `categories.slug_derived` and an explicit `slug` still wins, in `apps/api/src/services/categories.service.test.ts`
- [X] T030 [P] [US3] [unit] Strict mode in `packages/shared/src/import/to-draft.test.ts`: unmatched names are carried in `unmatched` and the row is marked refused in the preview (the draft is still produced, the server decides); non-strict, exactly one unmatched → previewed as the suggestion; more than one → preview hint only (the server rule in T035 is authoritative); address in another script counts as a match
- [X] T031 [P] [US3] [unit] `imports.service` strict handling, `imports.rows_refused` (`unmatched_category`, one event per request with `count`) and `imports.completed` (imported, duplicates, refused counts) in `apps/api/src/services/imports.service.test.ts`
- [X] T032 [P] [US3] [int] Hebrew category created from the API (201, derived address, clash → 409 asking for explicit address); publishing a proposal with a Hebrew suggested category creates it and writes `categories.slug_derived` (event asserted on the publish path too); strict import: matched row proposed, misspelled row `failed` with `/problems/import-unmatched-category` and the name in `detail`, no category suggestion created; non-strict with two unmatched names → `/problems/import-too-many-new-categories` — in `apps/api/test/categories.int.test.ts`, `apps/api/test/review.int.test.ts`, `apps/api/test/imports.int.test.ts`

### Implementation for User Story 3

- [X] T033 [US3] Add `toCategorySlug(name)` beside `toSlug` in `apps/api/src/lib/slug.ts` (Node `crypto` SHA-256; no new dependency)
- [X] T034 [US3] Use `toCategorySlug` in `apps/api/src/services/categories.service.ts` (create: explicit `slug` wins; write `categories.slug_derived` when the fallback is used) and in `ensureNewCategory` in `apps/api/src/services/review.service.ts` (replace the "no usable name" 400)
- [X] T035 [US3] `strict` handling: `toImportDraft(row, categories, { strict })` always returns a draft, with unmatched names in `unmatched` (it never drops a row client-side: the server must see and record every refusal, FR-010; strict only changes the preview marking and the dry-run report) (`packages/shared/src/import/to-draft.ts`); `apps/api/src/services/imports.service.ts` refuses rows with non-empty `unmatched` when `strict`, else moves exactly one unmatched name into `newCategory` and fails more than one; write `imports.rows_refused` (once per reason per request) and `imports.completed`; result `refused` = rows refused by rule, `failed[]` unchanged (D446, D451)
- [X] T036 [US3] Route: accept `strict` in `apps/api/src/routes/imports.ts`, then `pnpm api:openapi` (regenerate `@gobbit/api-client`; commit the diff)
- [X] T037 [US3] Strict-mode checkbox (off by default) in `apps/web/src/import/ImportInput.tsx`, passed through `ImportScreen.tsx` and `use-import-notes.ts`; unmatched categories shown on the preview row. UI reference: the checkbox row of the existing import input options; screenshots: phone 412 px + desktop 1280 px, light + dark, compared with `ImportInput.tsx` options
- [X] T038 [P] [US3] [unit] Strict option wiring and preview of unmatched names in `apps/web/src/import/ImportPreview.test.tsx` (or `ImportScreen.test.tsx`)
- [X] T039 [US3] CLI: strict on by default, `--no-strict` flag, read the deck's categories with `GET /decks/{id}/categories`, print unmatched names, in `apps/api/scripts/import-notes.ts` and `apps/api/scripts/lib/import-notes-cli.ts` (+ usage text `IMPORT_NOTES_USAGE`)
- [X] T040 [P] [US3] [unit] Flag parsing (`--no-strict`, default strict) and request body (`strict` sent) with a fake request function in `apps/api/scripts/lib/import-notes-cli.test.ts`

**Checkpoint**: Hebrew taxonomy can be created and seeded safely.

---

## Phase 5: User Story 4 — A dry run that finds the problems (Priority: P1)

**Goal**: `--dry-run` reports counts per category and every problem with its line; writes nothing (FR-011).

**Independent Test**: dry-run a fixture with one of each problem; each is reported with its line; no write route is called.

### Tests for User Story 4

- [X] T041 [P] [US4] [unit] `packages/shared/src/import/dry-run.test.ts`: fixture with one of each problem (title over limit, body over limit, no category, unmatched category in strict mode, unknown field, malformed web address, repeated field) → all reported with correct lines; clean fixture → no problems and counts equal what `toImportDraft` would produce (SC-003); counts per category include second categories
- [X] T042 [P] [US4] [unit] CLI dry run in `apps/api/scripts/lib/import-notes-cli.test.ts`: fake request records no POST (only `GET /decks/{id}/categories`), exit code 1 with problems, 0 when clean, without `--deck`/token it skips deck checks and says so (D448)

### Implementation for User Story 4

- [X] T043 [US4] Create `packages/shared/src/import/dry-run.ts`: `report(rows, categories, { strict })` → per-category counts + problems with lines; zod-free; exported from `@gobbit/shared/import`
- [X] T044 [US4] Wire `--dry-run` in `apps/api/scripts/lib/import-notes-cli.ts` to `report` using the deck's real categories when `--deck` and a token are given; print the shape in contracts/import-v2-api.md "Dry-run output"; exit 1 on problems; no write route, no upload (media file existence/kind checks arrive in T064)

**Checkpoint**: curators can lint files before importing.

---

## Phase 6: User Story 5 — Import a whole seed without waiting days (Priority: P1)

**Goal**: 400 rows in one day imports; limit refusals are reported and recorded (FR-009, FR-010).

**Independent Test**: with the default cap import 400 rows in one day (all proposed); with the cap set low, rows over it are refused, listed and recorded.

### Tests for User Story 5

- [X] T045 [P] [US5] [unit] `daily_cap` refusal writes one `imports.rows_refused` event with `count` and `cap` (not per row) and rows already proposed stay, in `apps/api/src/services/imports.service.test.ts`
- [X] T046 [P] [US5] [int] 400 rows over four requests in one day all proposed with the default cap; then a low `INGEST_IMPORT_DAILY_CAP`: remaining rows listed `/problems/rate-limited`, `refused` counts them, event recorded; nothing imported yet → `429` with `Retry-After`; result counts imported/duplicates/refused/failed; also an invalid-on-server row records `invalid_row`; and a 100-row card-per-section request completes under a generous timing guard (SC-004) — in `apps/api/test/imports.int.test.ts`
- [X] T047 [P] [US5] [unit] Preview limit follows the cap (file with 500 rows previews, 501 asks to split) in `apps/web/src/import/preview-rows.test.ts`

### Implementation for User Story 5

- [X] T048 [US5] In `apps/api/src/services/imports.service.ts`: on cap refusal list the remaining rows with `/problems/rate-limited` and `detail "Daily import limit reached"` plus when the oldest counted row ages out of the rolling day (ISO time; the same value as `Retry-After` in the 429 case), count them in `refused`, write `imports.rows_refused` (`daily_cap`), keep the existing `429` + `Retry-After` when no row was imported; record `invalid_row` for server-side row rejects (T035 already wrote `imports.completed`)
- [X] T049 [US5] Web: preview limit uses `IMPORT_ROWS_PER_PREVIEW` from `@gobbit/shared/ingest` subpath in `apps/web/src/import/preview-rows.ts`, and the result panel in `ImportScreen.tsx` shows imported / duplicates / refused / failed with the "not imported" rows and unmatched names (UI reference: the result notice pattern of `BulkPublishNotice.tsx`); screenshots: phone 412 px + desktop 1280 px, light + dark, compared with that sibling
- [X] T050 [P] [US5] CLI prints imported / duplicates / refused / failed and refusal reasons (chunks of 100) in `apps/api/scripts/lib/import-notes-cli.ts`, with a unit test in `import-notes-cli.test.ts`

**Checkpoint**: a 400-card seed fits one evening.

---

## Phase 7: User Story 6 — Undo a bad import in one action (Priority: P2)

**Goal**: "Discard all from this import" in the review queue (FR-012).

**Independent Test**: import 10 rows, publish 2, bulk-discard the label; 8 discarded, 2 published untouched, 8 log entries.

### Tests for User Story 6

- [X] T051 [P] [US6] [unit] `review.service.discardImport` in `apps/api/src/services/review.service.test.ts`: success writes `imports.discarded` with `discarded` and `skipped`; forbidden for non-publishers writes `imports.discard_refused` (`forbidden`); no pending → `{0,0}` and `no_pending`; caps at `IMPORT_DISCARD_MAX`; a card that left `proposed` meanwhile counts as `skipped`
- [X] T052 [P] [US6] [int] 10 import rows, 2 published, discard by label → `{ discarded: 8, skipped: 0 }`, 8 `item_events` `discarded` rows attributed to the actor, uploads released, published cards untouched, second call `{0,0}`; reader/contributor → 403; unseen deck → 404; empty `source` → 400; concurrent publish of one id ends published-or-discarded, never both — in `apps/api/test/review.int.test.ts`
- [X] T053 [P] [US6] [unit] Select-bar action visible only with a source filter, confirm sheet, result notice in `apps/web/src/review/ReviewSelectBar.test.tsx`

### Implementation for User Story 6

- [X] T054 [US6] Repository: ids of pending proposals by `client_label` and deck, ordered, limited to `IMPORT_DISCARD_MAX` — reuse the `GET /decks/{id}/review?source=` query (id-only variant if it pages) in `apps/api/src/repositories/items.repo.ts` (or `jobs.repo.ts`)
- [X] T055 [US6] `discardImport(actor, deckId, source)` in `apps/api/src/services/review.service.ts`: `authorize(…, 'item.publish')`, loop `review.service.discard` one transaction per card (per-card log entry and upload release are the single-discard ones), skip cards handled meanwhile, write `imports.discarded` (or `imports.discard_refused`); returns `{ discarded, skipped }` (D449)
- [X] T056 [US6] Route `POST /decks/{id}/review/discard` (tag `review`, `discardImportRequestSchema`/`…ResultSchema`) in `apps/api/src/routes/review.ts`, then `pnpm api:openapi`; add an example to `apps/api/api.http`
- [X] T057 [US6] "Discard all from this import" action in `apps/web/src/review/ReviewSelectBar.tsx` / `ReviewQueue.tsx` shown when a source filter is on: `ui/buttons` + icon from `ui/icons`, confirm in `ui/sheet`, result like `BulkPublishNotice.tsx`, invalidate the review queries on success. UI reference: the bulk "Publish" action in `ReviewSelectBar.tsx`; screenshots: phone 412 px + desktop 1280 px, light + dark, compared with that action
- [X] T058 [US6] [e2e:full] Journey `e2e/tests/full/import-sections.spec.ts`: paste a card-per-section file → preview shows cards and categories → import → filter by import → "Discard all from this import" → queue empty; tagged `@full`, own `smoke-`-style deck created and deleted by the test

**Checkpoint (end of PR 1)**: US1–US6 complete; run Close-out for PR 1 (Phase 9) before opening it.

---

## Phase 8: User Story 7 — Images and media from the command line (Priority: P3) — PR 2

**Goal**: `cover` / `image` files uploaded by the CLI through the deck's signed upload and referenced by recorded assets (FR-013, FR-014, D450).

**Independent Test**: with a fake uploader import a file with one cover and one media card; both proposals reference assets recorded for the deck; no real upload.

### Tests for User Story 7

- [X] T059 [P] [US7] [unit] `apps/api/scripts/lib/import-media.test.ts` with a fake uploader: paths resolved relative to the file, `media/sign` → upload → `media/assets` order, MIME → kind via `@gobbit/shared/media` rules (`classifyShareFiles`), missing file or unsupported kind → row error naming path and line with nothing uploaded, one upload per distinct path
- [X] T060 [P] [US7] [unit] Dry run checks media paths exist and are an accepted kind, and uploads nothing, in `packages/shared/src/import/dry-run.test.ts` / `import-notes-cli.test.ts` (injected file-exists check)
- [X] T061 [P] [US7] [int] Cover row and `type: media` row: proposals reference assets recorded for the deck; a `publicId` of another deck's asset is refused (D160); no Cloudinary call — in `apps/api/test/imports.int.test.ts`
- [X] T062 [P] [US7] [unit] Rows with `cover`/`image` are marked "import from the command line" and are excluded from the import request in `apps/web/src/import/preview-rows.test.ts` and `ImportPreview.test.tsx` (FR-014)

### Implementation for User Story 7

- [X] T063 [US7] Create `apps/api/scripts/lib/import-media.ts`: injectable uploader; sign → multipart POST to Cloudinary with Node `fetch`/`FormData` → record via `POST /decks/{id}/media/assets`; returns `{ cover: { publicId } }` or a media `payload` built from the recorded asset (dimensions from the asset)
- [X] T064 [US7] Use it in `apps/api/scripts/lib/import-notes-cli.ts`: upload before proposing, send drafts with `cover` / `payload`, leave orphans to `media-sweep`; extend the dry-run file checks from T044
- [X] T065 [US7] Server side: `apps/api/src/ingest/import-rows.ts` and `imports.service.ts` accept `type: media` with `payload` and `cover` through `parseDirectDraft` and the existing asset-for-deck rule; no change to publish
- [X] T066 [US7] Web: media rows get the "import from the command line" state in `apps/web/src/import/preview-rows.ts` and `ImportPreviewRow.tsx`, never sent. UI reference: the invalid-row state in `ImportPreviewRow.tsx` (same marker, different copy); screenshots: phone 412 px + desktop 1280 px, light + dark, compared with that state
- [X] T067 [US7] `pnpm api:openapi` if the draft schema changed in this PR

**Checkpoint (end of PR 2)**: all seven stories complete.

---

## Phase 9: Close-out

**Purpose**: keep the repository's docs and gates true (run for each PR; PR 1 covers T068–T076 except media, PR 2 the media parts)

- [X] T068 `pnpm lint && pnpm format:check && pnpm typecheck && pnpm test:unit && pnpm test:int` and `pnpm budget` (parser sits in the lazy import chunk; subpath imports only); `pnpm api:openapi` shows no drift
- [X] T069 `pnpm test:e2e --grep @full` passes for `import-sections.spec.ts` (plan: E2E tier full; `@smoke` untouched)
- [X] T070 [P] `docs/design/ingestion.md`: "Import format" (headings, fields, strict mode, media), "Import limits" runbook (raise `INGEST_IMPORT_DAILY_CAP` for a seeding session, restart, put it back), dry run, bulk discard, and the "Deviations from the plan" list from `implementation-notes.md` (FR-016)
- [X] T071 [P] `docs/adr.md`: ADR-082 (D443 parser trigger, D445 derived category address) and one index row in `docs/architecture.md` (keep it < 250 lines)
- [X] T072 [P] `README.md`: `INGEST_IMPORT_DAILY_CAP` in the env table, `pnpm import:notes` flags (`--dry-run`, `--no-strict`, `--label`), link to the import format; `infra/docker-compose.yml` `x-api-env` entry
- [X] T073 [P] `CHANGELOG.md`: env var (optional, not a deploy blocker), the 021 change (`##` now starts a card), new route, Hebrew category addresses
- [X] T074 [P] `CLAUDE.md` ground rules: Ingestion line mentions card-per-section import, strict mode and bulk discard (one line)
- [X] T075 `PLAN.md`: link this spec under its phase; `community-go-list.md` Track A tracking (start, tick on merge, deviations in the progress log)
- [X] T076 Run `quickstart.md` validation against a local stack (made-up Hebrew file: dry run → strict import → filter → discard)
- [ ] T077 `/speckit-converge` until it reports Converged, then `/ponytail:ponytail-review` before each PR (CLAUDE.md "Before a PR")

---

## Dependencies & Execution Order

- **Phase 1** blocks everything. T003 before T004/T005; T005 before T006; T009 before T031/T035/T045/T051/T055. T027a is removed by T064–T066 in PR 2.
- **US1** (Phase 2) first: it creates `parse-sections.ts`. **US2** builds on US1's parser and draft mapping. **US3** needs US2's `toImportDraft` (`unmatched`) and Phase 1 events. **US4** needs US2/US3 (fields, strict). **US5** needs US3's `imports.service` changes (same file). **US6** is independent of US2–US5 after Phase 1 (only needs import rows to exist) and may run in parallel with them.
- **US7** (PR 2) needs US2 (fields) and US4 (dry run) merged.
- Within a story: tests written and failing → shared → API repo → service → route → `api:openapi` → web.

### Parallel Opportunities

- Phase 1: T002, T004, T006, T008, T009 in parallel after their targets.
- US1: T011–T015 together; US2: T021–T023; US3: T028–T032; US4: T041–T042; US6 tests T051–T053.
- US6 (API half T054–T056) alongside US3–US5 by a second worker — different files except `review.service.ts` (US3 T034 touches `ensureNewCategory`: sequence T034 before T055).
- Same-file tasks (`parse-sections.ts`: T016, T024; `imports.service.ts`: T026, T035, T048, T065; `import-notes-cli.ts`: T039, T044, T050, T064; `ImportPreviewRow.tsx`: T019, T027, T066) are sequential.

## Implementation Strategy

- **MVP**: Phase 1 + US1 + US2 + US3 gives a safe seed path; add US4 (dry run) and US5 (limits) before the real seed; US6 is the safety net. These together are PR 1.
- **PR 2**: US7 only, merged after PR 1 is deployed and the curators have started with text and link cards.
- Log decisions the plan did not make and deviations in `specs/049-import-v2/implementation-notes.md`; commit after each task or logical group (conventional commits, e.g. `feat(shared): …`).
