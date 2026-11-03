---

description: "Tasks for 038 rich-text card bodies"
---

# Tasks: Rich-text card bodies

**Input**: Design documents from `/specs/038-rich-text-body/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/body-markdown.md

**Tests**: REQUIRED (constitution V). Every traceability row in plan.md maps to a test task below.

## Format: `[ID] [P?] [Story] [Tier?] Description`

---

## Phase 1: Foundational (Blocking Prerequisites)

**Purpose**: the shared grammar and vocabulary every renderer and the editor use (D282–D284, D287)

- [ ] T001 Add deps: `remark-directive`, `remark-breaks`, `unist-util-visit` (+ dev `@types/mdast`, `mdast-util-directive`) to packages/shared/package.json; `remark-directive`, `remark-breaks` to apps/web/package.json; `unified`, `remark-parse`, `remark-breaks`, `remark-directive`, `remark-rehype`, `rehype-sanitize`, `rehype-stringify`, `mdast-util-to-string` to apps/api/package.json (remove `micromark`); `pnpm install`
- [ ] T002 [P] Style vocabulary in packages/shared/src/rich-text/constants.ts: `STYLE_NAMES` (`u`, `small`, `large`, `color`), `TEXT_SIZES` (`small`, `large`), `PALETTE` (`red`, `orange`, `green`, `blue`, `purple`, `grey`, each `{ light, dark }` hex), class helpers (`rt-small`, `rt-large`, `rt-color rt-color--<name>`)
- [ ] T003 [P] WCAG contrast helper in packages/shared/src/rich-text/contrast.ts
- [ ] T004 [P] [unit] Palette ≥ 4.5:1 on `#ffffff` (light) and `#1a2629` (dark) in packages/shared/src/rich-text/palette.test.ts
- [ ] T005 `remarkNormalizeStyles` + `remarkStylesToHast` in packages/shared/src/rich-text/remark-styles.ts per contracts/body-markdown.md §2–3 (unknown/invalid → label or exact source; leaf/container → paragraph/unwrap; size inside heading unwrapped)
- [ ] T006 [P] [unit] Normaliser and mapping cases from the contract table in packages/shared/src/rich-text/remark-styles.test.ts
- [ ] T007 Subpath `./rich-text` → packages/shared/src/rich-text/index.ts in packages/shared/package.json

**Checkpoint**: `@gobbit/shared/rich-text` parses and maps the grammar

---

## Phase 2: User Story 1 — Line breaks show as typed (P1) 🎯 MVP

**Goal**: single newlines render as breaks in the app and on public pages; paragraphs unchanged.

**Independent Test**: a body `"Milk\nEggs\nBread"` created via the API reads as three lines in the reader and on `/p/…`.

### Tests

- [ ] T008 [P] [US1] [unit] Breaks, paragraphs and existing-shape regression fixtures (SC-004) in apps/web/src/cards/TextCard.test.tsx
- [ ] T009 [P] [US1] [unit] Server renderer: breaks, regression fixtures, raw HTML dropped, unsafe link protocols removed in apps/api/src/rich-text/render.test.ts
- [ ] T010 [P] [US1] [unit] Same HTML from the web reader and the API renderer for a shared fixture set (SC-002, FR-004) in apps/web/src/cards/rich-text-parity.test.tsx (fixtures in packages/shared/src/rich-text/fixtures.ts)

### Implementation

- [ ] T011 [US1] Reader: `remarkPlugins={[remarkBreaks, remarkDirective, remarkNormalizeStyles, remarkStylesToHast]}` in apps/web/src/cards/TextCard.tsx
- [ ] T012 [US1] Server pipeline in apps/api/src/rich-text/render.ts (remark-parse → breaks → directive → shared plugins → remark-rehype → rehype-sanitize with `rt-*` classes and `u` → rehype-stringify); apps/api/src/public/markdown.ts delegates to it
- [ ] T013 [US1] Update apps/api/src/public/markdown.test.ts for dropped (not escaped) raw HTML (D285)

**Checkpoint**: US1 independently shippable

---

## Phase 3: User Story 2 — Format with a toolbar (P1)

**Goal**: WYSIWYG body editor with the FR-008 toolbar, reading and writing Markdown.

**Independent Test**: apply every toolbar action, save, reload: editor content and rendered card agree.

### Tests

- [ ] T014 [P] [US2] [unit] Markdown round-trip (every style, Enter/Shift+Enter → `\n`, nested styles, unknown directives normalised) on a headless editor in apps/web/src/editor/rich/milkdown-setup.test.ts
- [ ] T015 [P] [US2] [unit] No-op: mounting/undo-to-start reports the original string; an edit reports new Markdown (FR-013) in apps/web/src/editor/rich/RichBodyEditor.test.tsx
- [ ] T016 [P] [US2] [unit] Toolbar: names, pressed state, disabled undo/redo, roving arrow/Home/End focus in apps/web/src/editor/rich/FormatToolbar.test.tsx
- [ ] T017 [P] [US2] [unit] BodyField meter counts stored Markdown; load failure shows retry and keeps value in apps/web/src/editor/fields/BodyField.test.tsx
- [ ] T018 [P] [US2] [e2e:smoke] Format a word bold + Shift+Enter line, save, see `<strong>` and `<br>` on the card in e2e/tests/smoke/editor.spec.ts
- [ ] T019 [P] [US2] [e2e:full] Keyboard-only toolbar, headings/lists/quote/code block, link, clear formatting, undo/redo, paste keeps only supported styles, phone width wrap in e2e/tests/full/rich-text.spec.ts

### Implementation

- [ ] T020 [US2] Add `@milkdown/kit` to apps/web/package.json
- [ ] T021 [P] [US2] New icons (`bold`, `italic`, `underline`, `text-small`, `text-large`, `code`, `text-color`, `heading-1`…`heading-4`, `paragraph`, `list-ordered`, `quote`, `code-block`, `redo`, `clear-format`) in apps/web/src/ui/icons/icon-paths.ts
- [ ] T022 [US2] Style marks (`underline`, `textSize`, `textColor` ↔ `textDirective`) in apps/web/src/editor/rich/style-marks.ts
- [ ] T023 [US2] Editor factory (commonmark, history, listener, remark plugins, `break` → `\n`, `Mod-u`) in apps/web/src/editor/rich/milkdown-setup.ts
- [ ] T024 [US2] Toolbar commands + active-state queries in apps/web/src/editor/rich/commands.ts
- [ ] T025 [US2] `FormatToolbar`, `ColorPicker`, `LinkRow` in apps/web/src/editor/rich/ (+ rich-editor.css, sticky + wrap, FR-015)
- [ ] T026 [US2] `RichBodyEditor` (lifecycle, baseline no-op, disabled, external value sync) in apps/web/src/editor/rich/RichBodyEditor.tsx
- [ ] T027 [US2] BodyField renders lazy `RichBodyEditor` with `LimitMeter` and a retry fallback in apps/web/src/editor/fields/BodyField.tsx (review inline edit gets it through the same field)
- [ ] T028 [US2] Update editor/review unit tests that typed into the body textarea (mock the rich editor) in apps/web/src/editor/*.test.tsx, apps/web/src/review/*.test.tsx

**Checkpoint**: US2 shippable; budget checked (`pnpm build:web && pnpm budget`)

---

## Phase 4: User Story 3 — Underline, size and colour (P2)

**Goal**: styles render in light and dark themes in the app and on public pages.

### Tests

- [ ] T029 [P] [US3] [unit] Both stylesheets carry the shared palette hexes in packages/shared/src/rich-text/palette.test.ts (reads apps/web/src/cards/rich-text.css and apps/api/src/public/styles.ts)
- [ ] T030 [P] [US3] [e2e:full] Red + large text visible on the card and on the public page in e2e/tests/full/rich-text.spec.ts

### Implementation

- [ ] T031 [US3] apps/web/src/cards/rich-text.css (`--rt-<name>` light/dark, `.rt-small`, `.rt-large`, `.rt-color--*`), imported by TextCard
- [ ] T032 [US3] Same rules in apps/api/src/public/styles.ts

---

## Phase 5: User Story 4 — Formatting stays out of plain text (P2)

**Goal**: previews, excerpts, meta, language detection and model inputs carry words only.

### Tests

- [ ] T033 [P] [US4] [unit] `toPlainText`, `toModelText`, `stripStyleDirectives` in apps/api/src/rich-text/plain-text.test.ts
- [ ] T034 [P] [US4] [unit] Excerpts of styled bodies have no syntax (SC-003) in apps/api/src/share/excerpt.test.ts
- [ ] T035 [P] [US4] [unit] Agent body with directives is stripped in apps/api/src/ai/extract-validate.test.ts
- [ ] T036 [P] [US4] [int] A word inside `:color[…]{.red}` is found by search in apps/api/test/search.int.test.ts

### Implementation

- [ ] T037 [US4] apps/api/src/rich-text/plain-text.ts; `excerpt()` uses `toPlainText` (remove `stripMarkdown`) in apps/api/src/share/excerpt.ts
- [ ] T038 [US4] Language detection on plain text in apps/api/src/share/share.service.ts and apps/api/src/public/pages.ts
- [ ] T039 [US4] `toModelText` in apps/api/src/ai/ask-prompt.ts and apps/api/src/jobs/ingest.ts examples; `stripStyleDirectives` in apps/api/src/ai/extract-validate.ts; prompt line in apps/api/src/ai/extract-prompt.ts

---

## Phase 6: Close-out

- [ ] T040 `pnpm lint && pnpm format:check && pnpm typecheck && pnpm test:unit && pnpm test:int` + `pnpm build:web && pnpm budget`
- [ ] T041 e2e: `@smoke` editor journey and `@full` rich-text spec pass
- [ ] T042 [P] docs/design/card-editor.md + docs/design/public.md: rich-text section and Deviations
- [ ] T043 [P] docs/adr.md ADR-069; docs/architecture.md index row + one line
- [ ] T044 [P] CLAUDE.md ground rule (body grammar, `@gobbit/shared/rich-text`)
- [ ] T045 PLAN.md: link 038
- [ ] T046 Run quickstart.md validation
- [ ] T047 `/speckit-converge` until Converged

---

## Dependencies & Execution Order

- Phase 1 blocks all stories. US1 (Phase 2) needs only Phase 1. US2 needs Phase 1 (normaliser) and is independent of US1 code. US3 builds on US1's renderers. US4 needs Phase 1 only.
- Parallel: T002/T003/T004, T008/T009/T010, US4 alongside US2.

## Implementation Strategy

MVP = Phase 1 + US1 (line breaks everywhere). Then US2 (editor), US3 (styles visible), US4 (plain text). One PR for the feature (small enough stream), committed per phase.
