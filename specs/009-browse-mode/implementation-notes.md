# Implementation notes: 009-browse-mode

Plan: `specs/009-browse-mode/plan.md`, tasks: `tasks.md`. Branch `feat/009-browse-mode`, stacked on `feat/008-card-media` at `ae73654`.

No API, DB, migration or env changes. One new web dependency: `@use-gesture/react` ^10.3.1. It is used only by `browse/use-zone-swipe.ts`.

## Bundle (T001, T009, T044)

| | gzip |
| --- | --- |
| Initial JS, baseline (008 head `ae73654`) | 112.5 KB |
| Initial JS, 009 | 113.7 KB |
| Browse route chunk (`d._slug.browse-*.js`, includes use-gesture) | 13.1 KB |
| `@use-gesture/react` `useDrag` on its own (Vite lib build) | ~8.5 KB |

The initial-chunk growth (+1.2 KB) comes from the Browse button, `items/first-visible.ts`, the zod-free `browse/browse-params.ts` (the deck layout imports it), the return-entry reader in `ItemList`, and the `ImageCard` `sizes`/`priority` props. Gesture code stays in the Browse chunk.

## Decisions not specified by the plan

- **Lenient `browse-params` without zod.**
  - `validateSearch` uses hand-written parsing: an unknown `pane` → `content`, a non-string `c` → `all`, and an empty `i` → absent.
  - The deck layout and `ItemList` import this module, so zod would land in the initial chunk.
- **`isBrowsePath()`** is a regex (`^/d/[^/]+/browse/?$`), not `pathname.endsWith('/browse')` (T007). `endsWith` would hide the deck chrome on a category whose slug is `browse` (`/d/x/c/browse`).
- **Scroll restoration is off for Browse.**
  - `app/router.ts` passes `scrollRestoration: ({ location }) => !isBrowsePath(location.pathname)`.
  - TanStack Router restores every scrolled element under the pathname key. It restored the snap container's `scrollTop` from the previous Browse visit in that tab, and again after every settle `replace`. A deep link then opened on the wrong card.
  - Browse now positions itself only from `i`. The list keeps D65.
  - This was found by the `pages a category` e2e test.
- **Edge guard**: a start at `x < 24` or `x >= width − 24` is guarded, so the last 24 px are exactly 24 px wide.
- **The return entry is written on every current-card change, not debounced** (research D144 said 300 ms).
  - `current` already trails scrolling through the IntersectionObserver (threshold 0.6). The URL replace trails it by the 300 ms settle.
  - One small `sessionStorage` write per page is cheaper than a timer that could be lost on close.
- **`fromList` state carries the list's category** (`listC`).
  - If the category is unchanged, close calls `history.back()`.
  - After a category change in Browse, close *replaces* the Browse entry with the new category's list, so the member lands where they were browsing.
  - A deep link without state *navigates* to the list (push).
  - The system back action after a category change (convergence T052, FR-005): Browse writes an opener record (`gobbit:browse-opener`: deck, the opening list's filter, its history index = Browse's `__TSR_index` − 1). When `ItemList` mounts on exactly that entry and the return entry names another category, it `replace`s itself with that category's list. The index check keeps later visits to the same list (e.g. from a card page) from being redirected. `NavigateContext` gained a `{ replace }` option for this.
  - The opener write is skipped once the pathname is no longer Browse: on popstate the route renders once more with the list's state, which would otherwise clear the record before the list reads it (found by the e2e step).
- **The not-found notice is latched to the card Browse opened on.** "That card isn't available here" stays while the reader is on that first card, including after the settle `replace` writes its `i`. It clears when they move to another card.
- **Browse CSS lives in `browse/browse.css`**, imported by `BrowseScreen`, instead of `styles.css` (T022, T039). It has its own `prefers-reduced-motion` block, so all of it is in the lazy chunk.
- **`browse/browse-keys.ts`** is a pure key → action classifier. It skips inputs, editable elements, modifier keys, and arrows inside a scrollable card body that can still scroll. `use-browse-keys.ts` binds it on `document`.
- **Accessibility**:
  - Only the current page is exposed to assistive tech; the neighbours are `inert` + `aria-hidden`.
  - The header position text ("3 of 25") is `aria-hidden`.
  - One polite live region announces "<title>, card n of N".
  - Focus moves to the card title on change.
- **Loading, empty and offline states** use one `StatePage` that keeps the header band and close button, so a member can change category or leave from an empty category.
- **Image `sizes` is a viewport estimate** (`use-image-sizes.ts`: viewport − 32 px, capped at the 608 px column), not a measured element width. It is known before layout, and the srcset buckets (360/720/1080) make the difference irrelevant.
- **The Browse button is shown only on the All and category list views**, not on Favorites, Archived or search.
- **`DeckLayout` renders a bare `<Outlet>` while browsing**, so the full-screen route doesn't stack under the deck header, and the layout has no extra wrapper.
- **The T009 lazy-only check** (`scripts/initial-chunks.ts` `lazyOnlyViolations`) matches content markers of `@use-gesture` (`preventScrollAxis`, `lockDirection`) in the initial chunks. Production chunks have no module paths. `pnpm budget` fails on a hit.
- **No `will-change`** (T042). The only transition in `browse.css` is the 150 ms `transform` on the footer dots. Card paging is native scrolling, and category or pane changes re-render without animation.

- **Content pane title links to the card page** (convergence T051, FR-016), as in the list.

## Deviations from the plan

- **Return-entry write**: written immediately, not debounced (see above).
- **CSS location**: `browse/browse.css`, not `styles.css`.
- **Scroll restoration**: disabled on `/d/$slug/browse`. The plan assumed D65 only affected the list.
- **Chrome check**: `isBrowsePath()` instead of `endsWith('/browse')`.
- **Convergence (T050–T052)**: one `/speckit-converge` run found FR-016 partial (title not linked) and FR-005 partial (system back after a category change); both fixed.
- **E2E swipes** use Chrome DevTools Protocol `Input.dispatchTouchEvent` (`e2e/tests/smoke/helpers/swipe.ts`). Playwright's `touchscreen` only taps, and synthetic pointer events don't drive native scroll-snap.

## Not done here (needs a deployed build and real devices)

- **T043**: the performance trace on a mid-range Android phone (quickstart §3). It needs a physical device and a production build behind Caddy.
- **T049**: SC-002 10/10 on iOS and Android, and demo 4 with a member who hasn't seen the screen.
- **T048**: the PLAN.md Phase 6 demo ticks 3–5. They are ticked only after running them on the deployed instance. The spec links are in place.

## Gates (T044)

- `pnpm lint`, `pnpm format:check`, `pnpm typecheck`: pass.
- `pnpm test:unit`: 2131 passed (baseline 2011).
- `pnpm test:int`: 396 passed, unchanged (there is no API change).
- `pnpm build:web && pnpm budget`: 113.7 KB of 150 KB; the lazy-only check passes.
- `pnpm api:openapi`: no drift.

## E2E run (local)

Against `pnpm dev` (API :3000, web :5173) and a throwaway pgvector Postgres, migrated and seeded with a local smoke token:

- `browse.spec.ts`: 5 / 5 passed, and 10 / 10 with `--repeat-each=2` on 2 workers.
- Full `--grep @smoke`: 52 passed, 3 failed.
  - `web.spec` (`/version.json`) and `share.spec` (failed-share redirect) need Caddy, as on the base branch.
  - `editor.spec` "unsaved card comes back after a reload" is timing-based (800 ms autosave waits) and flaked under parallel load. It passes in isolation (`editor.spec` 15 / 15) and doesn't touch Browse.
