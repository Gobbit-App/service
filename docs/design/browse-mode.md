# Browse mode (Phase 6 `specs/009-browse-mode`, redesigned in `specs/033-browse-redesign`)

_Overview: [architecture.md](../architecture.md). Decisions: [adr.md](../adr.md) (ADR-052, ADR-065)._

Browse shows one card per screen, full page. Readers swipe sideways between cards and scroll down a card to read its details and source. A compact top bar holds close, the category chip rail and the position. A floating dock holds Previous card, the card's actions and Next card. Nothing changes in the API or the DB, and Browse has no gesture library: paging is native scrolling (033 replaced 009's vertical pages, swipe zones and pane tabs).

**Route and address (D141, D246)**:
- The route is `/d/$slug/browse?c=<all|category>&i=<itemId>` (`routes/d.$slug.browse.tsx`). The 009 `pane` parameter is ignored, so old links still open.
- `browse/browse-params.ts` parses the search params leniently and has no zod: unknown values fall back to the defaults.
- While browsing, `DeckLayout` renders only its `<Outlet>`. `isBrowsePath()` detects the route.
- Card and category changes `replace` the history entry, so only opening Browse adds one. A chip switch clears `i`; the settle then writes the new category's first card.
- The "Browse" button sits on the All and category lists (`items/BrowseButton.tsx`). It opens Browse on the first card visible in the list (`items/first-visible.ts`) and pushes with `state.fromList`, which carries the list's category.
- Closing (button, Escape, or "Back to the list"):
  - from the same category, `history.back()`;
  - after a category change, the list of the new category replaces the Browse entry;
  - from a deep link, the list is pushed.
- The system back action after a category change (FR-005): Browse records the opening list and its history index (`__TSR_index` − 1) in `sessionStorage` (`gobbit:browse-opener`). When that exact entry mounts again and the return entry names another category, `ItemList` replaces it with the current category's list, which then scrolls to the card.

**Data**:
- `browse/use-browse-items.ts` runs `useInfiniteQuery(itemsQuery(slug, filter))` with the list's own filter. Browse and the list share the cache and the persisted offline copy.
- The next page is fetched 3 cards before the end.
- A deep-linked `i` is searched for across up to 5 pages. If it isn't found, Browse opens on the first card with "That card isn't available here".
- Archived, deleted, proposed and hidden cards are never in the list query.

**Paging (D244, D245, D248)**:
- `.browse__track` is a native horizontal scroll-snap container: `x mandatory`, `scroll-snap-stop: always`, `overscroll-behavior-x: contain` (no browser history swipe at the first card).
- Each `.browse-page` is one screen wide and scrolls vertically on its own, so reading a tall card (y) and paging (x) never compete for the same axis. There are no zones and no edge guard: the OS back gestures are handled before page scrolling.
- Only the current card ±1 render content; the rest are empty pages of the same size.
- One IntersectionObserver at threshold 0.6 (`use-current-card.ts`) tracks the current page. After 300 ms of settle it writes `i`.
- After the last card (no more pages to load), an end page (`END_PAGE_ID`, `EndPage.tsx`) offers "Continue to <next category>" and "Back to the list". It isn't an item: the address and the return entry keep the last card. The dock hides there.
- Only the current page is exposed to assistive tech; the others are `inert` + `aria-hidden`. Focus moves to the page heading on change (no focus ring: it is there for screen readers), and one live region announces the position.
- **Scroll restoration is disabled for this route** (`app/router.ts`). Browse positions itself only from `i`.

**Chrome (D247, D249)**:
- `TopBar.tsx`: close, `CategoryRail.tsx` (All, then the chip-row order of `category-cycle.ts`; the current chip has `aria-current` and is scrolled to the centre), the "3 / 25" counter and a 2 px progress bar. The bar is translucent with a backdrop blur.
- `BrowseDock.tsx`: a floating pill with Previous card · `CardActionBar` (favorite, share, edit, more) · Next card. `Card` renders without its own bar in Browse (`actions={false}`). Next on the last card goes to the end page.
- Card details and source (`sections/CardDetails.tsx`, `sections/CardSource.tsx`) follow the content as labelled regions.
- The app's sticky offline banner becomes a small pill under the top bar inside Browse (`body:has(.browse)`), so it never covers the chips.

**Without gestures (D142, D247)**:
- Every move has a button: the dock's Previous/Next, the chips, close, and the end page's buttons.
- Keys (`browse-keys.ts`): ArrowLeft/ArrowRight and PageUp/PageDown for cards; ArrowUp/ArrowDown stay native (they scroll the card); Escape closes. Inputs are skipped.
- A first-run bottom sheet ("How to browse": swipe sideways, scroll down, tap a category). Its dismissal is remembered in `localStorage` `gobbit:browse-hint:v2`, so readers of the 009 design see it once.
- Under `prefers-reduced-motion`, card changes jump (`behavior: 'auto'`) and nothing animates.

**Return to the list (FR-005)**:
- Every card change writes `{ deckSlug, filterKey, itemId }` to `sessionStorage` (`browse-return.ts`).
- `ItemList` reads the entry once on mount. If it matches the list's deck and filter, it scrolls that card into view and clears the entry. This overrides the pathname-keyed restore (D65) only for that one return.

**Images and motion (D144, D250)**:
- The current card's image gets `loading="eager"` + `fetchpriority="high"`; its neighbours stay lazy. `sizes` comes from `CloudImage` (D161).
- Depth while paging is scroll-driven CSS (`animation-timeline: view(inline)`: leaving pages scale to 0.92 and fade), inside `@supports` and off under reduced motion. No JS runs per frame. Only `transform`/`opacity` animate.
- Styles live in `browse/browse.css`, which is part of the lazy chunk.

**Bundle**: the Browse chunk no longer carries `@use-gesture/react` (D251, removed from the app). `pnpm budget` keeps its lazy-only check for `papaparse`.

## Deviations from the 009 plan

- **The return entry is written immediately** on each current-card change, not debounced to 300 ms. `current` already trails scrolling through the observer.
- **CSS is in `browse/browse.css`**, with its own reduced-motion block, not in `styles.css`. It stays out of the initial CSS.
- **Scroll restoration is disabled on `/d/$slug/browse`**. The plan assumed D65 only affected the list.
- **`isBrowsePath()` is a regex**, not `pathname.endsWith('/browse')`, which would misfire on a category whose slug is `browse`.
- **Close after a category change replaces the entry with the new category's list.** The system back action lands on the opening list, which redirects (`replace`) to the current category's list via the opener record and history index (convergence T052).
- **The not-found notice stays** while the reader is on the card Browse opened on, even after `i` is written.
- **E2E swipes use CDP `Input.dispatchTouchEvent`** (`e2e/tests/smoke/helpers/swipe.ts`), because Playwright's touchscreen API only taps.
- **Accessible names are asserted with `getByRole`**; there is no axe dependency.

## Deviations from the 033 plan

- **Chips are plain `<button>`s styled in `browse.css`**, not `ui/buttons`: they are text-only navigation items with no icon (ADR-059 covers actions).
- **The All end page reads "You've seen every card"**; a category's reads "That's all in <category>".
- **The dock hides on the end page**, whose buttons are its only content (FR-007 said disabled at the ends).
- **Next on the last card goes to the end page** instead of being disabled; Previous is disabled on the first card.
- **The offline banner is restyled inside Browse** (a pill under the top bar that takes no taps). Smoke e2e caught the sticky banner covering the chips.
- **A chip switch clears `i`** until the settle writes the new category's first card.
- **Headings and the end page's/hint's labelled buttons show no focus ring or D212 tooltip**: the headings take focus only for announcement, and those buttons keep their visible labels on narrow screens.
