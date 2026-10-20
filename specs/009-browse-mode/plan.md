# Implementation Plan: Browse mode (swipe navigation)

**Branch**: `009-browse-mode` | **Date**: 2026-10-20 | **Spec**: [spec.md](./spec.md) | **Roadmap**: `PLAN.md` § Phase 6 (demos 3–5)

**Input**: Feature specification from `/specs/009-browse-mode/spec.md`

This plan follows the project override of the core template (`.specify/templates/overrides/`). The repository is public (constitution, Constraints).

## Summary

Add a full-screen Browse route, `/d/$slug/browse`, that shows one card per screen:

- **Vertical paging**: native CSS scroll-snap, with an `IntersectionObserver` tracking the current card.
- **Header and footer swipes**: horizontal swipes in the top and bottom zones (25 %, at least 88 px) change category and pane. They are detected with `@use-gesture/react`, the one new dependency, which loads only in the Browse chunk.
- **System gestures**: a 24 px edge guard, `touch-action: pan-y` and `overscroll-behavior` keep platform back gestures and pull-to-refresh behaviour intact.
- **Address and data**: the address holds `c`, `i` and `pane` and is updated with `replace`. Browse reads the list's infinite query, so the cache and offline behaviour are shared, and it prefetches the next page at n−3.
- **Return to the list**: closing comes back to the list at the current card through a one-shot return entry.
- **Tap and keyboard**: every gesture has a tap and keyboard equivalent, and a first-run overlay explains the zones.
- **Performance**: only the current card ±1 is mounted, images use width buckets and `fetchpriority`, and animations use transform and opacity only.

No API, schema or migration changes. Reasoning is in [research.md](./research.md).

## Starting point

- **main @ `10b0e2a`**:
  - Latest migration: `0010_mcp_readiness`.
  - Phases 0–5 are deployed (see [`specs/005-phases-0-5`](../005-phases-0-5/README.md)).
  - ADR-049 is the latest ADR (spec-kit).
- **Depends on [`006-card-lifecycle`](../006-card-lifecycle/spec.md)**: the deck-relative link helper `deckHref` (D143). It is used for the Browse button, the close target and card-page links. Archived cards stay out of the list query.
- **Depends on [`007-card-editor`](../007-card-editor/spec.md)**: `EntityChips` moves from `apps/web/src/review/` to `apps/web/src/cards/`. It is used by the Details pane.
- **Sibling [`008-card-media`](../008-card-media/spec.md)**: uploaded image cards render through the existing `cards/ImageCard`. Browse adds `sizes`/`priority` props only; it does not change how uploads are stored.
- **Relevant code today**:
  - **Routing**: `routes/d.$slug.tsx` (deck layout chrome); `app/router.ts` (D65 scroll restoration keyed by pathname, `defaultPreload: 'intent'`).
  - **Lists**: `items/ItemList.tsx` (infinite list, sentinel `IntersectionObserver` with rootMargin 600px); `api/queries.ts` `itemsQuery` and `api/query-keys.ts` `ItemFilter`.
  - **Chips**: `ui/chip-order.ts` (`orderChips`, `chipHref`).
  - **Cards**: `cards/Card.tsx`, `cards/ImageCard.tsx`, `cards/cloudinary.ts` (`IMAGE_WIDTHS`, `cloudinarySrcSet`).
  - **Helpers**: `lib/card-age.ts`, `lib/relative-time.ts`, `lib/last-deck.ts` (localStorage pattern).
  - **Build**: `vite.config.ts` (`autoCodeSplitting: true`); `scripts/bundle-budget.ts` (150 KB gzip).

## Technical Context

**Language/Version**: TypeScript (strict, ESM, no build step) on Node ≥ 22

**Primary Dependencies**: React 19 + Vite + TanStack Router/Query (web), plus **`@use-gesture/react`** (new; justified in research.md § D139)

**Storage**: none on the server. Client only: URL search params, `localStorage` (hint flag) and `sessionStorage` (return entry). See data-model.md

**Testing**:
- Vitest + jsdom + testing-library (unit/component).
- Playwright `web-smoke` project (Pixel 7, touch) for `@smoke`.
- A manual DevTools performance trace on a device.

**Target Platform**: PWA on Android Chrome and iOS Safari (both in scope for SC-002)

**Project Type**: pnpm monorepo. Only `apps/web` and `e2e` change

**Performance Goals**: no main-thread task over 50 ms while swiping through 20 image cards on a mid-range Android phone (SC-004); the next card's image is ready on arrival

**Constraints**: web initial bundle ≤ 150 KB gzip, with Browse in its own route chunk; offline for cached categories; plain CSS; `@pb/shared` subpath imports only; same origin

**Scale/Scope**: categories of tens to a few hundred cards (pages of `ITEM_PAGE_SIZE` = 20)

## Constitution Check

| Principle | How this plan complies (or "N/A") |
|-----------|-----------------------------------|
| I. Layered API | N/A: no API change |
| II. One source of truth for contracts | Reuses `Item`/`Category` DTOs and `itemsQuery`. The Browse search-param schema is local to the route (UI state, not an API contract). No `api:openapi` |
| III. Invariants live in the database | N/A: no schema change. Visibility comes from the existing list endpoint |
| IV. Private by default | Browse reads only what the list endpoint returns (`visibleCategoriesWhere()`, published only). A deep link to a card outside that set gets a generic notice that reveals nothing (spec edge case) |
| V. Tests at the right tier | Unit tests for pure helpers (params, category cycle, edge guard, swipe classifier, return entry, hint store, source label); component tests for panes and controls; e2e `browse.spec.ts` for the journeys. Traceability table below |
| VI. Lean, offline-first web | A new file route is auto code-split. `@use-gesture/react` is imported only under `browse/`, and `pnpm budget` gates the initial chunk. Data comes from the persisted query cache, never the service worker. Plain CSS in `styles.css` |
| VII. Simple, optional, deployable | One small dependency, justified in research.md. No env vars, no deploy change |

## Decisions this plan pins down

| ID | Decision | ADR? |
|----|----------|------|
| D139 | Vertical paging: native scroll-snap + `IntersectionObserver`. Header/footer horizontal swipes: `@use-gesture/react` `useDrag` only. No embla, no framer-motion | yes → ADR-052 |
| D140 | Zones are the top and bottom 25 % (at least 88 px), inside each snap page. 24 px edge guard; `touch-action: pan-y` on the bands; `overscroll-behavior-y: contain` on the snap container only | yes → ADR-052 |
| D141 | `/d/$slug/browse?c=&i=&pane=`, updated with replace. Data is the list's `itemsQuery`, prefetched at n−3. Panes are content/details/source; history waits for Phase 8. Close returns to the list at the current card (return entry + `history.back()`) | no (research.md) |
| D142 | First-run zones overlay (`gobbit:browse-hint:v1`). Visible buttons, chevrons, tabs and keys for every gesture; accessible names; reduced motion | no |
| D144 | Only the current card ±1 is mounted. Reuse `cards/cloudinary.ts` width buckets with `sizes`/`priority` on `ImageCard` (`fetchpriority="high"` for the current card). Transform/opacity-only animation | yes → ADR-052 |

## Project Structure

### Documentation (this feature)

```text
specs/009-browse-mode/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/browse-ui.md
├── checklists/requirements.md
├── tasks.md
└── implementation-notes.md   # created during /speckit-implement
```

### Source Code (repository root)

```text
apps/web/
├── package.json                      # + @use-gesture/react
└── src/
    ├── routes/
    │   ├── d.$slug.browse.tsx        # NEW file route: validateSearch → BrowseScreen
    │   └── d.$slug.tsx               # hide deck chrome on /browse; add "Browse" header button (via deckHref)
    ├── browse/                       # NEW feature folder (only reachable from the browse route)
    │   ├── browse-params.ts          # search schema (c, i, pane) + defaults/fallbacks
    │   ├── category-cycle.ts         # All + orderChips(categories); next/prev without wrap; c ↔ ItemFilter
    │   ├── edge-guard.ts             # isEdgeStart(x, viewportWidth, 24)
    │   ├── swipe.ts                  # classify drag → 'next' | 'prev' | null (40 px / 0.3 px·ms⁻¹)
    │   ├── use-zone-swipe.ts         # useDrag wrapper (axis x, filterTaps, edge guard)
    │   ├── use-current-card.ts       # IntersectionObserver over snap pages → current index
    │   ├── use-browse-items.ts       # useInfiniteQuery(itemsQuery) + n−3 prefetch + deep-link seek (≤5 pages)
    │   ├── browse-return.ts          # sessionStorage gobbit:browse-return read/write/clear
    │   ├── hint-store.ts             # localStorage gobbit:browse-hint:v1 (last-deck.ts pattern)
    │   ├── source-kind.ts            # sourceKind → label
    │   ├── BrowseScreen.tsx          # snap container, keys, close, notice
    │   ├── BrowsePage.tsx            # one snap page: HeaderBand + pane + FooterBand (bands active on current only)
    │   ├── HeaderBand.tsx            # category name (menu), ‹ › chevrons, "n of N"
    │   ├── FooterBand.tsx            # pane tablist, dots, ‹ ›
    │   ├── panes/{ContentPane,DetailsPane,SourcePane}.tsx
    │   ├── FirstRunHint.tsx
    │   └── *.test.ts(x)              # next to each module
    ├── items/ItemList.tsx            # consume browse return entry → scroll card into view
    ├── cards/ImageCard.tsx           # + optional sizes / priority props
    ├── cards/CardBody.tsx, Card.tsx  # pass image props through
    └── styles.css                    # .browse* rules; extend prefers-reduced-motion block
e2e/tests/smoke/browse.spec.ts        # NEW @smoke (web-smoke, Pixel 7)
docs/architecture.md                  # Browse section + ADR-052 (close-out)
```

**Structure Decision**: web-only. A `browse/` feature folder keeps the gesture dependency out of the shared modules, so the initial chunk is unchanged. Existing modules get only small, additive changes: layout chrome check, return-entry consumer, image props.

## Invariant → test traceability

| Invariant / rule (spec FR or D-number) | Enforced in (DB / service / route / UI) | Test (file, tier) |
|----------------------------------------|------------------------------------------|-------------------|
| FR-002 one card per swipe/control, settles whole | UI: snap CSS + `use-current-card` | `use-current-card.test.ts` (unit); `browse.spec.ts` "next/prev card" (e2e) |
| FR-003 same cards as the list | UI: `use-browse-items` reuses `itemsQuery(slug, filter)` | `use-browse-items.test.ts` (unit, same query key); `browse.spec.ts` archived card absent (e2e) |
| FR-004 address restores c/i/pane; no entry per card | route `validateSearch`, `navigate({replace:true})` | `browse-params.test.ts` (unit); `browse.spec.ts` reload + history length (e2e) |
| FR-005 close/back returns to list at current card | `browse-return.ts` + `ItemList` | `browse-return.test.ts`, `ItemList.test.tsx` (unit); `browse.spec.ts` close and back (e2e) |
| FR-006 header swipe = next/prev category, no wrap | `category-cycle.ts`, `use-zone-swipe` | `category-cycle.test.ts`, `swipe.test.ts` (unit); `browse.spec.ts` header swipe (e2e) |
| FR-007 footer swipe = pane, pane kept across cards | `FooterBand`, search `pane` | `FooterBand.test.tsx` (unit); `browse.spec.ts` footer swipe (e2e) |
| FR-008 / D140 24 px edge guard | `edge-guard.ts` | `edge-guard.test.ts` (unit); `browse.spec.ts` edge swipe ignored (e2e) |
| FR-009 middle horizontal swipe ignored; tall card scrolls first | bands only bind drag; CSS overscroll chaining | `browse.spec.ts` middle swipe (e2e); device check in quickstart |
| FR-010 details/source contents + empty state | `DetailsPane`, `SourcePane`, `source-kind.ts` | `DetailsPane.test.tsx`, `SourcePane.test.tsx`, `source-kind.test.ts` (unit) |
| FR-011 tap + key equivalents with names | `HeaderBand`, `FooterBand`, `BrowseScreen` keys | `BrowseScreen.test.tsx` (unit, keys); `browse.spec.ts` taps-only and keyboard-only via `getByRole` (e2e) |
| FR-012 first-run overlay once per device | `hint-store.ts`, `FirstRunHint` | `hint-store.test.ts` (unit); `browse.spec.ts` overlay then not (e2e) |
| FR-013 reduced motion | CSS media query; `scrollIntoView` behavior | `BrowseScreen.test.tsx` (unit, behavior `auto` under matchMedia) |
| FR-014 prefetch before end; offline cached | `use-browse-items` n−3 | `use-browse-items.test.ts` (unit); `browse.spec.ts` offline cached category (e2e, `context.setOffline`) |
| FR-015 / SC-006 initial ≤ 150 KB; Browse lazy | route split, `browse/` isolation | `pnpm budget` (CI gate) + manifest check that `@use-gesture` is not in an initial chunk |
| FR-016 card actions in Content pane | reuses `cards/Card` | `browse.spec.ts` favorite in Browse (e2e) |
| D144 ±1 mounting; current image eager + high priority | `BrowsePage`, `ImageCard` props | `BrowseScreen.test.tsx` (unit, mounted count); `ImageCard.test.tsx` (unit, attributes); trace (manual, SC-004) |
| Deep link to unavailable card → generic notice | `use-browse-items` seek cap | `use-browse-items.test.ts` (unit); `browse.spec.ts` (e2e) |

## Rollout

- **Migrations**: none.
- **Env / config**: none.
- **API client**: no `pnpm api:openapi`.
- **Dependencies**: `pnpm --filter @pb/web add @use-gesture/react`; the lockfile changes.
- **Deploy order / flags**: the normal CI → Dokploy flow. Browse is reachable as soon as it is deployed. No flag, since nothing changes for members who don't open it.

## Risks

| Risk | Likelihood / impact | Mitigation |
|------|---------------------|------------|
| Nested vertical scroll (tall card) inside a snap container feels sticky or skips cards | M / M | Inner scroller `overscroll-behavior: auto` chains at the edge; `scroll-snap-stop: always`; device check in quickstart |
| iOS Safari scroll-snap quirks (dynamic toolbar, `100vh`) | M / M | `100dvh` pages; re-snap to the current id on resize/rotation; test on a current iPhone |
| `useDrag` claims pointers that the system back gesture or vertical scroll needs | M / H | `touch-action: pan-y` on the bands; edge guard before claiming; `axis: 'x'`; SC-002 10/10 check |
| `IntersectionObserver` flips the current index mid-scroll (jitter, many URL replaces) | L / M | Threshold 0.6; commit on settle (debounced 300 ms) for the URL and return entry |
| Gesture dependency leaks into the initial chunk | L / H | Import only under `browse/`; `pnpm budget` in CI; manifest check task |
| Synthetic swipes are flaky in Playwright | M / L | Pointer-event helper on the `web-smoke` touch project; tap/keyboard paths cover the same outcomes |

## Settle before starting

- [ ] Q5 (open in the roadmap plan): Browse opens from a header button only; no long-press "browse from here". This is the spec's assumption, so confirm or change it before US1.
- [ ] `006-card-lifecycle` merged (`deckHref`, archived excluded from list queries) and `007-card-editor` merged (`EntityChips` in `cards/`).
- [ ] A mid-range Android phone with USB debugging for the SC-004 trace, plus a current iPhone for SC-002.

## Complexity Tracking

No constitution violations.
