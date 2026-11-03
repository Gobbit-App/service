---
description: "Tasks for 036 bottom bar and one Settings page"
---

# Tasks: Bottom bar and one Settings page

**Input**: Design documents from `/specs/036-bottom-bar/` (plan, spec, research D274–D280, contracts/ui.md, quickstart)

**Tests**: REQUIRED (constitution V). Each logic task has a matching test task, and each traceability row maps to a test.

## Format: `[ID] [P?] [Story] [Tier?] Description`

Stories map to spec user scenarios:

| Story | Scenarios | Priority |
|-------|-----------|----------|
| US1 | 1 + 2: bar, Browse, + short/long press | P1 |
| US2 | 3: Review in the bar | P1 |
| US3 | 4: ⋯ menu and sign-out | P1 |
| US4 | 5: one Settings page | P2 |
| US5 | deck list + (D279) | P3 |

## Phase 1: Foundational (Blocking Prerequisites)

- [x] T001 [P] Long-press hook in apps/web/src/ui/use-long-press.ts (D275).
  - Pointer events; 500 ms timer; cancel on move > 10 px, `pointercancel` or `pointerleave`; release before 500 ms is a normal click.
  - When it fires: calls `onLongPress`, `navigator.vibrate?.(10)`, and swallows the next click.
  - Prevents `contextmenu` while armed.
  - Returns props to spread on the trigger.
- [x] T002 [P] [unit] apps/web/src/ui/use-long-press.test.ts — fake timers:
  - fires at 500 ms and swallows the click;
  - early release clicks;
  - a 12 px move cancels;
  - `contextmenu` is prevented;
  - no `onLongPress` = inert.
- [x] T003 `MoreMenu` additions in apps/web/src/ui/MoreMenu.tsx (D275, D276):
  - optional `onLongPress` (via T001), with the click toggle suppressed after a long press;
  - `MenuAction.detail?: string`, rendered as a muted second line;
  - optional `triggerClassName`.
- [x] T004 [unit] Extend apps/web/src/ui/MoreMenu.test.tsx:
  - a long press calls `onLongPress` and does not open the menu;
  - `detail` renders;
  - the existing keyboard and outside-press cases stay.
- [x] T005 [P] Extract the sign-out flow from AppHeader into apps/web/src/app/use-sign-out.ts (D276).
  - Returns `{ signOut, signingOut }`, with the same leave-first behaviour (`onArrival`, cancel on unmount).
- [x] T006 [P] [unit] apps/web/src/app/use-sign-out.test.tsx:
  - navigates to /sign-in before calling the context `signOut`;
  - a pending sign-out cancels on unmount.

## Phase 2: US1 — bar, Browse and the + (P1) 🎯 MVP

**Goal**: deck pages end in a fixed bar (⋯ placeholder | Browse | +). The + short press opens the create menu; a long press opens the new-card editor. The inline creation row is gone.

**Independent test**: as owner on `/d/<slug>`, scroll to the bottom; the bar stays visible. Tap + → New card opens the editor. Hold + → the editor opens.

- [x] T007 [P] [US1] Pure create items in apps/web/src/app/create-actions.ts: `createActions(deck)` returns `MenuAction[]`.
  - Items: New card, Paste or share, Import, Shares.
  - The `can()` rules, labels-to-targets and hrefs are copied from apps/web/src/items/AddCardLink.tsx, apps/web/src/share/PasteLink.tsx, apps/web/src/import/ImportLink.tsx and apps/web/src/shares/SharesLink.tsx.
  - Readers get `[]`.
- [x] T008 [P] [US1] [unit] apps/web/src/app/create-actions.test.ts:
  - owner: all four, in order;
  - editor: per the old links' rules;
  - reader: none;
  - the personal deck's rules match the old links.
- [x] T009 [US1] `BottomBar` in apps/web/src/app/BottomBar.tsx (D274, D277, contract §1–§3).
  - Markup: `<nav>` (label "Deck actions" / "Actions") and a spacer element.
  - Contents: the ⋯ slot (T016 fills it), `BrowseButton` (`c = browseC ?? ALL_CATEGORIES`), and `MoreMenu` "Add" with icon `plus` and `onLongPress` → navigate `deckHref(slug, 'new')`, rendered only when `createActions` is non-empty.
- [x] T010 [US1] [unit] apps/web/src/app/BottomBar.test.tsx:
  - order ⋯, Browse, Add;
  - a reader has no Add;
  - Add opens New card first;
  - a long press navigates to `/d/<slug>/new` (NavigateContext spy).
- [x] T011 [US1] Styles in apps/web/src/styles.css (D274, D280):
  - `.bottom-bar`: fixed, inset-inline 0, bottom 0, `padding-bottom: var(--safe-bottom)`, surface, top border, z-index above the content and below menus;
  - `.bottom-bar__spacer`: the same height;
  - the + trigger: `-webkit-touch-callout: none; user-select: none; touch-action: manipulation`;
  - `:root` `--bottom-bar-h`, with the `.toast` bottom offset by it;
  - labels collapse to icons below 360 px.
- [x] T012 [US1] Deck layout in apps/web/src/routes/d.$slug.tsx:
  - render `<BottomBar deck browseC>` unless browsing or on `/new`;
  - remove `BrowseButton`, `ActivityLink` and `DeckSettingsLink` from the header actions;
  - remove the `.deck-actions` block and the four imports.
- [x] T013 [US1] Remove the now-unused `.deck-actions` styles in apps/web/src/styles.css. Delete apps/web/src/items/AddCardLink.tsx, apps/web/src/share/PasteLink.tsx, apps/web/src/import/ImportLink.tsx and apps/web/src/shares/SharesLink.tsx (and their tests) if nothing else imports them; otherwise keep them.
- [x] T014 [US1] [e2e:smoke] Update apps e2e/tests/smoke/editor.spec.ts and e2e/tests/smoke/share.spec.ts:
  - "Add card" → `getByRole('button', { name: 'Add' })` then menuitem "New card";
  - "Paste" → menuitem "Paste or share";
  - one smoke case presses and holds the + (`page.mouse.down`, wait 600 ms, `up`) and lands on `/new`.
- [x] T015 [US1] [e2e:full] e2e/tests/full/bottom-bar.spec.ts:
  - the bar is visible after `window.scrollTo(0, document.body.scrollHeight)` and does not overlap the last card (bounding boxes);
  - no bar in Browse or on `/new`;
  - the Add menu by keyboard (Enter opens, ArrowDown moves, Escape closes and refocuses);
  - update the "Add card" and "Browse" locators in e2e/tests/full/card-actions.spec.ts.

## Phase 3: US3 — ⋯ menu (P1)

**Goal**: Settings, Activity, Waitlist and Sign out live in the ⋯ menu; the header has back and title only.

**Independent test**: ⋯ → Sign out (shows the email) signs out; ⋯ → Activity opens the log for the owner.

- [x] T016 [P] [US3] Pure ⋯ items in apps/web/src/app/deck-menu-actions.ts: `menuActions({ deck?, isPlatformAdmin, email, onSignOut })`.
  - Settings (deck → `deckHref(slug, 'settings')`, else `/settings`), icon `settings`;
  - Activity when `can(role, 'event.list')`, icon `history`;
  - Waitlist when admin, icon `list`;
  - Sign out (icon `sign-out`, `detail: email`).
- [x] T017 [P] [US3] [unit] apps/web/src/app/deck-menu-actions.test.ts:
  - owner deck: four items in order;
  - editor: no Activity;
  - no deck: Settings goes to `/settings`;
  - the admin flag adds Waitlist;
  - the email is in the detail line.
- [x] T018 [US3] Wire the ⋯ `MoreMenu` (label "Menu", icon `more`) into apps/web/src/app/BottomBar.tsx with `useSignOut` and `meQuery`.
  - Extend apps/web/src/app/BottomBar.test.tsx: the menu items by role, and Sign out calls the hook.
- [x] T019 [US3] apps/web/src/app/AppHeader.tsx:
  - drop the Settings IconLink and Sign out (use-sign-out moves to the bar);
  - update apps/web/src/app/AppHeader.test.tsx (no Settings or Sign out; back and title unchanged).
- [x] T020 [US3] Delete apps/web/src/deck-admin/DeckSettingsLink.tsx. Remove `ActivityLink` if it is unused (grep), and update its tests.
- [x] T021 [US3] [e2e:smoke] Update the "Sign out" step of every smoke journey to ⋯ "Menu" → menuitem "Sign out" (grep e2e/tests/smoke for `Sign out`).
- [x] T022 [US3] [e2e:full] e2e/tests/full/bottom-bar.spec.ts:
  - ⋯ → Activity reaches `/d/<slug>/log`;
  - the ⋯ menu by keyboard;
  - update the "Activity" locators in existing full specs (grep).

## Phase 4: US2 — Review in the bar (P1)

**Goal**: owners and maintainers see Review with its count in the bar.

**Independent test**: with one proposal, the bar shows "Review · 1" and it opens the queue.

- [x] T023 [US2] Render `ReviewPill` in apps/web/src/app/BottomBar.tsx between Browse and Add, when `can(role, 'item.publish') && !deck.isDefault`. Remove it from the d.$slug.tsx header actions.
- [x] T024 [US2] [unit] Extend apps/web/src/app/BottomBar.test.tsx:
  - owner: Review present;
  - editor and the personal deck: absent.
- [x] T025 [US2] [e2e:full] e2e/tests/full/bottom-bar.spec.ts: a proposed card → the bar shows "Review · 1" → click → `/review`. Update the existing `Review · 2` and `Review` locators (grep e2e) if they were scoped to the header.

## Phase 5: US4 — one Settings page (P2)

**Goal**: `/d/$slug/settings` shows "This deck" and then "Your account"; `/settings` shows the account sections only.

**Independent test**: ⋯ → Settings on a deck shows both headings; Back returns to the deck.

- [x] T026 [US4] In apps/web/src/deck-admin/DeckAdminScreen.tsx, change the `<h2>` "Deck settings" to "This deck".
- [x] T027 [US4] Unified page in apps/web/src/routes/d.$slug.settings.tsx: `DeckAdminScreen`, then a `<section>` with `<h2>` "Your account" wrapping `SettingsScreen` (lazily, as today).
  - Add `<BottomBar>` to apps/web/src/routes/settings.tsx (no deck).
- [x] T028 [US4] [unit] Update apps/web/src/deck-admin/DeckAdminScreen.test.tsx (heading). Add a render test for the unified route component (both headings, in order) next to it, e.g. apps/web/src/deck-admin/UnifiedSettings.test.tsx.
- [x] T029 [US4] [e2e:full] Update e2e/tests/full/deck-admin.spec.ts:
  - the "Deck settings" link becomes ⋯ "Menu" → "Settings";
  - the heading becomes "This deck";
  - assert that "Your account" is visible.

## Phase 6: US5 — deck list + (P3)

**Goal**: on the deck list, + "New deck" opens the New deck form focused.

**Independent test**: on `/?all=true`, tap + → the Deck name field is focused.

- [x] T030 [US5] apps/web/src/routes/index.tsx:
  - `validateSearch` accepts `new` (`true`/`'1'`);
  - render `<BottomBar>` (no deck) with the + as IconButton "New deck" that navigates to `/?all=true&new=1`;
  - pass `initialOpen` to `NewDeckForm`.
- [x] T031 [US5] apps/web/src/decks/NewDeckForm.tsx: `initialOpen` prop (open on mount and when it changes to true). Cancel calls an `onClose` that drops `new` from the URL.
  - Extend apps/web/src/decks/NewDeckForm.test.tsx: `initialOpen` renders the open form.
- [x] T032 [US5] [e2e:full] Update e2e/tests/full/new-deck.spec.ts. Its "New deck" locator becomes ambiguous (bar + form), so use the bar's button (`getByRole('navigation', { name: 'Actions' })`), and assert that the field is focused.

## Phase 7: Polish & Cross-Cutting

- [x] T033 Docs:
  - "Bottom bar (036, D274–D280)" section and Deviations list in docs/design/web-pwa.md;
  - ADR-067 in docs/adr.md, plus one index row in docs/architecture.md;
  - tick the 2026-11-03 items in docs/usability-backlog.md (bottom menu, settings merge);
  - add a usability-pass line in PLAN.md linking specs/036-bottom-bar.
- [x] T034 Write specs/036-bottom-bar/implementation-notes.md (decisions and deviations made while implementing).
- [x] T035 Gates: `pnpm typecheck`, `pnpm lint`, `pnpm test:unit`, `pnpm build:web && pnpm budget` (≤ 150 KB) and Prettier.
- [x] T036 The quickstart's by-hand checks 1–8 (phone), recorded in implementation-notes.

## Dependencies

- T001 → T003 → T009.
- T005 → T018.
- T007 → T009.
- US1 (T009–T012) before US2, US3 and US5, which all edit `BottomBar`. US4 needs only T027's `BottomBar` import.
- The e2e tasks follow their story's UI tasks.

## Parallel opportunities

- Phase 1: T001/T002, T005/T006 and T007/T008 and T016/T017 (pure modules) can all run in parallel.
- After US1: US4 (settings files) runs in parallel with US2 and US3 (`BottomBar`).

## Implementation strategy

MVP = Phase 1 + US1: the bar replaces the creation row and the + works. Then US3 (move sign-out, so the header empties), US2, US4 and US5, then polish. One PR (stacked on #79).
