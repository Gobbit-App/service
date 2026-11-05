# Tasks: 040 Browse rework

**Input**: [plan.md](./plan.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/browse-ui.md](./contracts/browse-ui.md)

**Tests**: required (constitution V). Unit tests sit next to each module. E2E: `[e2e:smoke]`
rewrites `e2e/tests/smoke/browse.spec.ts`, and `[e2e:full]` adds `e2e/tests/full/browse-rework.spec.ts`.

Format: `[ID] [P?] [Story] Description`. `[P]` = a different file with no dependency on unfinished tasks.

## Phase 1: Setup

- [x] T001 Add `linkify-it`, `unist-util-visit` (+ `@types/linkify-it`, `@types/mdast`) to `apps/web/package.json`
- [x] T002 Fix the D-range in `spec.md` and `PLAN.md` (D325–D340)

## Phase 2: Foundational (blocks every story)

- [x] T003 [P] Add the `expand` icon to `apps/web/src/ui/icons/icon-paths.ts` (+ test list)
- [x] T004 [P] `use-current-card.ts`: configurable attribute, coverage measured against the root (tall pages), only direct children, `force(id)`; tests in `use-current-card.test.tsx`
- [x] T005 [P] `motion.ts`: axis-aware `scrollToPage` that scrolls only the track (`scrollTo`, no `scrollIntoView`); tests
- [x] T006 [P] `browse-layer.ts`: `browseLayerFromState`, `withLayer`; tests in `browse-layer.test.ts`
- [x] T007 [P] `Card.tsx`: `meta` prop hides the footer meta row; test in `Card.test.tsx`

## Phase 3: US1 Vertical cards, content only (P1) 🎯 MVP

- [x] T008 [US1] `BrowseStack.tsx`: y track, `active` flag gating keys/return/notice/live region/prefetch, reports the current item
- [x] T009 [US1] `BrowsePage.tsx`: card surface only (`meta={false}`, `actions={false}`), no sections, side edge strips
- [x] T010 [US1] `BrowseDock.tsx`: Previous (`arrow-up`) · actions · Full view (`expand`) · Next (`arrow-down`); update `BrowseDock.test.tsx`
- [x] T011 [US1] `browse.css`: y snap track, card surface, safe centring, smaller bars, reduced-motion
- [x] T012 [US1] `browse-keys.ts`: ArrowDown/PageDown next, ArrowUp/PageUp prev, ArrowRight/Left category, `f`, Escape; update tests
- [x] T013 [US1] Tall cards: key moves scroll 85 % first (`BrowseStack`)

## Phase 4: US2 Sideways categories (P1)

- [x] T014 [US2] `CategoryTrack.tsx`: x snap track of cycle entries, current ±1 mounted, inactive pages `inert`
- [x] T015 [US2] `BrowseScreen.tsx`: cycle, settle → `onChange({c})`, `visits`, `jumpTo`, ends watcher (pull + keys)
- [x] T016 [P] [US2] `category-counts.ts`: `knownCategoryTotal`; tests
- [x] T017 [US2] `CategoryBanner.tsx`: peek banner, end banner, live announcement; tests
- [x] T018 [US2] `TopBar.tsx`: category name button with chevron replaces the rail; delete `CategoryRail.tsx`; update `TopBar.test.tsx`
- [x] T019 [US2] End page "Continue to …" jumps through `jumpTo`; update `EndPage` tests if copy changes

## Phase 5: US3 Category list (P2)

- [x] T020 [US3] `CategoryList.tsx`: panel, scrim, Close, rows with counts, `aria-current`, roving focus; tests
- [x] T021 [US3] Layer wiring in `BrowseScreen` + route: push `browseLayer: 'categories'`, close with `history.back()`, pick → close then `jumpTo`

## Phase 6: US4 Full view (P2)

- [x] T022 [P] [US4] `use-long-press.ts`: 500 ms, 10 px slop, excluded targets, contextmenu; tests
- [x] T023 [US4] `FullView.tsx`: sheet + tail scroller, Close, card, CardDetails (category buttons), CardSource, swipe-out observer; tests
- [x] T024 [US4] `sections/CardDetails.tsx`: optional `onCategory` renders category buttons; tests
- [x] T025 [US4] Wire full view: dock, long press, `f`; layer `full`; card category tap → close then `jumpTo(slug, id)`

## Phase 7: US5 Detected text (P2)

- [x] T026 [P] [US5] `detect/segment.ts`: linkify-it + number rules; table test `segment.test.ts`
- [x] T027 [P] [US5] `detect/remark-detect.ts`: plugin skipping links; tests
- [x] T028 [US5] `detect/Detected.tsx` + `detect/detection.tsx` (provider: remark plugin, `span` renderer, `renderText`); copy toast; tests
- [x] T029 [US5] `cards/text-detection.ts` context; `TextCard` / `TableCard` read it; provider wraps Browse and full view only

## Phase 8: US6 Hint (P3)

- [x] T030 [US6] `hint-store.ts` key `v3`, `FirstRunHint` tips; update tests

## Phase 9: E2E and polish

- [x] T031 [e2e:smoke] Rewrite `e2e/tests/smoke/browse.spec.ts` (vertical swipe, sideways + banner, list jump, full view open/close, card category tap, back)
- [x] T032 [e2e:full] `e2e/tests/full/browse-rework.spec.ts` (detected text, keys, ends banner, edge strip, swipe-out, list dismissals)
- [x] T033 Update `BrowseScreen.test.tsx` for the new model
- [x] T034 Docs: `docs/design/browse-mode.md` (040 section + Deviations), `docs/adr.md` ADR-072, `docs/architecture.md` line + ADR row, `implementation-notes.md`, `PLAN.md` tick
- [x] T035 `pnpm lint && pnpm format:check && pnpm typecheck && pnpm test:unit && pnpm build:web && pnpm budget`

## Dependencies

Phase 2 → US1 → US2 → (US3, US4 in either order) → US5 (needs the full view to wrap) → US6 → Phase 9.
