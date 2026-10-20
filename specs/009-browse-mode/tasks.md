---

description: "Task list for 009-browse-mode"
---

# Tasks: Browse mode (swipe navigation)

**Input**: Design documents from `/specs/009-browse-mode/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/browse-ui.md. `006-card-lifecycle` and `007-card-editor` must be merged first (plan § Settle before starting).

**Tests**: REQUIRED (constitution V). Each traceability row in plan.md maps to a test task below.

## Format: `[ID] [P?] [Story] [Tier?] Description`

- **Tiers used**:
  - `[unit]`: Vitest/jsdom `*.test.ts(x)` next to the code.
  - `[e2e]`: Playwright `@smoke` in `e2e/tests/smoke/browse.spec.ts` (`web-smoke`, Pixel 7).
- No `[int]`/`[search]`, because nothing changes in the API or DB.
- All web paths are relative to `apps/web/src/`.

---

## Phase 1: Foundational (Blocking Prerequisites)

**Purpose**: dependency, route shell, pure helpers and test plumbing shared by every story

- [X] T001 Add the dependency: `pnpm --filter @pb/web add @use-gesture/react`. Record the gzip size from `pnpm build:web` in implementation-notes.md
- [X] T002 [P] [unit] `browse/browse-params.test.ts`: defaults, invalid `pane` → `content`, `c` ↔ `ItemFilter` mapping (data-model §1)
- [X] T003 [P] [unit] `browse/category-cycle.test.ts`: All first, then `orderChips` order; Favorites/Archived excluded; next/prev with no wrap; unknown slug → `all`
- [X] T004 [P] [unit] `browse/edge-guard.test.ts`: 0–23 px and the last 24 px are guarded; 24 px and inward are not; narrow viewports
- [X] T005 [P] [unit] `browse/swipe.test.ts`: classify by 40 px / 0.3 px·ms⁻¹ and dominant axis; leftward = next whatever `dir`; taps → null
- [X] T006 Implement `browse/browse-params.ts`, `browse/category-cycle.ts`, `browse/edge-guard.ts`, `browse/swipe.ts` until T002–T005 pass
- [X] T007 File route `routes/d.$slug.browse.tsx` (`validateSearch` from `browse-params`) rendering a placeholder `browse/BrowseScreen.tsx`. In `routes/d.$slug.tsx`, hide the header/search/chips/actions when `pathname.endsWith('/browse')`
- [X] T008 [P] e2e helper `e2e/tests/smoke/helpers/swipe.ts`: synthesize a touch/pointer drag (start x/y, dx, dy, duration) on the touch project. Create the `helpers/` folder if missing, or follow the existing fixture location
- [X] T009 [P] Manifest check in `apps/web/scripts/initial-chunks.ts` (or a test beside it) that fails if any initial chunk includes `@use-gesture`. Wire it into `pnpm budget`

**Checkpoint**: `/d/<slug>/browse` renders full-screen, the helpers are tested, and the budget is green

---

## Phase 2: User Story 1 - Swipe through a category's cards (Priority: P1) 🎯 MVP

**Goal**: one card per screen, vertical paging, address restore, prefetch and return to the list (FR-001–005, FR-014, FR-016)

**Independent Test**: open Browse on 10 cards, page through them all and close. The list shows the current card.

### Tests for User Story 1

> Write these first and make sure they FAIL before implementation.

- [X] T010 [P] [US1] [unit] `browse/use-current-card.test.ts`: the IO callback at threshold 0.6 sets the current id; the id survives the list reordering/refetching
- [X] T011 [P] [US1] [unit] `browse/use-browse-items.test.ts`:
  - same query key as `itemsQuery(slug, filter)`;
  - `fetchNextPage` called at `loaded − 3`;
  - deep-link seek stops after 5 pages and returns `notFound`.
- [X] T012 [P] [US1] [unit] `browse/browse-return.test.ts`: write/read/clear, a deck/filter mismatch → null, malformed JSON and storage errors → null
- [X] T013 [P] [US1] [unit] `items/ItemList.test.tsx`: with a matching return entry it scrolls that card's article into view and clears the entry; with no entry or a mismatch, nothing happens
- [X] T014 [P] [US1] [e2e] `browse.spec.ts` "pages a category". Seed a `smoke-<id>` deck with 25 cards in one category plus an archived card, then:
  - open from the Browse button;
  - next/prev by button and by swipe;
  - the archived card never appears;
  - reload restores `i`;
  - `history.length` is unchanged by paging;
  - close and back both return to the list with the current card visible;
  - favorite works in Browse;
  - an unknown `i` shows the notice.
- [X] T015 [P] [US1] [e2e] `browse.spec.ts` "offline cached category": after one visit, `context.setOffline(true)` → Browse renders the cards; an uncached category → offline copy

### Implementation for User Story 1

- [X] T016 [US1] `browse/use-current-card.ts` (one IO, root = snap container, debounced settle of 300 ms)
- [X] T017 [US1] `browse/use-browse-items.ts` (`useInfiniteQuery(itemsQuery(...))`, n−3 prefetch, ≤ 5-page seek)
- [X] T018 [US1] `browse/browse-return.ts`. In `items/ItemList.tsx`, consume it on mount (data-model §3)
- [X] T019 [US1] `browse/BrowseScreen.tsx` + `browse/BrowsePage.tsx`:
  - snap container (`scroll-snap-type: y mandatory`, `overscroll-behavior-y: contain`);
  - `100dvh` pages, ±1 mounted;
  - `navigate({ replace: true })` on settle;
  - re-snap to the current id on resize;
  - close (`history.back()` when `state.fromList`, else the list href via `deckHref`);
  - not-found notice;
  - empty/loading/offline states reuse `emptyListCopy` and the list's offline copy.
- [X] T020 [US1] ContentPane `browse/panes/ContentPane.tsx` wrapping `cards/Card`. ↑/↓ buttons. PageUp/PageDown/ArrowUp/ArrowDown keys (skipped while focus is in a scrollable card body)
- [X] T021 [US1] Browse entry button in the deck header (`routes/d.$slug.tsx`) on the All and category list views: push with `state.fromList`, `i` = first card visible
- [X] T022 [US1] `styles.css`: `.browse`, `.browse-page`, `.browse-page__content` (inner scroll `overscroll-behavior: auto`)

**Checkpoint**: US1 works on its own (paging, address, return, offline)

---

## Phase 3: User Story 2 - Change category from the header (Priority: P1)

**Goal**: a header zone swipe or chevrons/keys change category in chip-row order (FR-006, FR-008)

**Independent Test**: in Food, swipe the header left → the first card of the next category

### Tests for User Story 2

- [X] T023 [P] [US2] [unit] `browse/HeaderBand.test.tsx`: chevron names "Next category: <name>"; disabled at the ends; the category-name menu lists All + categories; "n of N" vs "n" while more pages exist
- [X] T024 [P] [US2] [unit] `browse/use-zone-swipe.test.ts`: drag handlers fire next/prev; edge-guarded starts are ignored; taps are filtered
- [X] T025 [P] [US2] [e2e] `browse.spec.ts` "header changes category":
  - a header swipe moves to the next category at card 1, with `c` updated and `i` cleared;
  - a swipe at the first category does nothing;
  - a middle-zone horizontal swipe does nothing;
  - a header swipe starting at x = 10 px does nothing.

### Implementation for User Story 2

- [X] T026 [US2] `browse/use-zone-swipe.ts`: `useDrag` with `axis: 'x'` and `filterTaps`; the edge guard runs before claiming; `swipe.ts` classification
- [X] T027 [US2] `browse/HeaderBand.tsx`: name menu, ‹ › chevrons, position live region; ArrowLeft/ArrowRight in `BrowseScreen`. CSS `max(25dvh, 88px)` and `touch-action: pan-y`

**Checkpoint**: US1 + US2 cover demo 3 except the footer

---

## Phase 4: User Story 3 - Details and source from the footer (Priority: P2)

**Goal**: a footer swipe or tabs switch Content/Details/Source, and the pane persists across cards (FR-007, FR-010)

**Independent Test**: on a card with entities, swipe the footer left → the Details pane lists them

### Tests for User Story 3

- [X] T028 [P] [US3] [unit] `browse/source-kind.test.ts`: a label for every `sourceKinds` value
- [X] T029 [P] [US3] [unit] `browse/panes/DetailsPane.test.tsx`: entities grouped by kind (via `cards/EntityChips`), category names, type, empty-state copy
- [X] T030 [P] [US3] [unit] `browse/panes/SourcePane.test.tsx`: kind label, `sourceUrl` host link with `rel`, added/edited from `cardAge`, "Published …" only when `verifiedAt` is set
- [X] T031 [P] [US3] [unit] `browse/FooterBand.test.tsx`: a `tablist` named "Card view"; arrow keys move between tabs; the selection follows the `pane` param
- [X] T032 [P] [US3] [e2e] `browse.spec.ts` "footer panes": a footer swipe → Details; next card → still Details; reload keeps `pane`

### Implementation for User Story 3

- [X] T033 [US3] `browse/source-kind.ts`, `browse/panes/DetailsPane.tsx`, `browse/panes/SourcePane.tsx`
- [X] T034 [US3] `browse/FooterBand.tsx` (tabs, dots, ‹ ›, zone swipe) + CSS

**Checkpoint**: demo 3 can be run end to end

---

## Phase 5: User Story 4 - Tap/keyboard equivalents and first-run overlay (Priority: P2)

**Goal**: everything is reachable without gestures; a one-time zones overlay; reduced motion (FR-011–013)

**Independent Test**: do the US1–US3 actions with taps only, then with the keyboard only

### Tests for User Story 4

- [X] T035 [P] [US4] [unit] `browse/hint-store.test.ts`: absent → show; dismissed → hide; storage throws → show, never throws
- [X] T036 [P] [US4] [unit] `browse/BrowseScreen.test.tsx`:
  - the key map from the contract §3;
  - Escape closes;
  - under `prefers-reduced-motion` (stub `matchMedia`), `scrollIntoView` is called with `behavior: 'auto'`;
  - at most 3 pages render content.
- [X] T037 [P] [US4] [e2e] `browse.spec.ts` "no gestures needed":
  - fresh context → the "How to browse" dialog → dismiss;
  - reopen → no dialog;
  - card, category and pane via `getByRole` names only;
  - then the same via the keyboard only.

### Implementation for User Story 4

- [X] T038 [US4] `browse/hint-store.ts` (`gobbit:browse-hint:v1`, `last-deck.ts` pattern) + `browse/FirstRunHint.tsx` (dialog labelling the three zones)
- [X] T039 [US4] Accessible names per contract §3 on all controls; focus moves to the card title on change; `styles.css` extends the existing `prefers-reduced-motion` block for `.browse*`

**Checkpoint**: demo 4 can be run

---

## Phase 6: User Story 5 - Smooth with image cards (Priority: P3)

**Goal**: ±1 mounting, prioritized and right-sized images, compositor-only animation (D144, SC-004)

**Independent Test**: a device trace while swiping 20 image cards shows no task over 50 ms

### Tests for User Story 5

- [X] T040 [P] [US5] [unit] `cards/ImageCard.test.tsx`: the defaults are unchanged (`lazy`, `sizes="100vw"`); `priority` → `loading="eager"` + `fetchpriority="high"`; a custom `sizes` is passed through; `srcset` still from `cloudinarySrcSet`

### Implementation for User Story 5

- [X] T041 [US5] Optional `sizes`/`priority` props on `cards/ImageCard.tsx`, threaded through `cards/CardBody.tsx` and `cards/Card.tsx`. `BrowsePage` passes the measured width and `priority` for the current card
- [X] T042 [US5] Audit the `.browse*` CSS for transform/opacity-only transitions; `will-change` only on the active band transition
- [ ] T043 [US5] Run the quickstart §3 trace on a mid-range Android phone; record the device and the longest task in implementation-notes.md; fix any task over 50 ms — **Open**: needs a physical mid-range Android phone and a deployed production build (see implementation-notes.md)

**Checkpoint**: demo 5 can be run

---

## Phase 7: Close-out

- [X] T044 `pnpm lint && pnpm format:check && pnpm typecheck && pnpm test:unit && pnpm build:web && pnpm budget` (with the T009 manifest check), plus `pnpm test:e2e` for `browse.spec.ts`
- [X] T045 [P] `docs/architecture.md`:
  - a Browse section (route, zones, data reuse, return entry);
  - **ADR-052 — Browse: native scroll-snap + use-gesture** (D139/D140/D144; take the next free number if 006/008 merged in a different order);
  - "Deviations from the plan" from implementation-notes.md, including the plan-vs-code resolutions in research.md.
- [X] T046 [P] `README.md`: the Browse route in the web routes list; the new web dependency, if the README lists them
- [X] T047 [P] `CLAUDE.md`: a Web ground rule saying that gestures live only in `browse/` (`@use-gesture/react` stays out of initial chunks)
- [ ] T048 `PLAN.md` § Phase 6: link `specs/009-browse-mode`; tick demos 3–5 only after running them on the deployed instance — **Partly done**: the spec links and bundle note are in PLAN.md; demos 3–5 stay unticked until they are run on the deployed instance
- [ ] T049 Run quickstart.md §1 and §2 (SC-002 10/10 on iOS and Android; demo 4 with a member who hasn't seen the screen) — **Open**: needs real iOS and Android devices, the deployed instance and a member who has not seen the screen
- [X] T050 `/speckit-converge` until it reports Converged

---

## Dependencies & Execution Order

- **Before Phase 1**: 006 and 007 merged.
- **Phase 1** blocks all stories.
- **Stories**:
  - US1 → US2 (the header band lives on `BrowsePage`).
  - US3 and US4 depend on US1 and can run in parallel after US2.
  - US5 depends on US1.
- **Close-out** comes last. T043/T049 need a deployed build and real devices.

### Within Each User Story

- Tests are written and FAILING before implementation.
- Pure helpers → hooks → components → CSS → e2e green.

## Notes

- [P] = different files and no dependencies. `browse.spec.ts` is a single file, so add its tests in sequence even when they are marked [P] against other files.
- Log decisions and deviations in implementation-notes.md as you go.
- Use conventional commits, e.g. `feat(web): browse mode paging`.

---

## Phase 8: Convergence

- [X] T051 Link the card title in Browse's Content pane to the card page (`/i/<id>`), so favorite, share and open the card page all work there; cover it in a unit test per FR-016 (partial)
- [X] T052 When the system back action returns from Browse to the list it was opened from after a category change, replace that list with the current category's list and scroll to the current card (return entry carries the list it was opened from); unit tests for the redirect and its guards, plus an e2e step in "header changes category" per FR-005 (partial)
