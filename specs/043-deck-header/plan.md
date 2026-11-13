# Implementation Plan: Deck header

**Branch**: `worktree-042-deck-header` | **Date**: 2026-11-09 | **Spec**: [spec.md](./spec.md) | **Roadmap**: `PLAN.md` § Phase 6+

## Summary

Replace the deck page's three top rows (header, search box, chip row) with one breadcrumb header: deck › view, each with a switcher menu, and a Search button that opens a bottom sheet with the box and recent searches (D380–D382). Web only: no API, route, migration or dependency.

## Starting point

- main @ `1df7d25` (042 events, #124).
- Relevant code: `routes/d.$slug.tsx` (deck layout), `app/AppHeader.tsx`, `app/list-tools.ts`, `ui/ChipRow.tsx`, `search/SearchBox.tsx`, `search/RecentSearches.tsx`, `ui/MoreMenu.tsx` (D213), `ui/sheet/Sheet.tsx`, `items/first-visible.ts`.

## Technical Context

**Language/Version**: TypeScript strict, React, TanStack Router/Query, plain CSS
**Testing**: Vitest + Testing Library; Playwright
**E2E tier**: smoke — the category and search journeys in `smoke/web.spec.ts` and `smoke/editor.spec.ts` change how they reach a view and run a search; the rest (switchers, sheet edge cases, `/`, phone width) is `@full` in `full/deck-chrome.spec.ts`.
**Constraints**: 150 KB gzip budget (no new dependency); actions only via `ui/buttons`, icons via `ui/icons` (new `caret-down`).

## Constitution check

- Web only; no person-affecting decisions, so no new decision events (VIII: none).
- Tests: unit for every new module and the `MoreMenu` additions; e2e at smoke and full (V).

## Accountability

No decisions about people or content are made; nothing to log.

## Structure

```
apps/web/src/deck-header/   DeckHeader, SearchSheet, switcher-actions, use-search-shortcut, deck-header.css (+ tests)
apps/web/src/ui/deck-views.ts   view list + labels (from ChipRow)
apps/web/src/ui/MoreMenu.tsx    checked → menuitemradio, align
e2e/tests/smoke/helpers/deck-header.ts
```
