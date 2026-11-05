# Implementation Plan: First-class card composer

**Branch**: `039-editor-experience` | **Date**: 2026-11-04 | **Spec**: [spec.md](spec.md) | **Roadmap**: `PLAN.md` § Usability pass (item 8)

**Input**: Feature specification from `/specs/039-editor-experience/spec.md`

## Summary

The new-card and edit-card screens become one full-screen **composer** (D300). A slim top bar holds
Close, the screen and deck name, a Preview toggle on phones, and Save. The deck search, chip rail and
bottom bar are no longer mounted. A new card without `?type=` starts on a **type chooser** of icon
tiles (D301, D302). Inside the composer, a compact type control opens the same tiles in a sheet and
confirms before discarding type-specific content (D303). The writing surface leads with the type's
media (link, image), then a headline title and the 038 body editor, then the type's section and a
quiet "Details" section (D306). Counters appear from 80 % (D307). Save is in the top bar on every
size, also docked above the on-screen keyboard on touch phones together with the formatting toolbar
(D305). It explains why it is blocked and focuses the first invalid field (D308). From 768 px the
preview sits beside the editor. Below that it is a toggle (D309). Ctrl/Cmd+Enter saves and Escape
closes (D310). One `Sheet` on the native dialog serves the leave guard, the type picker and the
switch confirm (D304). New theme tokens cover type, spacing, elevation, radii and motion (D311). No
API, database or contract change.

## Starting point

main @ `a5de517` (037 reminders, 038 rich-text body, brand logo), latest migration unchanged by this
feature, deployed. Editor: `apps/web/src/editor/CardEditor.tsx` (create + edit; `EditorTabs`,
`TypePicker` radios, `SaveBar` at the bottom), routes `routes/d.$slug.new.tsx` (defaults `type` to
`text`) and `routes/i.$itemId_.edit.tsx` (`AppHeader` + `.page`), deck chrome in `routes/d.$slug.tsx`
(`DeckLayout`). Rich editor: `editor/rich/*` (toolbar sticky under the 61 px app header). Leave guard:
`editor/use-leave-guard.tsx` + `DiscardChangesDialog` (shared with `review/ReviewEditForm.tsx`).
Design doc: `docs/design/card-editor.md`.

## Technical Context

**Language/Version**: TypeScript (strict, ESM, no build step) on Node ≥ 22

**Primary Dependencies**: React + Vite + TanStack Router/Query (web). No new dependency.

**Storage**: none (FR-021). Drafts stay in IndexedDB as today (D145).

**Testing**: Vitest + Testing Library (web unit), Playwright `@smoke` / `@full` with `@axe-core/playwright`

**E2E tier**: smoke + full. Creating a card is a critical journey and its selectors change, so the
smoke editor journey picks the type from the chooser. Type switch, preview toggle, shortcuts, widths
and axe are `@full` (D313).

**Target Platform**: PWA on Android Chrome and iOS Safari (keyboard dock), desktop browsers

**Project Type**: pnpm monorepo, web package only

**Performance Goals**: the composer opens without layout shift. The chooser renders without waiting
for the editor chunk.

**Constraints**: initial bundle ≤ 150 KB gzip (the composer stays in the route chunks, the chooser in
the `/new` route chunk); 44 px targets; no sideways scroll at 320 px; no animation over 300 ms; plain
CSS, no UI kit or gesture library.

**Scale/Scope**: two screens (new, edit) and one shared dialog pattern.

## Constitution Check

| Principle | How this plan complies |
|-----------|------------------------|
| I. Layered API | N/A: no API change. |
| II. One source of truth for contracts | N/A: no DTO change. Type names stay `CREATABLE_TYPES` and `TYPE_LABELS`. |
| III. Invariants live in the database | N/A: no migration. |
| IV. Private by default | No new reads. The edit route keeps loading through the same queries. |
| V. Tests at the right tier | Unit: chooser keys, skip rules, content-loss check, counters, focus-first-invalid, keyboard inset, sheet, top bar, shortcuts. E2E smoke + full (D313). Traceability below. |
| VI. Lean, offline-first web | No new dependency. The composer stays lazy, `pnpm budget` is checked, and the composer opens offline from the query cache as before. |
| VII. Simple, optional, deployable | No env, no deploy change. |
| VIII. Accountable by default | No decision about a person (Accountability: None). |

## Decisions this plan pins down

| ID | Decision | ADR? |
|----|----------|------|
| D300 | The composer is its own frame (top bar + canvas); `/new` and edit render without deck chrome | yes → ADR-071 |
| D301 | Type chooser: icon tiles in a radiogroup; arrows move focus, Enter/Space/tap picks and replace-navigates to `?type=` | no |
| D302 | Chooser skipped for a usable `?type=` or a stored new-card draft (newest type); unavailable image shows the chooser with the reason | no |
| D303 | In-composer type control (sheet) with a confirm before type-specific content is removed | no |
| D304 | One `Sheet` on the native dialog: bottom sheet < 600 px, centred dialog above | yes → ADR-071 |
| D305 | Keyboard dock on touch phones via `visualViewport` (`--kb-inset`): compact Save + 038 toolbar | yes → ADR-071 |
| D306 | Order: type control → leading media (link, image) → title → body → type section → Details | no |
| D307 | Limit counters visible from 80 % (announced from 90 % as before) | no |
| D308 | Save in the top bar with `aria-disabled` + reason; a blocked or refused save focuses the first invalid field; error banner at the top | no |
| D309 | Preview: top-bar toggle < 768 px (restores scroll + focus), sticky side-by-side from 768 px | no |
| D310 | Ctrl/Cmd+Enter saves; Escape closes preview, then leaves through the guard | no |
| D311 | Theme tokens for type scale, spacing, elevation, radii, motion | no |
| D312 | SC-006 reference apps: Gmail compose and Bear | no |
| D313 | E2E tier smoke + full | no |

## Project Structure

### Documentation (this feature)

```text
specs/039-editor-experience/
├── spec.md
├── plan.md                  # this file
├── research.md              # D300–D313
├── data-model.md            # UI state only
├── contracts/composer-ui.md # roles, names and keys tests rely on
├── quickstart.md
├── tasks.md
└── implementation-notes.md
```

### Source Code

```text
apps/web/src/
├── styles.css                         # D311 tokens
├── ui/sheet/Sheet.tsx + sheet.css     # D304 (new)
├── ui/icons/icon-paths.ts             # text, table, calc, chevron-down icons
├── routes/d.$slug.tsx                 # DeckLayout: bare Outlet for /new
├── routes/d.$slug.new.tsx             # optional ?type=, chooser vs composer
├── routes/i.$itemId_.edit.tsx         # no AppHeader / .page
└── editor/
    ├── CardEditor.tsx                 # composes the frame (slimmer)
    ├── composer/                      # new: frame pieces
    │   ├── ComposerTopBar.tsx
    │   ├── ComposerDock.tsx
    │   ├── ComposerErrorBanner.tsx
    │   ├── TypeChooser.tsx + type-tiles.ts (+ TypeTiles.tsx)
    │   ├── TypeControl.tsx + SwitchTypeConfirm.tsx
    │   ├── focus-first-invalid.ts
    │   ├── use-keyboard-inset.ts
    │   ├── use-composer-shortcuts.ts
    │   ├── use-preview-toggle.ts
    │   ├── payload-content.ts
    │   ├── pick-start-type.ts
    │   └── composer.css
    ├── fields/LimitMeter.tsx          # D307
    ├── DiscardChangesDialog.tsx       # on Sheet
    ├── DraftRestoreBanner.tsx         # inline card style
    ├── EditorTabs.tsx, SaveBar.tsx    # removed (SaveBar's blocked reason helper moves)
    ├── TypePicker.tsx                 # removed (labels move to type-tiles.ts)
    └── rich/rich-editor.css           # toolbar sticky offset + dock
e2e/tests/smoke/editor.spec.ts, e2e/tests/full/{composer,editor-*,reminders,bottom-bar}.spec.ts
docs/design/card-editor.md, docs/architecture.md, docs/adr.md (ADR-071), PLAN.md
```

**Structure Decision**: Web only. New composer pieces live in `editor/composer/`. The sheet is a
generic `ui/` primitive because the leave guard is shared with the review queue.

## Invariant → test traceability

| Invariant / rule | Enforced in | Test (file, tier) |
|------------------|-------------|-------------------|
| FR-001 no deck chrome on new/edit | `DeckLayout`, edit route | `composer.spec.ts` (full); `d.$slug.test.tsx` (unit) |
| FR-002 top bar contents | `ComposerTopBar` | `ComposerTopBar.test.tsx` (unit) |
| FR-003 back targets, leave guard, drafts, `?type=` | routes + `CardEditor` | `CardEditor.test.tsx`, `pick-start-type.test.ts` (unit); `editor.spec.ts` (smoke) |
| FR-004/FR-007 chooser semantics and keys | `TypeChooser` | `TypeChooser.test.tsx` (unit); `composer.spec.ts` keyboard pick (full) |
| FR-005 an icon per type | `icon-paths.ts` | `icon-paths.test.ts`, `type-tiles.test.ts` (unit) |
| FR-006 switch confirm (D303) | `TypeControl`, `payload-content.ts` | `payload-content.test.ts`, `TypeControl.test.tsx` (unit); `composer.spec.ts` (full) |
| FR-008–FR-010 order and sections | `CardEditor` | `CardEditor.test.tsx` (unit) |
| FR-011 counters from 80 % | `LimitMeter` | `LimitMeter.test.tsx` (unit) |
| FR-012 dock with keyboard | `use-keyboard-inset.ts`, `ComposerDock` | `use-keyboard-inset.test.ts`, `ComposerDock.test.tsx` (unit) |
| FR-013 focus first invalid | `focus-first-invalid.ts`, `CardEditor` | `focus-first-invalid.test.ts`, `CardEditor.test.tsx` (unit) |
| FR-014 preview toggle / side by side | `use-preview-toggle.ts`, CSS | `CardEditor.test.tsx` (unit); `composer.spec.ts` (full) |
| FR-015 shortcuts | `use-composer-shortcuts.ts` | `use-composer-shortcuts.test.tsx` (unit); `composer.spec.ts` (full) |
| FR-016/SC-004 44 px, no sideways scroll | CSS | `composer.spec.ts` widths (full) |
| FR-017/SC-005 contrast, axe | tokens | `composer.spec.ts` axe, light + dark (full) |
| FR-018/FR-019 sheet + reduced motion | `Sheet`, `sheet.css` | `Sheet.test.tsx` (unit) |
| FR-022 bundle | lazy chunks | `pnpm budget` (CI) |

## Accountability

None. The composer changes how a person writes their own card. It makes no decision about a person,
their content or their experience (constitution VIII, FR-023). Save outcomes are unchanged and are
already recorded by the API (`item_events`, ADR-057).

**Operator controls**: none.

## Rollout

- **Migrations**: none.
- **Env / config**: none.
- **API client**: no `pnpm api:openapi` change.
- **Deploy order / flags**: normal CI → Dokploy. Split into three stacked PRs (small PRs per stream):
  1. **Frame** (US1, US4, US6 shortcuts, tokens, Sheet, plan docs).
  2. **Type choice** (US2: icons, chooser, type control, switch confirm).
  3. **Canvas** (US3, US5, US7: order and sections, counters, keyboard dock, focus-first-invalid,
     preview toggle and side by side, sheet styling, restore card, docs close-out).

## Risks

| Risk | Likelihood / impact | Mitigation |
|------|---------------------|------------|
| iOS keyboard geometry differs across versions | M / M | inset 0 when `visualViewport` is missing; the top bar Save stays; owner check on a real iPhone (quickstart §5) |
| e2e selector churn breaks smoke | H / M | update the selectors in the same PR; contract file lists the roles and names |
| Escape handling conflicts with the 038 panels | M / L | panels handle Escape first and `preventDefault`; the shortcut skips handled events |
| Review queue regresses (shared dialog and fields) | L / M | `ReviewEditForm` tests unchanged; the dialog keeps its API |

## Settle before starting

- [x] Reference apps for SC-006 (D312).
- [ ] Owner review on a phone and a desktop before merging the last PR (SC-006).

## Complexity Tracking

No violations.
