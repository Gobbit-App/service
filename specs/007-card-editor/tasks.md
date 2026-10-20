---

description: "Task list for 007-card-editor"
---

# Tasks: Card editor (create and edit)

**Input**: Design documents from `/specs/007-card-editor/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/ (and 006-card-lifecycle for `deckHref` / `CardActions`)

**Tests**: REQUIRED (constitution V). Every logic task has a matching test task, and every traceability row in plan.md maps to a test task below.

## Format: `[ID] [P?] [Story] [Tier?] Description`

## Phase 1: Foundational (Blocking Prerequisites)

**Purpose**: Zod-free limits, the shared draft model, stores and hooks that every story uses

- [X] T001 Record the baseline `pnpm build:web && pnpm budget` figure in specs/007-card-editor/implementation-notes.md (SC-006 baseline)
- [X] T002 [P] Add zod-free subpath: packages/shared/src/card-limits.ts (re-export `CARD_TITLE_MAX`, `CARD_BODY_MAX`, `PAYLOAD_MAX_BYTES`, `TABLE_MAX_ROWS`, `TABLE_MAX_COLUMNS`, `CALC_MAX_FIELDS`, `NAME_MAX` from `limits.ts`, `codePointLength`/`utf8Bytes` from `utils/utf8-bytes.ts`) + `"./card-limits"` in packages/shared/package.json
- [X] T003 [P] Re-export `validateCalcExpression` from packages/shared/src/calc/evaluate.ts (the `./calc` subpath)
- [X] T004 [P] [unit] packages/shared/src/card-limits.test.ts: values equal `limits.ts`; module graph imports no `zod` (assert via a static import scan)
- [X] T005 [P] [unit] apps/web/src/editor/draft.test.ts: `emptyDraft`, `draftFromItem` (pads short table rows), `toCreateBody`, `toPatch` (null when unchanged; order-insensitive categories; whole payload on any payload change; whole entities after removal; `sourceUrl: null` when cleared; never `type`/`status`). Port all cases from apps/web/src/review/review-edit.test.ts
- [X] T006 apps/web/src/editor/draft.ts (D137) to pass T005
- [X] T007 [P] [unit] apps/web/src/editor/validate.test.ts: title/body code points (emoji, Hebrew, combining marks), payload bytes, link http(s), table shape and empty headings, calc key regex/uniqueness/≤ 6, ≥ 1 category; parity cases fed to both `validate.ts` and the `@pb/shared` Zod item/payload schemas (Node test, zod allowed) must agree
- [X] T008 apps/web/src/editor/validate.ts (R6) to pass T007; text/link/table checks import only `@pb/shared/card-limits`; calc expression check injected by `CalcFields` (keeps mathjs out)
- [X] T009 [P] [unit] apps/web/src/editor/problem-fields.test.ts: validation `errors[].path` → field; 400 `categoryIds`; 422 `/problems/item-needs-category` → `categoryIds`; 409; constraint-violation / payload-too-large / 403 / network → form-level
- [X] T010 apps/web/src/editor/problem-fields.ts to pass T009 (falls back to `api/problem-messages.ts`)
- [X] T011 [P] [unit] apps/web/src/editor/drafts-store.test.ts (in-memory `DraftsKv`): key builders, set/get/del, unknown `v` discarded, `clear()`
- [X] T012 apps/web/src/editor/drafts-store.ts (D145) on `createStore('gobbit-drafts','drafts')`, following share/share-store.ts
- [X] T013 [P] [unit] apps/web/src/cards/Card.test.tsx: `preview` hides favorite/share/actions and renders title/chips without links
- [X] T014 Add `preview` prop to apps/web/src/cards/Card.tsx
- [X] T015 Move apps/web/src/review/EntityChips.tsx (+ test) → apps/web/src/cards/EntityChips.tsx; add optional `onRemove`; update imports in apps/web/src/review/ReviewCard.tsx
- [X] T016 [P] [unit] apps/web/src/cards/EntityChips.test.tsx: remove buttons only with `onRemove`, label per kind
- [X] T017 [P] apps/web/src/api/update-item.ts `useUpdateItem` (PATCH `/items/{id}`; set `queryKeys.item`, invalidate `itemLists` + `SEARCH_KEY`, proposals → `replaceReviewItem` / invalidate `REVIEW_KEY`) + [unit] apps/web/src/api/update-item.test.ts
- [X] T018 [P] apps/web/src/api/create-item.ts: also invalidate `SEARCH_KEY`; extend apps/web/src/api/create-item.test.ts [unit]

**Checkpoint**: Foundation ready. The draft model, validation, error mapping, stores and cache hooks are tested.

---

## Phase 2: User Story 1 - Create a text or link card with a preview (Priority: P1) 🎯 MVP

**Goal**: replace the Phase 3B form with `editor/CardEditor` for text and link, with preview, budgets and multi-category chips (no inline create yet)

**Independent Test**: create a text and a link card; the preview and the list match

### Tests for User Story 1

- [ ] T019 [P] [US1] [unit] apps/web/src/editor/CardEditor.test.tsx: Save disabled over 600 code points / with 0 categories; default category preselected; server 422 shown on categories and draft kept
- [ ] T020 [P] [US1] [unit] apps/web/src/editor/fields/LinkFields.test.tsx: URL check, preview title/description edits, `payload.preview.image` preserved, `previewSlot` rendered with ctx
- [ ] T021 [P] [US1] [e2e] e2e/tests/smoke/editor.spec.ts: update the existing text/link/601-char cases to the new labels; add preview text = list text; reader opening `/d/<slug>/new` sees "You can't add cards here"

### Implementation for User Story 1

- [ ] T022 [US1] apps/web/src/editor/fields/{TitleField,BodyField,SourceUrlField,LimitMeter}.tsx
- [ ] T023 [US1] apps/web/src/editor/fields/LinkFields.tsx with the `previewSlot` seam (contracts/editor-ui.md)
- [ ] T024 [US1] apps/web/src/editor/fields/CategoryChips.tsx (select only; create comes in US6)
- [ ] T025 [US1] apps/web/src/editor/fields/registry.ts (text, link; image → `ReadOnlyImage.tsx`)
- [ ] T026 [US1] apps/web/src/editor/{EditorTabs,EditorPreview,CardEditor}.tsx + editor.css (D136)
- [ ] T027 [US1] apps/web/src/editor/use-save-card.ts (create path via `useCreateItem`, `problem-fields`, offline message via `api/offline.ts` `useOnline`)
- [ ] T028 [US1] apps/web/src/routes/d.$slug.new.tsx: `validateSearch { type }`, permission guard, render `CardEditor`, navigate with `deckHref` (006); copy says "card", not "pocketbook"
- [ ] T029 [US1] Delete apps/web/src/items/CardEditor.tsx and apps/web/src/items/card-input.ts (+ tests); apps/web/src/items/AddCardLink.tsx href via `deckHref`

**Checkpoint**: US1 is fully functional. The MVP replaces the 3B editor.

---

## Phase 3: User Story 2 - Edit an existing card (Priority: P1)

**Goal**: `/i/$itemId/edit`, the Edit entry points, minimal PATCH and the proposal rules; review inline edit on the shared draft model

**Independent Test**: edit a published card's title and a proposal's categories; the proposal stays in the queue

### Tests for User Story 2

- [ ] T030 [P] [US2] [int] apps/api/test/proposal-visibility.int.test.ts: creator PATCH of own proposal → 200 and `status` stays `proposed`; publisher PATCH ok; other editor GET/PATCH → 404
- [ ] T031 [P] [US2] [int] apps/api/test/items.int.test.ts: PATCH with a different `type` → 400; editor rewriting `categoryIds` keeps a private category; PATCH `categoryIds: []` on a published item → 422 `/problems/item-needs-category` (assert existing behaviour the UI relies on)
- [ ] T032 [P] [US2] [unit] apps/web/src/cards/can-edit-item.test.ts + EditLink.test.tsx: reader no; editor yes for published; proposal → creator or publisher only
- [ ] T033 [P] [US2] [unit] apps/web/src/review/ReviewEditForm.test.tsx: sends `toPatch` result (title-only edit → `{ title }`), unchanged → no request
- [ ] T034 [P] [US2] [e2e] e2e/tests/smoke/editor.spec.ts: edit title from `/i/$id` → Edit; no type picker on edit; reader sees no Edit

### Implementation for User Story 2

- [ ] T035 [US2] apps/web/src/cards/can-edit-item.ts + apps/web/src/cards/EditLink.tsx; render in 006's `CardActions` on apps/web/src/routes/i.$itemId.tsx and list cards
- [ ] T036 [US2] apps/web/src/routes/i.$itemId_.edit.tsx (D135): load `itemQuery`, `deckQuery(item.deckId)`, `categoriesQuery`, `meQuery`; guard → "Card unavailable"; `?from=review`
- [ ] T037 [US2] Edit mode in apps/web/src/editor/CardEditor.tsx + use-save-card.ts (`toPatch` → `useUpdateItem`; no-op when null; navigate back or to the review queue)
- [ ] T038 [US2] apps/web/src/review/ReviewEditForm.tsx onto `editor/draft.ts` + shared fields; delete apps/web/src/review/review-edit.ts (+ test, ported in T005); "Edit fully" link in apps/web/src/review/ReviewCard.tsx → `/i/$id/edit?from=review`
- [ ] T039 [US2] Entities in the editor: `cards/EntityChips` with `onRemove` → draft `entities` (FR-012)
- [ ] T040 [US2] apps/web/src/routes/i.$itemId.tsx back link via `deckHref` (if not already done by 006)

**Checkpoint**: US1 and US2 both work. All existing cards can be edited (images read-only).

---

## Phase 4: User Story 3 - Author a table card (Priority: P2)

**Goal**: lazy grid editor within 12×6 and 8192 bytes

**Independent Test**: create a 3×4 table, reorder rows, save; the list matches the preview

- [ ] T041 [P] [US3] [unit] apps/web/src/editor/fields/table-ops.test.ts: add/remove row/column within limits, move up/down at edges, rows stay aligned with columns
- [ ] T042 [US3] apps/web/src/editor/fields/table-ops.ts to pass T041
- [ ] T043 [US3] apps/web/src/editor/fields/TableFields.tsx (lazy in registry; byte meter; horizontal scroll; empty-heading errors)
- [ ] T044 [US3] Add `table` to the `?type=` enum and the type picker
- [ ] T045 [P] [US3] [e2e] e2e/tests/smoke/editor.spec.ts: table card with a row move; preview text = list text; Add row disabled at 12

---

## Phase 5: User Story 4 - Author a calc card (Priority: P2)

**Goal**: lazy calc editor sharing the mathjs chunk with `CalcCard`

**Independent Test**: `a * b` evaluates live; `a * c` is refused inline

- [ ] T046 [P] [US4] [unit] apps/web/src/editor/fields/calc-ops.test.ts: add/remove field (≤ 6), key regex, duplicate key, default parsing, key rename updates nothing else silently
- [ ] T047 [US4] apps/web/src/editor/fields/calc-ops.ts to pass T046
- [ ] T048 [US4] apps/web/src/editor/fields/CalcFields.tsx (lazy; imports `validateCalcExpression` from `@pb/shared/calc` only; feeds `validate.ts` the expression check)
- [ ] T049 [US4] Add `calc` to the `?type=` enum and the type picker; verify in the `vite build` manifest that mathjs stays in one shared async chunk
- [ ] T050 [P] [US4] [e2e] e2e/tests/smoke/editor.spec.ts: calc card `a * b` live result; invalid expression disables Save

---

## Phase 6: User Story 5 - Unsaved work survives (Priority: P2)

**Goal**: autosave, restore offer, stale warning, sign-out wipe

**Independent Test**: type, reload, restore

- [ ] T051 [P] [US5] [unit] apps/web/src/editor/use-draft-autosave.test.ts (fake timers): 500 ms debounce, no write when clean, restore offer, stale when `updatedAt > baseUpdatedAt`, delete on save/discard
- [ ] T052 [US5] apps/web/src/editor/use-draft-autosave.ts + restore banner in CardEditor.tsx (create key needs `deckId` from `deckQuery`)
- [ ] T053 [P] [US5] [unit] apps/web/src/api/session.test.ts: `signOut` calls `clearDrafts`
- [ ] T054 [US5] apps/web/src/api/session.ts: add `clearDrafts` dependency to `signOut` (with the persisted cache and last deck)
- [ ] T055 [P] [US5] [e2e] e2e/tests/smoke/editor.spec.ts: type → reload → Restore brings content back; sign-out → sign-in → no offer

---

## Phase 7: User Story 6 - Add a category without leaving the editor (Priority: P3)

**Goal**: inline create in `CategoryChips`

**Independent Test**: "School" created and selected; duplicate selects the existing one

- [ ] T056 [P] [US6] [unit] apps/web/src/editor/fields/CategoryChips.test.tsx: "New category" only with `category.create`; success selects; 409 → selects the same-slug category after refetch, else detail shown; name ≤ `NAME_MAX`
- [ ] T057 [US6] apps/web/src/api/create-category.ts `useCreateCategory` (POST `/decks/{id}/categories` `{ name }`, invalidate `queryKeys.categories`) + [unit] create-category.test.ts
- [ ] T058 [US6] Inline create in apps/web/src/editor/fields/CategoryChips.tsx
- [ ] T059 [P] [US6] [e2e] e2e/tests/smoke/editor.spec.ts: inline create a category then save the card in it

---

## Phase 8: Close-out

- [ ] T060 `pnpm lint && pnpm format:check && pnpm typecheck && pnpm test:unit && pnpm test:int && pnpm build:web && pnpm budget`; record the before/after budget in implementation-notes.md (SC-006)
- [ ] T061 [P] docs/architecture.md: Phase 6 editor section (routes, draft model, registry seam, drafts store, zod-free client validation); D135–D138, D145; deviations from implementation-notes.md
- [ ] T062 [P] README.md: editor routes, drafts cleared on sign-out
- [ ] T063 [P] CLAUDE.md ground rules: "editor validation is zod-free; the server is authoritative; value imports via `@pb/shared/card-limits` and `/calc`"
- [ ] T064 PLAN.md: link specs/007-card-editor under Phase 6; demo 1 stays unticked until 008 and a run on the deployed instance
- [ ] T065 Run quickstart.md (steps 1–12)
- [ ] T066 `/speckit-converge` until it reports Converged

---

## Dependencies & Execution Order

- **006-card-lifecycle** (`deckHref`, `CardActions`) before T028, T029, T035 and T040.
- **Foundational (T001–T018)** blocks every story.
- **US1** comes before US2, because edit mode builds on `CardEditor`.
- **US3, US4 and US5** can run in parallel once US1 is done; US5 also touches CardEditor, so merge it after US2.
- **US6** can follow US1 at any time.
- **008-card-media** starts after US1–US2 (it needs the registry, `previewSlot` and edit mode).

### Within Each User Story

Tests are written first and must be failing. Then pure ops → components → route → e2e.

## Notes

- No API, DB or `api:openapi` work. The int tasks (T030, T031) pin down existing behaviour the UI now relies on.
- Log deviations (e.g. if 006 isn't merged and Edit lands in `Card` first) in implementation-notes.md.
- Conventional commits, e.g. `feat(web): card editor table fields`.
