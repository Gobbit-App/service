# Browse mode (Phase 6, `specs/009-browse-mode`)

_Overview: [architecture.md](../architecture.md). Decisions: [adr.md](../adr.md)._

Browse shows one card per screen. Readers swipe vertically between cards, across the header to change category, and across the footer to switch between the Content, Details and Source panes. Every gesture has a button and a key. Nothing changes in the API or the DB. The one new web dependency is `@use-gesture/react`, and it loads only in the Browse chunk.

**Route and address (D141)**:
- The route is `/d/$slug/browse?c=<all|category>&i=<itemId>&pane=<content|details|source>` (`routes/d.$slug.browse.tsx`).
- `browse/browse-params.ts` parses the search params leniently and has no zod: unknown values fall back to the defaults.
- While browsing, `DeckLayout` renders only its `<Outlet>`. `isBrowsePath()` detects the route.
- Card, category and pane changes `replace` the history entry, so only opening Browse adds one.
- The "Browse" button sits on the All and category lists (`items/BrowseButton.tsx`). It opens Browse on the first card visible in the list (`items/first-visible.ts`) and pushes with `state.fromList`, which carries the list's category.
- Closing (button or Escape):
  - from the same category, `history.back()`;
  - after a category change, the list of the new category replaces the Browse entry;
  - from a deep link, the list is pushed.
- The system back action after a category change (FR-005): Browse records the opening list and its history index (`__TSR_index` − 1) in `sessionStorage` (`gobbit:browse-opener`). When that exact entry mounts again and the return entry names another category, `ItemList` replaces it with the current category's list, which then scrolls to the card.

**Data**:
- `browse/use-browse-items.ts` runs `useInfiniteQuery(itemsQuery(slug, filter))` with the list's own filter. Browse and the list share the cache and the persisted offline copy.
- The next page is fetched 3 cards before the end.
- A deep-linked `i` is searched for across up to 5 pages. If it isn't found, Browse opens on the first card with "That card isn't available here".
- Archived, deleted, proposed and hidden cards are never in the list query.

**Paging (D139, D144)**:
- `.browse__pages` is a native CSS scroll-snap container: `y mandatory`, with `overscroll-behavior-y: contain`.
- Every page is `100dvh`. Only the current card ±1 render content; the rest are empty placeholders of the same height.
- One IntersectionObserver at threshold 0.6 (`use-current-card.ts`) tracks the current card. After 300 ms of settle it writes `i`.
- Only the current page is exposed to assistive tech; the others are `inert` + `aria-hidden`. Focus moves to the card title on change, and one live region announces the position.
- **Scroll restoration is disabled for this route** (`app/router.ts`). Router scroll restoration would otherwise restore the snap container from an earlier Browse visit in the tab, and again after every settle `replace`. Browse positions itself only from `i`.

**Zones (D140)**:
- The header band (`max(25dvh, 88px)`) and the footer band take horizontal swipes through `use-zone-swipe.ts` (`useDrag`, `axis: 'x'`, `filterTaps`, `touch-action: pan-y`).
- `swipe.ts` classifies a swipe: at least 40 px or 0.3 px/ms, on the dominant axis, with leftward meaning next.
- The 24 px at each screen edge are ignored (`edge-guard.ts`), so the system back gesture keeps working.
- The middle zone only scrolls.
- Category order is All, then the chip-row order (`category-cycle.ts`), with no wrap-around.
- The footer selects the pane, and the pane stays the same across cards. The Content pane is the list's card (favorite, share, and the title links to `/i/<id>`).

**Without gestures (D142)**:
- Buttons: ↑/↓ card buttons, ‹ › category chevrons named after their target, a category menu, a `tablist` for the panes, and a close button.
- Keys: PageUp/PageDown/ArrowUp/ArrowDown for cards, ArrowLeft/ArrowRight for categories, Escape to close. The pure classifier in `browse-keys.ts` skips inputs and card bodies that can still scroll.
- A first-run dialog ("How to browse") explains the zones. Its dismissal is remembered in `localStorage` `gobbit:browse-hint:v1`.
- Under `prefers-reduced-motion`, card changes scroll with `behavior: 'auto'`.

**Return to the list (FR-005)**:
- Every card change writes `{ deckSlug, filterKey, itemId }` to `sessionStorage` (`browse-return.ts`).
- `ItemList` reads the entry once on mount. If it matches the list's deck and filter, it scrolls that card into view and clears the entry. This overrides the pathname-keyed restore (D65) only for that one return.

**Images and motion (D144)**:
- `ImageCard` has optional `sizes` and `priority` props. Browse passes a viewport-based `sizes` (`use-image-sizes.ts`).
- The current card gets `loading="eager"` + `fetchpriority="high"`; its neighbours stay lazy.
- The only CSS transition is a `transform` on the footer dots, so there is no `will-change`. Styles live in `browse/browse.css`, which is part of the lazy chunk.

**Bundle**:
- Initial JS is 113.7 KB gzip (was 112.5).
- The Browse route chunk is 13.1 KB gzip, including use-gesture's `useDrag` (~8.5 KB).
- `pnpm budget` fails if an initial chunk contains `@use-gesture` code. `scripts/initial-chunks.ts` `lazyOnlyViolations` checks for content markers.

## Deviations from the 009 plan

- **The return entry is written immediately** on each current-card change, not debounced to 300 ms. `current` already trails scrolling through the observer.
- **CSS is in `browse/browse.css`**, with its own reduced-motion block, not in `styles.css`. It stays out of the initial CSS.
- **Scroll restoration is disabled on `/d/$slug/browse`**. The plan assumed D65 only affected the list.
- **`isBrowsePath()` is a regex**, not `pathname.endsWith('/browse')`, which would misfire on a category whose slug is `browse`.
- **Close after a category change replaces the entry with the new category's list.** The system back action lands on the opening list, which redirects (`replace`) to the current category's list via the opener record and history index (convergence T052).
- **The not-found notice stays** while the reader is on the card Browse opened on, even after `i` is written.
- **The lazy-only check matches content markers**, because production chunks carry no module paths.
- **E2E swipes use CDP `Input.dispatchTouchEvent`** (`e2e/tests/smoke/helpers/swipe.ts`), because Playwright's touchscreen API only taps.
- **Accessible names are asserted with `getByRole`**; there is no axe dependency. The research also recorded plan-vs-code resolutions, all resolved in favour of the code:
  - an auto-split file route instead of an explicit lazy import;
  - reusing `cards/cloudinary.ts` widths;
  - the `gobbit:browse-hint:v1` key;
  - a Source pane built from `sourceKind`/`sourceUrl`/ages.
