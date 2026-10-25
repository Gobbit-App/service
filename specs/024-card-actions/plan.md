# Implementation Plan: Card actions and icon buttons

**Branch**: `feat/024-card-actions` | **Date**: 2026-10-26 | **Spec**: [spec.md](./spec.md) | **Roadmap**: `PLAN.md` § Usability pass (item 3)

**Input**: Feature specification from `/specs/024-card-actions/spec.md`

Project override of the core template. Written for outside readers: the repository is public.

## Summary

A web-only visual and structural pass, one PR. No API, schema or contract change.

**Icon set (US2, D210).** `apps/web/src/ui/icons/` holds one hand-drawn set: `icon-paths.ts` maps each `IconName` to SVG path data on a 24 px grid; `Icon.tsx` renders `<svg viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" fill="none" aria-hidden="true" focusable="false">`. A `filled` variant fills the shape (favorite on). Directional icons (`back`, `forward`) carry a class that mirrors them under `[dir='rtl']`; the rest never flip. No icon library, no sprite request, no Unicode glyph left in the app (a unit test scans `apps/web/src` for the old glyphs).

**Buttons (US2, D211).** Three primitives in `ui/buttons/`: `IconButton` (a 44 × 44 chiclet, icon only, `aria-label` = its label, `data-tip` = its tooltip), `IconLink` (the same as a router link) and `Button` (the existing `.button` pill with an icon and a label span; the label is visually hidden below 480 px, so the name never changes). Toggles pass `pressed`; offline or busy actions pass `disabledReason`, which renders `aria-disabled="true"` (stays focusable and hoverable so its tooltip can explain why) and swallows the click.

**Tooltips (US2, D212).** CSS only: `[data-tip]::after` shows the text on `:hover` (only under `@media (hover: hover)`), on `:focus-visible`, and while `data-tip-open` is set. One delegated touch listener (`ui/tooltip-press.ts`, installed once in `main.tsx`) sets `data-tip-open` after a 500 ms still press, cancels on > 10 px movement or release, swallows the click that follows and the context menu. It never calls `preventDefault` on `touchstart`/`touchmove`, so browse swipes are untouched.

**Actions inside the card (US1, D213).** `Card` gets an `actions` slot rendered in a `card__bar` footer inside the `<article>`; without it the bar holds Favorite and Share (search results, browse). `cards/CardActionBar.tsx` builds the bar for a card and role: bar = Edit, Favorite, Share and at most one state action (Restore for archived cards, Undelete for deleted ones, Check again for flagged links); the "more" menu (`ui/MoreMenu.tsx`, APG menu button) holds History, Archive, Dismiss (link note) and Delete (marked destructive, still behind the 006 confirm). Lists (`ItemList` `renderActions`), the card page, archived, links, recently deleted and browse (`ContentPane` gets the deck role) all use it, so nothing action-like sits between cards. The review card's own bar holds Publish (or Apply update + Publish as new), Edit and Discard (the reject action keeps its existing name), with Edit fully in "more". `CardActions` (row below the card) and `EditLink`'s `row` mode go away.

**One destructive style, no leaks (US3, D214).** One `.button--danger` rule (transparent fill, danger border and text) replaces the two conflicting ones that made the pink block; `.icon-button--danger` and `.menu__item--danger` use the same colour. Light `#a12b2b` on `#ffffff` and dark `#f08a8a` on `#26201c` are both ≥ 4.5:1; a unit test reads the tokens from `styles.css` and checks the ratio. `editor.css` drops its global `.icon-button` rule (the leak that restyled favorite/share after the editor loaded); table tools use the shared chiclet. A unit test asserts the lazy stylesheets (`editor.css`, `browse.css`) style no shared button class outside their own scope.

**Browse without arrows (US4, D215).** The header loses ↑ and ‹ ›, the footer loses ‹ › and ↓. The position "3 of 12" becomes a menu button (`Card 3 of 12`) whose menu offers Previous card / Next card, so screen-reader and switch users keep a non-gesture path; categories change through the existing category menu; views through the tabs. Swipes and keys are unchanged.

**Adoption (D211).** Every action button and action link in the app gets an icon: header (back, settings, sign out, review), editor (Save card, Cancel, photo replace/remove, table tools, add field), dialogs (Keep editing, Discard, Delete), 023's Undo notice, settings, deck admin, import, review select bar, shares, search, sign-in. Selection controls (tabs, filter chips, category chips, mode toggle, recent searches, menu radio items, the radio card-type picker) are not action buttons and keep their text (D211).

## Starting point

- Branch `feat/024-card-actions` = `main @ 4062ead` + 022-editor-navigation (#56) + 023-editor-inputs (#57), merged in; it should merge after both.
- Card frame `cards/Card.tsx` (Favorite/Share in the header, chips + age in the footer); lifecycle buttons in `items/CardActions.tsx` render **below** the card (`ItemList renderActions`, card page, archived, links, recently deleted); `EditLink` and `ItemHistoryLink` are text pills.
- Glyph icons: `FavoriteButton` ★/☆, `ShareButton` ⤴, `AppHeader` ◂ ⚙, browse ✕ ↑ ↓ ‹ ›, `EntityChips` ×, `TableFields` ← → ↑ ↓ ×.
- Styles: `.button--danger` is defined twice in `styles.css` (outline, then a later filled rule that keeps the danger text colour → the pink block); `editor/editor.css` (lazy) redefines `.icon-button` globally.
- Browse (009): `HeaderBand` (close, position, ↑, ‹ category menu ›), `FooterBand` (tabs, ‹ dots ›, ↓), swipe zones via `use-zone-swipe`, keys via `browse-keys`.
- Budget: initial JS 114.7 KB gzip of 150 KB.

## Technical Context

**Language/Version**: TypeScript (strict, ESM, no build step) on Node ≥ 22; React 19

**Primary Dependencies**: React + Vite + TanStack Router/Query (web). New dev-only dependency: `@axe-core/playwright` in `e2e/` for the automated accessibility check (SC-003); nothing new in the shipped app.

**Storage**: none (no migration, no API change)

**Testing**: Vitest + Testing Library (icons, buttons, tooltip press, menu, action bar, browse bands, contrast and CSS-scope checks, glyph scan), Playwright `@smoke` + `@full`

**E2E tier**: smoke + full — reading a deck and editing a card are critical journeys and their controls move into the card (constitution V). Smoke: the deck list shows Edit/Favorite/Share inside each card and nothing between cards; Archive and Delete run from the "more" menu (Delete confirms); browse has no arrow buttons and the position menu moves to the next card; review publishes from the card bar. Full: axe check (button names, button contrast) in light and dark on deck list, card page, browse, review, settings and editor; labels hide at 360 px and show at 1024 px; long-press tooltip; offline actions disabled with a reason; archived/links bars; editor-then-list keeps button styles.

**Target Platform**: PWA (Android Chrome, iOS Safari); Docker Compose on Dokploy

**Project Type**: pnpm monorepo — PWA change only

**Performance Goals**: no extra request (icons inline in the bundle); no layout shift (icon box fixed 20 px in a 44 px target)

**Constraints**: initial bundle ≤ 150 KB gzip and growth ≤ 6 KB (SC-005); plain CSS; `@use-gesture/react` stays in the browse chunk; value imports only from `@pb/shared` subpaths

**Scale/Scope**: ~35 icons, ~100 buttons across ~45 components

## Constitution Check

| Principle | How this plan complies |
|-----------|------------------------|
| I. Layered API | N/A — no API change; lifecycle and link-check calls reuse the existing hooks. |
| II. One source of truth | N/A — no DTO change; role rules keep coming from `@pb/shared/authz` (`can`) and `availableActions`/`canEditItem`. |
| III. Invariants in the DB | N/A — no schema change. Delete still confirms; server rules unchanged. |
| IV. Private by default | Unchanged: the bar only hides/shows controls by role; the server still authorises every write. |
| V. Tests at the right tier | Unit next to every new module and changed component; e2e smoke (critical journeys) + full (variants, a11y, offline); traceability below. |
| VI. Lean web | No UI kit, no icon library; icons are path strings (~2 KB gzip); tooltip is CSS + one listener; browse code stays lazy; `pnpm budget` checked (≤ 6 KB growth). |
| VII. Simple, optional, deployable | One dev-only dependency (`@axe-core/playwright`, research D216) — the established tool for automated a11y checks, cheaper and more reliable than hand-written contrast/name checks in e2e. No env, no migration. |

Post-design re-check: no violations.

## Decisions this plan pins down

| ID | Decision | ADR? |
|----|----------|------|
| D210 | One hand-drawn inline SVG icon set (`ui/icons`): 24 px grid, 1.75 stroke, round caps/joins, `currentColor`, path data as strings, `filled` variant for toggles, only directional icons mirror in RTL; no icon library, no Unicode glyph icons | yes → ADR-059 |
| D211 | Button primitives `IconButton` / `IconLink` (icon-only chiclets, 44 px, `aria-label`) and `Button` (icon + label, label visually hidden below 480 px); `disabledReason` → `aria-disabled` + tooltip; every action button/link uses them; selection controls (tabs, filter/category chips, toggles, menu radios) keep text | yes → ADR-059 |
| D212 | Tooltips are CSS from `data-tip` (hover only on hover-capable pointers, focus-visible, long-press via one delegated 500 ms touch listener that never blocks swipes); no native `title` on icon buttons | yes → ADR-059 |
| D213 | Actions live in a `card__bar` inside the card: bar = Edit, Favorite, Share + ≤ 1 state action (Restore / Undelete / Check again); "more" = History, Archive, Dismiss, Delete (destructive, confirm kept); review bar = Publish (/Apply update + Publish as new), Edit, Discard, "more" = Edit fully; `CardActions` row removed | no |
| D214 | One destructive style (outline: danger border + text on the surface, ≥ 4.5:1 in both themes, checked by a token unit test); lazily loaded stylesheets may not style shared button classes globally (scope test) | no |
| D215 | Browse arrow buttons removed; the position becomes a "Card n of N" menu button with Previous/Next card items; category via the category menu, views via the tabs; swipes and keys unchanged | no |
| D216 | E2E tier smoke + full (split above); `@axe-core/playwright` (dev-only, e2e) runs `button-name` and `color-contrast` on buttons in both themes | no |

## Project Structure

### Documentation (this feature)

```text
specs/024-card-actions/
├── spec.md
├── plan.md                    # this file
├── research.md                # D210–D216
├── data-model.md              # icon + card action shapes (client only)
├── contracts/action-buttons.md
├── quickstart.md
├── tasks.md
└── implementation-notes.md
```

### Source Code (repository root)

```text
apps/web/src/
├── ui/icons/icon-paths.ts (+ .test.ts)   # NEW IconName → path data; grid/glyph checks
├── ui/icons/Icon.tsx (+ .test.tsx)       # NEW <svg> renderer, filled, directional
├── ui/buttons/IconButton.tsx, IconLink.tsx, Button.tsx (+ tests)   # NEW primitives
├── ui/tooltip-press.ts (+ .test.ts)      # NEW long-press tooltip listener
├── ui/MoreMenu.tsx (+ .test.tsx)         # NEW menu button ("More actions")
├── ui/FavoriteButton.tsx, ShareButton.tsx, UndoToast.tsx   # icons
├── cards/Card.tsx                        # actions slot in card__bar
├── cards/CardActionBar.tsx (+ .test.tsx) # NEW bar + menu per item/role/state
├── cards/EditLink.tsx                    # removed (logic folded into the bar)
├── items/CardActions.tsx                 # → lifecycle hook `use-card-lifecycle.ts`; row removed
├── items/ItemList.tsx, DeckItems.tsx, DeletedSection.tsx, ItemHistoryLink.tsx, LinkCheckButtons.tsx
├── routes/i.$itemId.tsx, d.$slug.archived.tsx, d.$slug.links.tsx
├── review/ReviewCard.tsx, ReviewSelectBar.tsx, ReviewEditForm.tsx
├── browse/HeaderBand.tsx, FooterBand.tsx, PositionMenu.tsx (NEW), BrowseStack.tsx, panes/ContentPane.tsx, browse.css
├── app/AppHeader.tsx, editor/*, settings/*, deck-admin/*, import/*, shares/*, search/*, routes/*  # icons on every action
├── styles.css                            # one .button--danger, card__bar, menu, tooltip, label breakpoint
├── editor/editor.css                     # global .icon-button removed
├── styles.test.ts                        # NEW contrast + lazy-CSS scope checks
└── no-glyphs.test.ts                     # NEW no Unicode glyph icons in src

e2e/
├── package.json                          # + @axe-core/playwright (dev)
├── playwright.config.ts                  # WEB_SPECS + card-actions
├── tests/smoke/{web,lifecycle,browse,review,editor}.spec.ts   # updated selectors + in-card assertions
└── tests/full/card-actions.spec.ts       # NEW a11y (axe), labels, tooltip, offline, leak, archived/links
```

**Structure Decision**: everything lives in `apps/web`. Icons and button primitives sit in `ui/` (shared by every screen, part of the initial chunk because the header and cards use them); the card bar sits in `cards/` next to `Card`.

## Invariant → test traceability

| Invariant / rule | Enforced in | Test (file, tier) |
|------------------|-------------|-------------------|
| FR-001 actions inside the card | `Card` `card__bar`, `CardActionBar` | `Card.test.tsx`, `ItemList.test.tsx` (unit); `web.spec.ts` (e2e:smoke) |
| FR-002 bar vs "more" split, ≤ 4 visible | `CardActionBar` | `CardActionBar.test.tsx` (unit, per state/role); `lifecycle.spec.ts` (e2e:smoke) |
| FR-003 one set, no glyphs, no library | `ui/icons` | `icon-paths.test.ts`, `no-glyphs.test.ts` (unit) |
| FR-004 names, tooltips, pressed state | button primitives, `tooltip-press` | `IconButton.test.tsx`, `tooltip-press.test.ts`, `FavoriteButton.test.tsx` (unit); axe `button-name` in `card-actions.spec.ts` (e2e:full) |
| FR-005 label hidden below breakpoint, chiclets icon-only | `Button`, CSS | `Button.test.tsx` (unit, name stays); `card-actions.spec.ts` 360 vs 1024 px (e2e:full) |
| FR-006 44 px target, focus ring | CSS | `card-actions.spec.ts` bounding boxes (e2e:full) |
| FR-007 one destructive style ≥ 4.5:1 | `styles.css` | `styles.test.ts` (unit); axe `color-contrast` both themes (e2e:full) |
| FR-008 no editor style leak | `editor.css` scope | `styles.test.ts` (unit); `card-actions.spec.ts` editor-then-list (e2e:full) |
| FR-009 no browse arrows; alternatives remain | `HeaderBand`, `FooterBand`, `PositionMenu` | `HeaderBand.test.tsx`, `FooterBand.test.tsx`, `PositionMenu.test.tsx` (unit); `browse.spec.ts` (e2e:smoke) |
| FR-010 budget | Vite build | `pnpm budget` (CI) |
| Edge: delete still confirms | `use-card-lifecycle` | `CardActionBar.test.tsx` (unit); `lifecycle.spec.ts` (e2e:smoke) |
| Edge: offline disabled with reason | `disabledReason` | `CardActionBar.test.tsx` (unit); `card-actions.spec.ts` offline (e2e:full) |
| Edge: long-press doesn't swipe | `tooltip-press` (passive, no preventDefault on move) | `tooltip-press.test.ts` (unit) |
| Edge: RTL flips only directional icons | `Icon` `icon--directional` | `Icon.test.tsx` (unit) |

## Rollout

- **Migrations**: none. **Env / config**: none. **API client**: unchanged.
- **Deploy order / flags**: normal web deploy. Accessible names of existing actions are kept (Edit, Archive, Delete, Restore, Undo, Publish, Discard, Previous/Next card), so assistive-tech users find the same words; Archive and Delete move into the "More actions" menu.

## Risks

| Risk | Likelihood / impact | Mitigation |
|------|---------------------|------------|
| Icon-only primary buttons on phones are less clear than words | M / M | Tooltips on long-press, accessible names unchanged, labels on wider screens; SC-004 hallway check after merge |
| Long-press listener interferes with browse swipes | L / H | Passive listeners, never `preventDefault` on start/move; cancel on 10 px movement; unit test |
| Bundle growth | L / M | Path strings only; measured with `pnpm budget` |
| e2e selectors churn (menu items) | M / L | Same names; smoke updated in the same PR |

## Settle before starting

- [x] Label breakpoint: 480 px viewport (phones portrait hide labels) (D211).
- [x] Reject keeps the existing "Discard" wording; icon `reject` (D213).
- [x] Browse accessible alternative: position menu button, not a slider (D215).

## Complexity Tracking

None.
