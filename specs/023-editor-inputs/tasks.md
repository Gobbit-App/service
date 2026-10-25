---

description: "Task list for 023-editor-inputs"
---

# Tasks: Friendlier editor inputs

**Input**: Design documents from `/specs/023-editor-inputs/`

**Prerequisites**: plan.md, spec.md, research.md (D205–D209), data-model.md, contracts/editor-inputs.md

**Tests**: REQUIRED (constitution V). Every row of the plan's traceability table maps to a test task below.

**Organization**: Tasks are grouped by user story.

## Format: `[ID] [P?] [Story] [Tier?] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: US1 URL prefill, US2 optional alt, US3 instant categories
- **[Tier]**: `[unit]` `*.test.ts(x)` next to code, `[int]` `apps/api/test/*.int.test.ts` (Docker), `[e2e:smoke]` `e2e/tests/smoke/`, `[e2e:full]` `e2e/tests/full/` (constitution V, ADR-053)

---

## Phase 1: Foundational

No shared prerequisite: the three stories touch separate code. Nothing blocks.

---

## Phase 2: User Story 1 — Web addresses without typing the prefix (Priority: P1) 🎯 MVP

**Goal**: every URL input prefills `https://`, adds it when missing, keeps `http://`, refuses non-web addresses.

**Independent Test**: type `example.org` into a link card's URL, save → stored as `https://example.org`.

### Tests for User Story 1

- [x] T001 [P] [US1] [unit] Table test for `normalizeUrlInput` / `collapseDoubledScheme` in apps/web/src/lib/url-input.test.ts: empty, spaces, `https://` only (any case), `example.org`, `www.x.org/a?b`, `HTTPS://X.org/A`, `http://x` kept, `https://https://x`, `https://http://x`, `//x.org`, `localhost:3000`, `example.org:8080/a`, `mailto:a@b` kept, `javascript:alert(1)` kept, `ftp://x` kept
- [x] T002 [P] [US1] [unit] apps/web/src/ui/use-url-input.test.tsx: focus on empty → `https://` (caret at end), focus with a value → untouched, blur with scheme only → '', blur `example.org` → `https://example.org`, paste `https://x` over prefill → one scheme
- [x] T003 [P] [US1] [unit] validate.test.ts + draft.test.ts: `example.org` link URL and source URL pass validation and land as `https://example.org` in create body and patch; `mailto:` refused with "Enter a valid web address"; link URL left at `https://` → "URL is required" (not invalid); ShareForm.test.tsx: `example.org` submits `https://example.org`
- [x] T004 [P] [US1] [e2e:smoke] Link card typed `example.org` saves and stores `https://example.org`, in e2e/tests/smoke/editor.spec.ts
- [x] T005 [P] [US1] [e2e:full] Source URL focus → `https://`, leave → empty, card saves without source; `http://` kept; `not a url` refused; share form `example.org` accepted, in e2e/tests/full/editor-inputs.spec.ts

### Implementation for User Story 1

- [x] T006 [US1] apps/web/src/lib/url-input.ts (`URL_PREFIX`, `normalizeUrlInput`, `collapseDoubledScheme`)
- [x] T007 [US1] apps/web/src/ui/use-url-input.ts; wire into apps/web/src/editor/fields/TextInput.tsx (`type="url"`) and apps/web/src/share/ShareForm.tsx
- [x] T008 [US1] Normalise on save in apps/web/src/editor/draft.ts (`toPayload` link url, `toCreateBody`/`toPatch` sourceUrl) and apps/web/src/editor/validate.ts (`isHttpUrl` on the normalised value; message "Enter a valid web address"); FetchPreview/LinkFields preview slot use the normalised URL

**Checkpoint**: US1 independently testable

---

## Phase 3: User Story 2 — Images without alt text (Priority: P2)

**Goal**: alt optional in editor + API; renderers fall back to decorative/title.

**Independent Test**: image card with photo + title, empty description → saves; rendered `alt=""` under its title.

### Tests for User Story 2

- [x] T010 [P] [US2] [unit] packages/shared/src/media/image-alt.test.ts: alt wins, blank alt + adjacent → '', blank alt + not adjacent → trimmed title, whitespace alt treated as blank
- [x] T011 [P] [US2] [unit] payloads schema test: image payload valid without `alt` and with `alt: ''`
- [x] T012 [P] [US2] [int] apps/api/test/items.int.test.ts: create image card with no alt → 201 and stored payload without alt; with `alt: ''` → 201; PATCH clearing alt → 200
- [x] T013 [P] [US2] [unit] apps/api/src/public/render-item.test.ts: image without alt → `alt=""`; with alt → escaped alt; no media + no alt → no empty muted paragraph
- [x] T014 [P] [US2] [unit] ImageCard / CardBody tests: missing alt → `alt=""`; payload-guards accepts missing alt; validate.test.ts: image with no alt has no error; draft.test.ts: blank alt omitted from payload
- [x] T015 [P] [US2] [e2e:smoke] Image editor shows "Description (optional)"; the secret-guarded upload journey saves without description, in e2e/tests/smoke/editor.spec.ts (replace the "cannot be saved without alt text" test)

### Implementation for User Story 2

- [x] T016 [US2] `alt: z.string().optional()` in packages/shared/src/schemas/payloads.ts; `pnpm api:openapi`
- [x] T017 [US2] packages/shared/src/media/image-alt.ts + `"./image-alt"` export in packages/shared/package.json
- [x] T018 [US2] apps/api/src/public/render-item.ts uses `imageAlt`
- [x] T019 [US2] apps/web/src/cards/{payload-guards,ImageCard,CardBody}.ts(x) alt optional + `imageAlt`; apps/web/src/editor/fields/ImageFields.tsx label "Description (optional)" + hint; validate.ts drops `ALT_REQUIRED`; draft.ts omits blank alt

**Checkpoint**: US2 independently testable

---

## Phase 4: User Story 3 — Categories save themselves (Priority: P2)

**Goal**: category taps on an existing card save at once with Undo; published card keeps ≥ 1; failure reverts; never "unsaved".

**Independent Test**: open an existing card, tap a category, leave without Save → the card has the new category.

### Tests for User Story 3

- [x] T020 [P] [US3] [unit] apps/web/src/editor/category-saver.test.ts (fake timers): burst of 3 taps → one save; burst back to the confirmed set → no save; tap during in-flight save → second save after; undo → saves the pre-burst set; failure → selection reverts + onError; flush sends pending at once; dispose cancels timers
- [x] T021 [P] [US3] [unit] apps/web/src/editor/use-instant-categories.test.tsx: success shows toast with Undo; published card refusing last category (no request, message); proposal may drop to none; failure reverts and shows error toast
- [x] T022 [P] [US3] [unit] apps/web/src/editor/rebaseline.test.ts (`withCategories`, `withSavedCategories`); CardEditor.test.tsx: category tap in edit mode doesn't mark the draft dirty / store a draft, other unsaved edits kept, create mode keeps categories in the form
- [x] T023 [P] [US3] [int] apps/api/test/item-events.int.test.ts: PATCH categories then PATCH back (undo) → two `updated` events with `changes: ['categories']`; hidden category kept across both (apps/api/test/visibility.int.test.ts if fixtures fit better)
- [x] T024 [P] [US3] [e2e:smoke] Existing card: tap a second category, toast "Categories saved", leave via back without Save → card page shows the category, in e2e/tests/smoke/editor.spec.ts
- [x] T025 [P] [US3] [e2e:full] Undo restores the previous set; published card refuses removing its last category; routed PATCH 500 reverts the chip, in e2e/tests/full/editor-inputs.spec.ts

### Implementation for User Story 3

- [x] T026 [US3] apps/web/src/editor/category-saver.ts (framework-free controller, `BURST_MS = 600`)
- [x] T027 [US3] apps/web/src/editor/use-instant-categories.ts (PATCH via api client + `applyUpdatedItem`, toast-store, refusal, flush on unmount)
- [x] T028 [US3] apps/web/src/editor/rebaseline.ts; apps/web/src/editor/use-draft-autosave.ts (opening snapshot for the read effect, `rebase(updatedAt)`); apps/web/src/editor/CardEditor.tsx (`baseline` state, `rebaselineCategories`, chips from the hook in edit mode, restore with saved categories); CategoryChips `refusal` message support

**Checkpoint**: All three stories work independently

---

## Phase 5: Close-out

- [x] T030 `pnpm lint && pnpm typecheck && pnpm test:unit && pnpm test:int && pnpm build:web && pnpm budget && pnpm api:openapi` (no drift)
- [x] T031 Run the new e2e specs locally (`pnpm test:e2e`); record the outcome in implementation-notes.md
- [x] T032 [P] docs/design/card-media.md (alt optional, fallback), docs/design/card-editor.md (URL rule, instant categories, Deviations); one line in docs/architecture.md; README if it describes alt/URL rules
- [x] T033 [P] specs/023-editor-inputs/implementation-notes.md (decisions not in the plan, deviations, the `rebaselineCategories` seam for 022)
- [x] T034 `/speckit-converge` until it reports Converged

---

## Dependencies & Execution Order

- US1, US2, US3 are independent; US3 touches CardEditor which US1/US2 don't change
- US2: shared schema (T016) → `api:openapi` → web/API renderers
- Close-out after all stories

### Within Each User Story

- Tests written next to the code they cover; failing first where practical

### Parallel Opportunities

- T001–T005, T010–T015, T020–T025 test tasks are [P] within their story
- US1, US2 and US3 implementation can proceed in parallel (separate files except validate.ts/draft.ts shared by US1/US2: do those sequentially)

## Implementation Strategy

MVP = US1 (biggest daily friction). Then US2 (contract change, small), then US3 (most logic). One PR for all three.

---

## Notes

- Tests never call Cloudinary or real sites (fake Cloudinary route in e2e, `example.org` addresses never fetched unless routed)
- Log decisions the plan did not make, and deviations, in implementation-notes.md as you go
