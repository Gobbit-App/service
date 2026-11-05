---

description: "Tasks for 039 first-class card composer"
---

# Tasks: First-class card composer

**Input**: Design documents from `/specs/039-editor-experience/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/composer-ui.md

**Tests**: REQUIRED (constitution V). Every traceability row in plan.md maps to a test task below.

## Format: `[ID] [P?] [Story] [Tier?] Description`

All paths are under `apps/web/src/` unless they start with `e2e/`, `docs/` or `specs/`.

---

## Phase 1: Foundational (PR 1)

- [x] T001 [P] Theme tokens (type scale, spacing, elevation, radii, motion; reduced motion zeroes durations) in styles.css (D311)
- [x] T002 [P] `Sheet` on native dialog (`ui/sheet/Sheet.tsx`, `sheet.css`): bottom < 600 px, centred above, `onClose`, initial focus, focus return (D304)
- [x] T003 [P] [unit] `ui/sheet/Sheet.test.tsx`: opens modal, Escape/backdrop call `onClose`, initial focus
- [x] T004 `DiscardChangesDialog` renders through `Sheet`, names unchanged (review queue keeps working)

## Phase 2: US1 + US4 + US6 — Frame, Save, shortcuts (PR 1) 🎯 MVP

- [x] T005 [US1] `DeckLayout` returns a bare `<Outlet/>` for the new-card route (routes/d.$slug.tsx)
- [x] T006 [US1] Edit route renders `CardEditor` without `AppHeader` / `.page` (routes/i.$itemId_.edit.tsx)
- [x] T007 [US1] `editor/composer/ComposerTopBar.tsx`: Close link, h1 + deck name, Save submit (busy, blocked reason), safe areas
- [x] T008 [P] [US1] [unit] `ComposerTopBar.test.tsx`: names per contract, blocked reason, busy
- [x] T009 [US4] `ComposerErrorBanner` at the top of the canvas; remove `SaveBar` (move `saveBlockedReason` to composer/save-state.ts)
- [x] T010 [US6] `use-composer-shortcuts.ts`: Mod+Enter submits, Escape closes unless handled / dialog open (D310)
- [x] T011 [P] [US6] [unit] `use-composer-shortcuts.test.tsx`
- [x] T012 [US1] `composer.css`: full-height frame, centred max width, sticky top bar; rich toolbar sticky offset under the composer bar
- [x] T013 [US1] [unit] `CardEditor.test.tsx` updated (Save name, Close, banner); `d.$slug` layout test for no chrome on /new
- [x] T014 [US1] [e2e:smoke] `e2e/tests/smoke/editor.spec.ts`: "Save card" → "Save", "Cancel" → link "Close"; other full specs updated likewise
- [x] T015 [US1] [e2e:full] `e2e/tests/full/composer.spec.ts`: no search/chips/bottom bar on /new and edit; chrome back after leaving; Ctrl+Enter saves; Escape → leave guard

## Phase 3: US2 — Type choice (PR 2)

- [x] T016 [P] [US2] Icons `text`, `table`, `calc`, `chevron-down` in ui/icons/icon-paths.ts (+ test list)
- [x] T017 [P] [US2] `composer/type-tiles.ts`: `TYPE_LABELS`, `TYPE_HINTS`, `TYPE_ICONS`; remove `TypePicker.tsx` (move `IMAGES_UNAVAILABLE`)
- [x] T018 [US2] `composer/TypeTiles.tsx` (radiogroup, roving focus, arrows/Home/End, Enter/Space/click pick, unavailable reason)
- [x] T019 [P] [US2] [unit] `TypeTiles.test.tsx`: keys, names/hints, disabled image, checked state
- [x] T020 [US2] `composer/pick-start-type.ts` (D302) + [unit] test
- [x] T021 [US2] Route `/d/$slug/new`: optional `type`, chooser screen (`TypeChooser.tsx` inside the composer frame with Close) vs composer; pick → replace navigate; title autofocus on pick
- [x] T022 [US2] `composer/payload-content.ts` (`payloadHasContent`) + [unit] test
- [x] T023 [US2] `TypeControl.tsx` (button → Sheet with tiles) + `SwitchTypeConfirm.tsx`; edit shows read-only label with icon
- [x] T024 [P] [US2] [unit] `TypeControl.test.tsx`: switch freely when empty, confirm when content, keep cancels
- [x] T025 [US2] [e2e:smoke] smoke editor tests open /new and pick from the chooser (or use `?type=`); radio `.check()` → click
- [x] T026 [US2] [e2e:full] composer.spec: keyboard-only pick; switch confirm keep/switch; reminders/editor-navigation specs updated

## Phase 4: US3 + US5 + US7 — Canvas, preview, sheets (PR 3)

- [x] T027 [US3] Order + sections in `CardEditor` (D306): leading media for link/image, headline title, borderless body, type section, Details
- [x] T028 [US3] `LimitMeter` from 80 % (D307) + tests updated
- [x] T029 [US3] `focus-first-invalid.ts` + blocked Save shows all errors and focuses; server-refused save focuses (D308) + [unit] tests
- [x] T030 [US3] `use-keyboard-inset.ts` + `ComposerDock.tsx` + dock CSS for the 038 toolbar (D305) + [unit] tests
- [x] T031 [US5] `use-preview-toggle.ts` + top-bar Preview toggle; remove `EditorTabs`; side-by-side sticky ≥ 768 px (D309) + [unit] tests
- [x] T032 [US7] `DraftRestoreBanner` as an inline card; Sheet motion and reduced motion
- [x] T033 [US3] [e2e:full] composer.spec: widths 320/375/768/1280 no sideways scroll, targets ≥ 44 px; preview toggle restores focus; axe light/dark
- [x] T034 [e2e:smoke] smoke `showPreview` helper uses the Preview toggle

## Phase 5: Close-out (PR 3)

- [x] T035 docs/design/card-editor.md 039 section + Deviations; docs/adr.md ADR-071; docs/architecture.md index row; PLAN.md usability item 8
- [x] T036 `pnpm typecheck && pnpm lint && pnpm test:unit && pnpm build:web && pnpm budget`
