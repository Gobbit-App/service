# Implementation Plan: Bottom bar and one Settings page

**Branch**: `036-bottom-bar` | **Date**: 2026-11-03 | **Spec**: [spec.md](spec.md) | **Roadmap**: `PLAN.md` § Usability pass

**Input**: Feature specification from `/specs/036-bottom-bar/spec.md`

## Summary

This plan replaces the deck header's actions and the inline creation row with one fixed bottom bar.

- **Left**: a ⋯ menu with Settings, Activity, Waitlist and Sign out.
- **Middle**: Browse and Review.
- **Right**: the +. A short press opens the create menu (New card, Paste or share, Import, Shares); a long press opens the new-card editor.

`/d/$slug/settings` becomes one Settings page: deck sections, then account sections. It is web only. It reuses `MoreMenu` (the APG menu button) and the existing Browse, Review and create links, plus a small, dependency-free long-press hook.

## Starting point

- **Base**: main @ `d263946` plus the stacked branch `fix/deck-nav-and-new-deck` (PR #79). That branch brings D267 back targets, D268 Browse-first and D269 New deck.
- **Parallel PRs**: #78 (palette, D272) and #80 (editor samples, D270–D271).
- **Latest migration**: unchanged (no DB work).
- **Relevant design records**:
  - ADR-059: actions through `ui/buttons`, icons from `ui/icons`;
  - ADR-065: no gesture library;
  - D200: back targets;
  - D184: deck settings;
  - D213: `MoreMenu`;
  - 033: analytics route patterns.
- **Current layout**:
  - **Header** (`app/AppHeader.tsx`): back, title, `actions`, Settings, Sign out.
  - **Deck layout** (`routes/d.$slug.tsx`): Browse, ReviewPill, ActivityLink and DeckSettingsLink as header actions, plus a `.deck-actions` row with AddCardLink, PasteLink, ImportLink and SharesLink.

## Technical Context

**Language/Version**: TypeScript (strict, ESM, no build step) on Node ≥ 22

**Primary Dependencies**: React + Vite + TanStack Router/Query (web). No new dependencies.

**Storage**: none

**Testing**: Vitest + Testing Library (unit/component), Playwright `@smoke` / `@full`

**E2E tier**: smoke — creating a card is a critical journey and its entry point moves to the bar's +; the smoke journeys that use "Add card", "Deck settings" and "Sign out" are updated. Secondary paths (keyboard menus, scroll persistence, unified settings, deck list +) are `@full`.

**Target Platform**: PWA on Android Chrome and iOS Safari (long press must not trigger the callout or text selection)

**Project Type**: pnpm monorepo — only `apps/web` and `e2e/` change

**Performance Goals**: no layout shift on scroll; bar is static (no scroll listeners)

**Constraints**: web initial bundle ≤ 150 KB gzip; no gesture library; same origin; offline usable

**Scale/Scope**: about 10 web files changed, 5 new, 6 e2e specs touched

## Constitution Check

| Principle | How this plan complies (or "N/A") |
|-----------|-----------------------------------|
| I. Layered API | N/A — no API change |
| II. One source of truth for contracts | Permissions from `@gobbit/shared/authz` `can()`; no new DTOs |
| III. Invariants live in the database | N/A — no data |
| IV. Private by default | Unchanged: the bar only links to routes that already gate by role. Hidden actions are also refused server-side |
| V. Tests at the right tier | Unit tests for `create-actions`, `deck-menu-actions`, `use-long-press` and `BottomBar` role variants. Smoke for the create journey, full for the rest (table below) |
| VI. Lean, offline-first web | No new libraries. The bar lives in the initial chunk (small) and Settings stays lazy. Offline: links work, network items keep their own disabled states |
| VII. Simple, optional, deployable | No env, no deploy change |
| VIII. Accountable by default | No decision about a person or their content is added (navigation only); see Accountability |

## Decisions this plan pins down

| ID | Decision | ADR? |
|----|----------|------|
| D274 | `BottomBar` rendered by the deck layout, deck list and `/settings`, with its own spacer | no |
| D275 | The + is `MoreMenu` with a long press (`use-long-press`, 500 ms, 10 px slop, click swallowed, no callout) | no |
| D276 | ⋯ menu (Settings, Activity, Waitlist, Sign out with email); `use-sign-out` hook; header keeps back and title | yes → ADR-067 "Bottom bar holds page actions" |
| D277 | Browse and Review reuse `BrowseButton` and `ReviewPill`; Browse from a non-list page opens All | no |
| D278 | `/d/$slug/settings` = deck sections then account sections; `/settings` unchanged; one Settings icon | no |
| D279 | Deck list + opens New deck via `?new=1` | no |
| D280 | `--bottom-bar-h` lifts toasts above the bar | no |

## Project Structure

### Documentation (this feature)

```text
specs/036-bottom-bar/
├── spec.md
├── plan.md
├── research.md
├── data-model.md        # no data changes (stub)
├── quickstart.md
├── contracts/ui.md      # bar, menus and settings contract
├── tasks.md             # /speckit-tasks
└── implementation-notes.md
```

### Source Code

```text
apps/web/src/
├── app/
│   ├── BottomBar.tsx            # NEW: ⋯ | Browse, Review | +
│   ├── BottomBar.test.tsx       # NEW: role variants, deck list, order
│   ├── create-actions.ts(+test) # NEW: role/deck → create menu items
│   ├── deck-menu-actions.ts(+test) # NEW: role/deck/me → ⋯ items
│   ├── use-sign-out.ts          # NEW: extracted from AppHeader
│   └── AppHeader.tsx            # back + title + actions only
├── ui/
│   ├── use-long-press.ts(+test) # NEW
│   └── MoreMenu.tsx             # + onLongPress, MenuAction.detail
├── routes/
│   ├── d.$slug.tsx              # bar instead of header actions and .deck-actions
│   ├── d.$slug.settings.tsx     # unified page
│   ├── index.tsx                # bar; ?new=1
│   └── settings.tsx             # bar
├── decks/NewDeckForm.tsx        # initialOpen
├── deck-admin/DeckSettingsLink.tsx  # removed
└── styles.css                   # .bottom-bar, spacer, --bottom-bar-h

e2e/tests/smoke/*.spec.ts        # Add card / Deck settings / Sign out → bar
e2e/tests/full/bottom-bar.spec.ts  # NEW
```

**Structure Decision**: Web only. The new pieces go in `app/` (shell) and `ui/` (generic hook). The pure action lists are separate modules so they can be unit-tested without rendering.

## Invariant → test traceability

| Invariant / rule | Enforced in | Test (file, tier) |
|------------------|-------------|-------------------|
| FR-001 bar fixed, visible after scroll, content not hidden | UI (CSS fixed + spacer) | `bottom-bar.spec.ts`, full |
| FR-002 order and role gates (reader: no +; Review only `item.publish`, not personal) | `BottomBar`, `create-actions` | `BottomBar.test.tsx`, `create-actions.test.ts`, unit |
| FR-003 short press → menu with permitted items; Escape and outside close; focus returns | `MoreMenu` | `MoreMenu.test.tsx`, unit; `smoke/editor.spec.ts`, smoke |
| FR-004 long press → new card; early release = short press; move cancels; no context menu | `use-long-press` | `use-long-press.test.ts`, unit; `bottom-bar.spec.ts`, full |
| FR-005 ⋯ items by role; sign out leaves the page first | `deck-menu-actions`, `use-sign-out` | `deck-menu-actions.test.ts`, unit; smoke sign-out journey, smoke |
| FR-006/FR-007 header and inline row emptied | `AppHeader`, `d.$slug.tsx` | `AppHeader.test.tsx`, unit |
| FR-008/FR-009 one Settings page; old links; back | `d.$slug.settings.tsx` | `bottom-bar.spec.ts` + `deck-admin.spec.ts`, full |
| FR-010 no bar in Browse, editor, card page | routes | `BottomBar` placement in `bottom-bar.spec.ts`, full |
| FR-012 keyboard menus | `MoreMenu` | `bottom-bar.spec.ts`, full |
| FR-013 budget | build | `pnpm budget`, CI |

## Accountability

None. The feature makes no decision about a person, their content or their experience: it only moves navigation. Role gates hide links whose targets already refuse server-side; those refusals keep their existing events. Analytics screen names and route patterns are unchanged (033).

**Operator controls**: none.

## Rollout

- **Migrations**: none
- **Env / config**: none
- **API client**: no
- **Deploy order / flags**: normal CI → Dokploy. Merge after PR #79 (stacked).

## Risks

| Risk | Likelihood / impact | Mitigation |
|------|---------------------|------------|
| iOS long press shows the callout or selects text | M / M | `-webkit-touch-callout: none`, `user-select: none`, `contextmenu` prevented; checked by hand on iPhone (quickstart) |
| Toasts and the editor's sticky save overlap the bar | M / L | D280 offset; no bar on the editor |
| Smoke specs break on moved controls | H / M | Update every "Add card", "Deck settings" and "Sign out" locator in the same PR |
| On-screen keyboard pushes the bar over the search field | L / L | Fixed to the layout viewport; the bar sits under the keyboard, the field stays visible |

## Settle before starting

- [x] PR #79 open (base of this branch)

## Complexity Tracking

None.
