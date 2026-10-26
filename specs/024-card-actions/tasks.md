---

description: "Task list for 024-card-actions"
---

# Tasks: Card actions and icon buttons

**Input**: Design documents from `/specs/024-card-actions/`

**Prerequisites**: plan.md, spec.md, research.md (D210–D216), data-model.md, contracts/action-buttons.md

**Tests**: REQUIRED (constitution V). Every row of the plan's traceability table maps to a test task below.

**Organization**: Tasks are grouped by user story. US1 and US2 are both P1; US2's primitives are foundational for US1, so they come first (Phase 2).

## Format: `[ID] [P?] [Story] [Tier?] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: US1 actions in the card, US2 icons, US3 destructive style, US4 browse arrows
- **[Tier]**: `[unit]` `*.test.ts(x)` next to code, `[e2e:smoke]` `e2e/tests/smoke/`, `[e2e:full]` `e2e/tests/full/` (constitution V, ADR-053)

---

## Phase 1: Setup

- [x] T001 Add `@axe-core/playwright` as a dev dependency of `e2e/` (`pnpm --filter e2e add -D @axe-core/playwright`); add `card-actions` to `WEB_SPECS` in e2e/playwright.config.ts

---

## Phase 2: Foundational — icon set and button primitives (US2 core, blocks US1/US4)

**Goal**: one icon set (D210), button primitives (D211), tooltips (D212).

### Tests

- [x] T002 [P] [US2] [unit] apps/web/src/ui/icons/icon-paths.test.ts: every `IconName` has non-empty path data; every coordinate of every path lies within 0–24; `FILLABLE` ⊂ names; set has ≥ 25 icons
- [x] T003 [P] [US2] [unit] apps/web/src/ui/icons/Icon.test.tsx: `viewBox="0 0 24 24"`, `stroke-width="1.75"`, `stroke="currentColor"`, `aria-hidden`, `focusable="false"`; `filled` sets `fill="currentColor"`; `back` has `icon--directional`, `edit` does not
- [x] T004 [P] [US2] [unit] apps/web/src/ui/buttons/IconButton.test.tsx + IconLink.test.tsx + Button.test.tsx: accessible name = label; `data-tip`; `aria-pressed` when `pressed`; `disabledReason` → `aria-disabled="true"`, click not called, tip "label — reason"; Button renders `.button__label` text and the same name; danger tone class
- [x] T005 [P] [US2] [unit] apps/web/src/ui/tooltip-press.test.ts (fake timers): 500 ms still press sets `data-tip-open`; move > 10 px cancels; release before 500 ms cancels; the click after a shown tooltip is swallowed; no `preventDefault` on touchstart/touchmove; tooltip clears after 1.5 s
- [x] T006 [P] [US2] [unit] apps/web/src/ui/MoreMenu.test.tsx: button `aria-haspopup="menu"`, `aria-expanded`; opens with click/Enter/ArrowDown and focuses the first item; Arrow/Home/End move; Escape closes and returns focus; outside pointer closes; `aria-disabled` item ignored; danger item class

### Implementation

- [x] T007 [US2] apps/web/src/ui/icons/icon-paths.ts (`IconName`, `ICON_PATHS`, `FILLABLE`, `DIRECTIONAL`) — hand-drawn paths on a 24 px grid, content within 2–22
- [x] T008 [US2] apps/web/src/ui/icons/Icon.tsx
- [x] T009 [US2] apps/web/src/ui/buttons/{IconButton,IconLink,Button}.tsx (+ shared `use-disabled-reason` helper if needed)
- [x] T010 [US2] apps/web/src/ui/tooltip-press.ts; call `installTooltipPress()` once in apps/web/src/main.tsx
- [x] T011 [US2] apps/web/src/ui/MoreMenu.tsx (APG menu button; items `{ key, label, icon, onSelect | href, tone?, disabledReason? }`)
- [x] T012 [US2] apps/web/src/styles.css: `.icon` (1.25rem, RTL mirror for `.icon--directional`), `.icon-button` (44 px, focus ring, `--danger`, `[aria-disabled]` dimmed), `.button` with icon gap and `.button__label` hidden below 480 px, `[data-tip]` tooltip (hover-capable, focus-visible, `[data-tip-open]`), `.menu` / `.menu__item(--danger)`

**Checkpoint**: primitives ready

---

## Phase 3: User Story 1 — Actions live inside the card (Priority: P1) 🎯 MVP

**Goal**: every card's actions sit in one bar inside the card; rare/destructive ones in "more".

**Independent Test**: deck list, card page, browse, review, archived, links: every action inside its card's border, with icons.

### Tests

- [x] T013 [P] [US1] [unit] apps/web/src/cards/CardActionBar.test.tsx: published card as owner → bar Edit, Favorite, Share, More; menu History, Archive, Delete (danger); viewer → Favorite, Share only (no menu); archived → Restore in bar, Delete in menu; deleted → Undelete; flagged link → Check again in bar, Dismiss in menu; Delete confirms (cancel → nothing sent); offline → Archive/Delete `aria-disabled` with "needs a connection"; ≤ 4 bar actions in every state
- [x] T014 [P] [US1] [unit] apps/web/src/cards/Card.test.tsx + apps/web/src/items/ItemList.test.tsx: `card__bar` is inside the `<article>`; actions slot replaces the default bar; nothing rendered between `<article>`s besides the cards
- [x] T015 [P] [US1] [unit] apps/web/src/review/ReviewCard.test.tsx: bar holds Publish / Apply update + Publish as new, Edit, Discard; menu holds Edit fully; all inside the article
- [x] T016 [P] [US1] [unit] apps/web/src/browse/panes/ContentPane.test.tsx: Edit shown inside the card for a role that can edit, absent for a viewer
- [x] T017 [P] [US1] [e2e:smoke] e2e/tests/smoke/web.spec.ts: deck list cards contain Edit/Favorite/Share inside each `article`; e2e/tests/smoke/lifecycle.spec.ts: Archive and Delete run from "More actions" (Delete confirm), Restore from the archived card bar, Undelete from recently deleted; e2e/tests/smoke/review.spec.ts: Publish/Discard from the card bar

### Implementation

- [x] T018 [US1] apps/web/src/items/use-card-lifecycle.ts: lifecycle run/undo/confirm/toasts extracted from CardActions.tsx (keep `availableActions`, `DELETE_CONFIRM` exports); `useLinkCheckRun` in apps/web/src/items/LinkCheckButtons.tsx (or a hook file)
- [x] T019 [US1] apps/web/src/cards/CardActionBar.tsx (bar/menu split per data-model.md "Bar per card state")
- [x] T020 [US1] apps/web/src/cards/Card.tsx: `actions` slot in `card__bar`; Favorite/Share move from the header into the default bar
- [x] T021 [US1] apps/web/src/ui/FavoriteButton.tsx (`star`, filled when pressed) and apps/web/src/ui/ShareButton.tsx (`share` icon, IconButton)
- [x] T022 [US1] Wire the bar: apps/web/src/items/ItemList.tsx (renderActions → Card `actions`), apps/web/src/items/DeckItems.tsx, apps/web/src/routes/i.$itemId.tsx, apps/web/src/routes/d.$slug.archived.tsx, apps/web/src/routes/d.$slug.links.tsx, apps/web/src/items/DeletedSection.tsx; remove `CardActions` row and EditLink `row`/ItemHistoryLink pills (fold into the bar)
- [x] T023 [US1] apps/web/src/browse/panes/ContentPane.tsx (+ BrowseScreen/BrowseStack plumbing of the deck role) → Edit in the card bar
- [x] T024 [US1] apps/web/src/review/ReviewCard.tsx: `card__bar` with Publish/Apply update/Publish as new, Edit, Discard (`reject`, danger tone), MoreMenu Edit fully
- [x] T025 [US1] apps/web/src/styles.css: `.card__bar` (hairline separator, flex, end-aligned more), remove `.card-actions` row styles

**Checkpoint**: US1 independently testable

---

## Phase 4: User Story 2 — Icons everywhere (Priority: P1)

**Goal**: every action button shows an icon; no Unicode glyph icons; labels only as FR-005 labels.

**Independent Test**: walk every screen: icons everywhere, no glyphs, axe finds no unnamed buttons.

### Tests

- [x] T026 [P] [US2] [unit] apps/web/src/no-glyphs.test.ts: no file under apps/web/src (excluding tests) contains ◂ ▸ ⚙ ✕ ✖ × ★ ☆ ⤴ ↑ ↓ ← → ‹ › ⋯ in JSX text
- [x] T027 [P] [US2] [unit] Update existing component tests that asserted glyphs or text-only buttons (FavoriteButton.test.tsx, AppHeader.test.tsx, SaveBar/DiscardChangesDialog/UndoToast tests, TableFields, EntityChips) to assert names + an `svg`
- [x] T028 [P] [US2] [e2e:full] e2e/tests/full/card-actions.spec.ts: axe `button-name`/`link-name` on deck list, card page, browse, review, settings, editor; labelled button shows its label at 1024 px and hides it at 360 px with the same name; long-press on Edit shows the tooltip and doesn't navigate; icon buttons ≥ 44 × 44

### Implementation

- [x] T029 [P] [US2] apps/web/src/app/AppHeader.tsx (back `IconLink` with `back`, settings `settings`, Sign out `sign-out`), apps/web/src/review/ReviewPill.tsx (`inbox` + count), apps/web/src/events/ActivityLink.tsx (`history`), apps/web/src/deck-admin/DeckSettingsLink.tsx (`settings`)
- [x] T030 [P] [US2] Editor: apps/web/src/editor/SaveBar.tsx (Save card `check`, Cancel `close` — 022), DiscardChangesDialog.tsx (Keep editing `edit`, Discard `trash`), DraftRestoreBanner.tsx, fields/TableFields.tsx (arrows, `plus`, `trash` as IconButton), CalcFields.tsx, FetchPreview.tsx (`refresh`), ImageFields.tsx/PickButton.tsx/LinkPhoto.tsx (`photo`, `upload`, `trash`), NewCategory.tsx (`plus`); apps/web/src/editor/editor.css drops the global `.icon-button`
- [x] T031 [P] [US2] apps/web/src/ui/UndoToast.tsx (Undo `undo` — 023), StatusViews.tsx (Try again `refresh`), SignInForm.tsx (`send`), apps/web/src/routes/__root.tsx, auth.error.tsx
- [x] T032 [P] [US2] Lists and deck: apps/web/src/items/{AddCardLink,BrowseButton,ItemList(Load more)}.tsx, apps/web/src/share/PasteLink.tsx, apps/web/src/import/ImportLink.tsx, apps/web/src/shares/SharesLink.tsx, apps/web/src/cards/EntityChips.tsx (× → `close`)
- [x] T033 [P] [US2] Review: apps/web/src/review/{ReviewSelectBar,ReviewEditForm,ReviewQueue,BulkPublishNotice}.tsx
- [x] T034 [P] [US2] Settings + admin: apps/web/src/settings/{CopyButton,NewTokenForm,TokenList,TokenSecret}.tsx, apps/web/src/deck-admin/{CategoriesSection,DeckSection,InviteForm,MembersSection,PublicSwitchDialog}.tsx (Remove member / Revoke = danger)
- [x] T035 [P] [US2] Share, import, search, events: apps/web/src/share/{ShareForm,ShareSent,ShareThumbnails}.tsx, apps/web/src/shares/ShareRow.tsx, apps/web/src/import/{ImportInput,ImportPreview,ImportPreviewRow,ImportResult}.tsx, apps/web/src/search/AskView.tsx, apps/web/src/events/EventLog.tsx, apps/web/src/browse/FirstRunHint.tsx

**Checkpoint**: US2 complete

---

## Phase 5: User Story 3 — A delete button that looks like one (Priority: P2)

**Goal**: one destructive style, readable in both themes; no editor style leak.

**Independent Test**: destructive buttons in light and dark ≥ 4.5:1; editor-then-list keeps button styles.

### Tests

- [x] T036 [P] [US3] [unit] apps/web/src/styles.test.ts: parse `--color-danger`, `--color-surface`, `--color-bg`, `--color-accent`, `--color-accent-text`, `--color-muted` for light and dark from styles.css; danger on surface/bg ≥ 4.5:1, accent-text on accent ≥ 4.5:1, muted on surface ≥ 3:1; exactly one `.button--danger` rule; editor.css/browse.css have no unscoped `.button`/`.icon-button`/`.menu` selector
- [x] T037 [P] [US3] [e2e:full] e2e/tests/full/card-actions.spec.ts: axe `color-contrast` on buttons in light and dark (deck list with menu open, settings with a token, deck admin); open editor, go back, favorite button's computed border/background unchanged

### Implementation

- [x] T038 [US3] apps/web/src/styles.css: one `.button--danger` (outline: danger border + text, hover tint), delete the later filled rule; `.review-card__discard` folded into the danger tone; `.icon-button--danger`, `.menu__item--danger`

**Checkpoint**: US3 complete

---

## Phase 6: User Story 4 — Browse mode without the arrow buttons (Priority: P2)

**Goal**: no arrow buttons; swipe, keys, category menu and the position menu remain.

**Independent Test**: browse on a phone: no arrows, swipes work; screen reader can change card via the position menu.

### Tests

- [x] T039 [P] [US4] [unit] apps/web/src/browse/HeaderBand.test.tsx + FooterBand.test.tsx: no Previous/Next card/category/view buttons; close is an icon button; tabs and category menu remain
- [x] T040 [P] [US4] [unit] apps/web/src/browse/PositionMenu.test.tsx: name "Card 3 of 12"; items Previous card / Next card call handlers; ends `aria-disabled`; unknown total → "Card 3"
- [x] T041 [P] [US4] [e2e:smoke] e2e/tests/smoke/browse.spec.ts: no arrow buttons; position menu → Next card moves; category menu changes category; keys and swipe tests unchanged

### Implementation

- [x] T042 [US4] apps/web/src/browse/PositionMenu.tsx (MoreMenu-based)
- [x] T043 [US4] apps/web/src/browse/HeaderBand.tsx (close `IconButton`, PositionMenu, CategoryMenu only), apps/web/src/browse/FooterBand.tsx (tabs + dots only), apps/web/src/browse/BrowseStack.tsx / BrowsePage.tsx / BrowseCards.tsx prop plumbing (`onNextCard` to the header), apps/web/src/browse/browse.css
- [x] T044 [US4] apps/web/src/browse/CategoryMenu.tsx: keep text items; the trigger keeps its name `Category: …` (selection control)

**Checkpoint**: all four stories work

---

## Phase 7: Close-out

- [x] T045 `pnpm lint && pnpm typecheck && pnpm exec prettier --check <changed> && pnpm test:unit && pnpm build:web && pnpm budget` (record KB vs 114.7)
- [x] T046 Run the e2e specs locally (`pnpm test:e2e`) if a local stack is available; record the outcome in implementation-notes.md
- [x] T047 [P] docs/design/icons-and-actions.md (icon rules, primitives, card bar, tooltip, browse change, Deviations); docs/design/browse-mode.md and docs/design/card-lifecycle.md pointers; ADR-059 in docs/adr.md + one index row and at most one line in docs/architecture.md; CLAUDE.md Web rule line for icons
- [x] T048 [P] specs/024-card-actions/implementation-notes.md; tick docs/usability-backlog.md items 3, 7, 9, 10; PLAN.md § Usability pass links 022, 023, 024 with status
- [x] T049 `/speckit-converge` until it reports Converged

---

## Dependencies & Execution Order

- Phase 2 (primitives) blocks US1, US2 adoption and US4
- US1 needs FavoriteButton/ShareButton icons (T021) and MoreMenu (T011)
- US3 is CSS-only and independent after Phase 2; US4 depends on MoreMenu (PositionMenu)
- Close-out after all stories

### Parallel Opportunities

- All test tasks within a phase are [P]
- T029–T035 touch separate files and can run in parallel

## Implementation Strategy

MVP = Phase 2 + US1 (the most visible problem). Then US2 adoption sweep, US3 (small CSS), US4 (browse). One PR for all four.

---

## Notes

- Keep accessible names stable (Edit, Archive, Delete, Restore, Undelete, Undo, Publish, Discard, Previous/Next card) so e2e and assistive-tech users see the same words
- Log decisions the plan did not make, and deviations, in implementation-notes.md as you go
