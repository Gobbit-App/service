# Research: Browse mode (swipe navigation)

**Feature**: [spec.md](./spec.md) · **Plan**: [plan.md](./plan.md)

These decisions continue the project-wide D-numbering. Phase 6 reserves D129–D147, and this feature uses D139–D142 and D144. Each decision was checked against `main @ 10b0e2a`. Where the roadmap plan and the code disagreed, the code won; those cases are listed at the end.

## D139 — Gesture stack: native scroll-snap for cards, `@use-gesture/react` for the header and footer

- **Decision**:
  - **Vertical paging between cards**: a full-height scroll container with `scroll-snap-type: y mandatory`. Each card page is `scroll-snap-align: start` and `scroll-snap-stop: always`. An `IntersectionObserver` (threshold 0.6, root = the container) decides which card is current. Next/previous buttons and keys call `scrollIntoView({ block: 'start' })` on the neighbour page.
  - **Horizontal swipes in the header and footer bands**: `useDrag` from `@use-gesture/react` with `axis: 'x'` and `filterTaps: true`. A swipe counts when it moves at least 40 px or reaches 0.3 px/ms. One swipe means one step, so there is no follow-the-finger carousel.
  - No `embla-carousel` and no `framer-motion`.
- **Rationale**:
  - Native snap gives momentum, rubber-banding, keyboard and assistive scrolling, and reduced-motion behaviour from the browser, without extra JavaScript. It also matches how each platform feels.
  - The only gesture code needed is "which way did this horizontal drag go, and was it a tap?". `@use-gesture/react` solves that across pointer and touch events, iOS Safari quirks included, and it adds no animation runtime.
- **Alternatives considered**:
  - **embla-carousel (vertical) + embla (horizontal)**: rejected. It replaces native scrolling with JavaScript-driven transforms, which means more work per frame (SC-004) and losing native momentum on iOS.
  - **framer-motion drag**: rejected. Its animation runtime is about 30 KB+ gzip and nothing here needs it.
  - **Hand-written pointer handlers**: rejected under constitution VII (prefer an established library). Pointer capture, tap filtering and touch/pointer differences across iOS and Android are exactly the edge cases the library already handles.

### New dependency: `@use-gesture/react`

| | |
|---|---|
| Purpose | Horizontal swipe detection in the Browse header and footer bands only |
| Size | About 8 KB gzip (`@use-gesture/core` + `react`; check with `pnpm build:web`). It is loaded only in the Browse route chunk |
| Maintenance | Widely used (pmndrs), MIT, has no runtime dependencies beyond `@use-gesture/core`, and supports React 19 |
| Existing alternative in the repo | None. The web app has no gesture or animation dependency today |
| Initial bundle | No impact: it is imported only from `apps/web/src/browse/*`, which only `routes/d.$slug.browse.tsx` reaches. The file route is code-split automatically (`autoCodeSplitting: true` in `apps/web/vite.config.ts`) |

## D140 — Zones and system gestures

- **Decision**:
  - **Page layout**: each card page in the snap list is a column with three parts:
    - **Header band**: top 25 % of the viewport, at least 88 px. It holds the category name, ‹ › chevrons and the position "3 of 10".
    - **Content area**: the card renderer. It has its own vertical scroll when the card is taller than the space.
    - **Footer band**: bottom 25 %, at least 88 px. It holds pane tabs, dots and ‹ › chevrons.
  - **Why the bands sit inside each page**: a vertical pan that starts in a band still scrolls the snap container, because the container is the band's scroll ancestor. Only the current page (and its two mounted neighbours, D144) binds the drag handlers.
  - **Touch action**: the bands set `touch-action: pan-y`. The browser keeps vertical scrolling and the system edge gestures, and hands only horizontal movement to the handler.
  - **Edge guard**: `edge-guard.ts` ignores pointer-downs within 24 px of the left or right viewport edge before `useDrag` claims the pointer. Nothing calls `preventDefault()` for such starts.
  - **Overscroll**: the snap container uses `overscroll-behavior-y: contain`, which stops pull-to-refresh and page rubber-banding behind Browse. The inner content scroller keeps the default (`auto`), so once a card's own content reaches its end, the next swipe chains to the snap container and moves to the next card (FR-009).
- **Rationale**:
  - A JavaScript check alone runs too late to keep the iOS back-swipe. `touch-action` and the 24 px guard keep the platform gesture with the system.
  - Putting the bands inside each page avoids the overlay problem, where a fixed overlay would block vertical scrolling of the content beneath it.
- **Alternatives considered**:
  - **Fixed header and footer overlays above one snap container**: rejected, because vertical swipes started on them would not scroll the cards.
  - **`overscroll-behavior: contain` on the inner content**: rejected. It blocks chaining entirely, so a tall card could never be left by swiping. That breaks FR-009.

## D141 — Browse address, state and return to the list

- **Decision**:
  - **Route**: `/d/$slug/browse`, a child of the deck layout. Search params are validated by `browse-params.ts`:
    - `c`: `'all'` or a category slug; default `'all'`.
    - `i`: the current item id, optional.
    - `pane`: `'content' | 'details' | 'source'`; default `'content'`.
    - Unknown values fall back to the defaults.
  - **Deck layout chrome**: `routes/d.$slug.tsx` hides its header, search box, chip row and add/paste actions when the path ends with `/browse`, the same pattern it uses for `/new`, `/search` and `/review`.
  - **Category order**: All, then `orderChips(categories)`, the same order as the chip row without Favorites and Archived. There is no wrap-around.
  - **Data**:
    - `useInfiniteQuery(itemsQuery(slug, filter))` with the list's own `ItemFilter`, so Browse and the list share the cache key `['items', slug, filter]` and the persisted offline copy.
    - `fetchNextPage()` is called when the current index reaches `loaded − 3`.
  - **Position**: the position is tracked by item id, not by index. Card changes update `i` with `navigate({ search, replace: true })`, so only opening Browse adds a history entry.
  - **Deep link with `i`**:
    - If the card is in the loaded pages, open there.
    - Otherwise load further pages until it is found, up to 5 pages (`ITEM_PAGE_SIZE` 20 → 100 cards).
    - If it still isn't found, open at the first card with the notice "That card isn't available here". Archived, deleted, proposed and hidden cards are never in the list query (FR-003), so they always end here.
  - **Return to the list (FR-005)**:
    - Every card change writes `{ deckSlug, filterKey, itemId }` to `sessionStorage` under `gobbit:browse-return`.
    - Close: if Browse was opened from the list (router location state `fromList: true`), close calls `router.history.back()`. Otherwise it navigates to the list href.
    - The system back action takes the same path as the first case.
    - `ItemList` reads the return entry once on mount. If it matches its deck and filter, it scrolls that card's `<article>` into view, overriding the pathname-keyed scroll restoration (D65), and then clears the entry.
  - **Panes**:
    - **content**: the existing `cards/Card`.
    - **details**: `EntityChips` (moved to `cards/` by `007-card-editor`), the category names, and the type label. When a card has no details, the pane says so.
    - **source**: a `sourceKind` label, the `sourceUrl` host as a link, `cardAge(item)`, and "Published …" from `verifiedAt` via `relativeTime`.
    - History waits for `item_events` (roadmap Phase 8).
- **Rationale**:
  - The address can be shared and resumed.
  - Reusing the list query means no new endpoint and offline browsing of cached categories (constitution VI). `replace` keeps back meaning "leave Browse".
  - Scroll restoration is keyed by pathname (`app/router.ts`), so on its own it would bring back the list's old position, not the card the member reached in Browse. The one-shot return entry fixes that without changing D65.
- **Alternatives considered**:
  - **A push entry per card**: rejected, because back would step through cards.
  - **A separate Browse query and endpoint**: rejected, because it duplicates cache and visibility logic.
  - **A URL hash (`#card-title-<id>`) for the return**: rejected. It leaves a hash in list URLs and doesn't cover the system back action.

## D142 — Discoverability and accessibility

- **Decision**:
  - **First-run overlay** (`FirstRunHint`): it labels the header, middle and footer zones, is dismissed with a "Got it" button or Escape, and is remembered in `localStorage` `gobbit:browse-hint:v1`. It follows the `lib/last-deck.ts` pattern: storage errors are swallowed and the hint shows again.
  - **Always-visible equivalents**:
    - ↑ / ↓ card buttons (`aria-label` "Previous card" / "Next card").
    - Header ‹ › chevrons whose `aria-label` names the target category ("Next category: School").
    - The category name opens the chip list as a menu.
    - Footer pane tabs (`role="tablist"`).
    - A close button ("Close browse").
  - **Keys**:
    - PageDown/PageUp and ArrowDown/ArrowUp: card (native in the snap container, mirrored for consistency).
    - ArrowRight/ArrowLeft: category.
    - Tab moves to the pane tabs.
    - Escape closes.
  - **Reduced motion**: under `prefers-reduced-motion: reduce`, card changes use `scroll-behavior: auto`, and zone transitions have no transform animation. This extends the existing media query in `styles.css`.
- **Rationale**: master plan step 4 ("nobody depends on discovering a gesture"), PLAN.md demo 4, and accessibility.
- **Alternatives considered**:
  - **Gesture-only with a help page**: rejected (demo 4).
  - **A coach-mark tour**: rejected as heavier than one overlay.

## D144 — Performance

- **Decision**:
  - **Mounting**: only the current card ±1 is mounted. Other pages are empty placeholders of the same height (`100dvh`), so scroll-snap geometry stays exact.
  - **Images**: reuse the existing helpers in `cards/cloudinary.ts` (`IMAGE_WIDTHS` 360/720/1080, `cloudinarySrcSet`). `ImageCard` gains optional `sizes` and `priority` props. Browse passes the measured content width as `sizes`. The current card gets `loading="eager"` and `fetchpriority="high"`; neighbours stay `lazy`.
  - **Animation**: band transitions animate only `transform` and `opacity`.
  - **Observers**: one `IntersectionObserver` for the whole list. The return-entry write is debounced to 300 ms.
- **Rationale**:
  - Master plan step 5 and SC-004. Mounting ±1 bounds the DOM and image decoding regardless of category size.
  - The width buckets already exist, so no new helper is needed. Phase 7's `CloudImage` replaces both.
- **Alternatives considered**:
  - **A virtualization library (react-virtual)**: rejected, because snap pages are uniform and ±1 needs no library.
  - **A new width helper**: rejected, because `cards/cloudinary.ts` already has one.

## ADR candidate

- **ADR-052 — Browse: native scroll-snap + use-gesture**. It covers D139, D140 and D144. It goes into `docs/architecture.md` at close-out. ADR-049 is the spec-kit adoption, ADR-050 is planned in `006-card-lifecycle` and ADR-051 in `008-card-media`. If those merge in a different order, take the next free number.

## Plan vs code discrepancies (resolved in favour of the code)

| Roadmap plan said | Code at `10b0e2a` | Resolution |
|---|---|---|
| "Browse is a lazy route" (explicit lazy import) | `tanstackRouter({ autoCodeSplitting: true })` already splits every file route | A plain file route; the `browse/` modules and `@use-gesture/react` land in its chunk |
| New `image-width.ts` helper for 360/720/1080 | `cards/cloudinary.ts` has `IMAGE_WIDTHS` + `cloudinarySrcSet`; `ImageCard` hard-codes `sizes="100vw"`, `loading="lazy"` | Reuse; add `sizes`/`priority` props to `ImageCard` |
| Inner content `overscroll-behavior: contain` | — (CSS semantics) | `contain` on the snap container only; inner scroller `auto` so a tall card can be left (D140) |
| "Close returns to the list at the current card (D65 scroll keys)" | `getScrollRestorationKey: location.pathname` restores the list's *old* position | One-shot `sessionStorage` return entry read by `ItemList` (D141) |
| Source pane uses "the source line as in review" | `review/source-line.ts` `sourceLine()` takes a review **job**; `Item` has `sourceKind`, `sourceUrl`, `verifiedAt`, `createdBy` (id only) | A `sourceKind` label + `sourceUrl` + ages; "shared by …" stays a review-queue feature |
| Hint key `gobbit.browse.hint.v1` | Existing keys use `gobbit:` (`gobbit:last-deck`) | `gobbit:browse-hint:v1` |
| axe check in `browse.spec` | No `@axe-core/playwright` in `e2e/package.json` | Assert accessible names with `getByRole` (no new dependency) |
| Deck layout full screen | `routes/d.$slug.tsx` always renders header, search, chips and actions | Hide them on `/browse`, as the layout already does for `/new`, `/search` and `/review` |
