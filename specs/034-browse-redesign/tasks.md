---
description: "Task list for 034-browse-redesign"
---

# Tasks: Browse redesign

**Input**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md) (D244–D251), [contracts/browse-ui.md](./contracts/browse-ui.md)

**Tests**: REQUIRED (constitution V). `[unit]` next to code; `[e2e:smoke]` in `e2e/tests/smoke/browse.spec.ts` (E2E tier: smoke, Browse is a critical reading journey).

## Phase 1: Remove the zone model

- [x] T001 Delete `HeaderBand`, `FooterBand`, `PositionMenu`, `CategoryMenu`, `swipe.ts`, `use-zone-swipe.ts`, `edge-guard.ts`, `panes/ContentPane`, `panes/PaneFrame` and their tests
- [x] T002 Remove `@use-gesture/react` from `apps/web/package.json`; the lazy-only budget check keeps `papaparse` only (`scripts/initial-chunks.ts`, `scripts/bundle-budget.ts`) [unit]
- [x] T003 `browse-params.ts`: drop `pane` (ignored when present) [unit]

## Phase 2: Track and pages (US1, FR-002–FR-004)

- [x] T004 `BrowseStack`: horizontal snap track, ±1 mounted, current page via `use-current-card`, focus to the page heading [unit]
- [x] T005 `BrowsePage`: the card (`actions={false}`) then `sections/CardDetails` and `sections/CardSource` (moved from `panes/`, `SectionFrame`) [unit]
- [x] T006 `motion.ts`: `scrollIntoView({ inline: 'start', block: 'nearest' })`, `'auto'` under reduced motion [unit]
- [x] T007 `browse.css`: full-page layout, translucent top bar, floating dock, scroll-driven depth inside `@supports`, reduced-motion block

## Phase 3: Chrome (US2, FR-005–FR-007)

- [x] T008 [P] `TopBar` + `CategoryRail`: close, chips (`aria-current`, centred), counter, progress [unit]
- [x] T009 [P] `BrowseDock`: Previous · `CardActionBar` · Next [unit]
- [x] T010 [P] `EndPage`: "Continue to <next>" / "Back to the list", inert when not current [unit]
- [x] T011 `BrowseScreen`: wires the bar, track, dock, end page and states [unit]

## Phase 4: Keys and hint (US3, FR-008–FR-010)

- [x] T012 `browse-keys.ts`: ←/→ and PageUp/PageDown move cards, ↑/↓ native, Escape closes [unit]
- [x] T013 `FirstRunHint` bottom sheet with three tips; key `gobbit:browse-hint:v2` (`hint-store.ts`) [unit]

## Phase 5: E2E and docs

- [x] T014 Rewrite `e2e/tests/smoke/browse.spec.ts` and `helpers/swipe.ts` (horizontal CDP swipe, vertical drag) [e2e:smoke]
- [x] T015 Docs: `docs/design/browse-mode.md`, ADR-065, `docs/architecture.md` rows, `README.md`, `CLAUDE.md`, `specs/README.md`, `PLAN.md`
