# Research: 034 Browse redesign

Decisions continue the project-wide D series (D244–D251).

- **D244: Cards page horizontally on a native scroll-snap track.** The track uses `x mandatory` and `scroll-snap-stop: always`, with one page per viewport width. Native scrolling gives finger tracking, momentum and rubber-banding, with no JS on the gesture path. Each page is its own vertical scroller, so card paging (x) and card reading (y) never compete for the same axis. That competition was the root cause of 009's broken vertical paging on tall cards.
  - *Rejected*: keeping vertical paging. It nests same-axis scrollers, which was D139's problem.
  - *Rejected*: a JS-driven pager with `@use-gesture` and transforms. It needs more code, its momentum is worse than native, and it does main-thread work during the gesture.
- **D245: No zones, no edge guard.** The whole card takes the sideways swipe. The OS back gestures (iOS edge swipe, Android gesture navigation) are handled before page scrolling, so 009's 24 px edge guard (D140) is no longer needed. The track sets `overscroll-behavior-x: contain`, so Chrome's overscroll history navigation doesn't fire at the first card.
- **D246: Details and Source follow the content.** The three panes (D142, footer tabs) become sections under the card in the same scroll. `pane` is dropped from the address. The lenient parser ignores it, so old links still open.
- **D247: A category chip rail replaces header swipes and the category menu.** It lists All and then the categories in chip-row order (D141's cycle). The current chip has `aria-current` and is scrolled to the centre. Category keys (←/→ in 009) now move between cards, so the arrows match the paging axis.
- **D248: End page.** After the last card (no more pages), one more page offers "Continue to <next category>" and "Back to the list". It isn't an item: the address and the return entry both keep the last card.
- **D249: A floating dock holds the card's actions.** `Card` renders without its action bar (`actions={false}`). Browse renders `CardActionBar` for the current card in the dock, between Previous card and Next card. In Browse this replaces 024's position menu (D215): the position becomes plain text plus a progress bar, and the dock buttons do the moves.
- **D250: Depth comes from scroll-driven CSS, as progressive enhancement.** Pages scale to 0.92 and fade as they leave (`animation-timeline: view(inline)`, only `transform`/`opacity`). This sits inside `@supports` and is off under reduced motion. No JS runs per frame.
- **D251: Drop `@use-gesture/react`.** Nothing in the app uses it anymore, so the lazy-only budget check keeps only `papaparse`. The hint key moves to `gobbit:browse-hint:v2`.
