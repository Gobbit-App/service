# Research: 040 Browse rework

Decisions continue the project-wide D series. The spec reserved D324–D339, but D324 went to the
tooltip fix (#106) before this plan, so this feature uses **D325–D340**.

## Gestures and layout

- **D325: Two nested native snap tracks.** The screen holds a horizontal track of category pages
  (`scroll-snap-type: x mandatory`). Each category page is a vertical track of card pages
  (`y mandatory`, `scroll-snap-stop: always`). Swiping up or down scrolls the inner track; swiping
  sideways scrolls the outer one. The browser latches a touch scroll to one scroller by its first
  dominant direction, so a gesture never moves both (FR-010) and nothing runs on the gesture path.
  This keeps ADR-065 (native scroll-snap, no gesture library) and supersedes D244's orientation.
  - *Rejected*: one track plus a JS horizontal detector that calls `scrollIntoView` for
    categories. The category would not follow the finger, and the detector competes with
    native vertical scrolling.
  - *Rejected*: a gesture library (`@use-gesture`, removed in D251) with transforms. It needs more
    code, has worse momentum and does main-thread work per frame.
- **D326: A tall card is an oversized snap area, not an inner scroller.** A card page has
  `min-height: 100%` and grows with its content. CSS Scroll Snap treats any position inside a
  snap area larger than the snapport as a valid snap position, so the track scrolls freely
  through a tall card and snaps only at its edges (FR-006). This avoids 009's nested same-axis
  scrollers (D139's problem).
- **D327: Edge strips and wide content.** Each card page carries two 24 px strips at its sides
  with `touch-action: pan-y`. A touch starting there can scroll cards vertically but never pans
  the category track, so the OS back gesture and in-app edge swipes stay separate (FR-009).
  Wide content that scrolls sideways (table cards) gets `overscroll-behavior-x: contain`, so its
  scroll never chains into a category change.
- **D328: What is mounted.** Only the current category and its neighbours (±1) render a card
  track; the others are empty placeholders of the same size. In a mounted track only the current
  card ±1 renders content (D144 as before). Neighbour tracks use the list's own query and cache,
  so the next category's first card is already there when the swipe starts. Only the current
  category's track is live (address, return entry, keys, dock, prefetch). A track that stops
  being current is remounted at its first card once the category swipe settles, so coming back
  opens on the first card (spec Assumption). Jumps (category list, card category tap, end page)
  remount the target track at the requested card and scroll the outer track instantly.
- **D329: The ends of the category order.** The outer track has no wrap-around; native
  rubber-banding springs the page back (`overscroll-behavior-x: contain`). A passive touch
  watcher on the outer track notices a sideways pull past 48 px at the first or last category and
  shows the "no previous/next category" banner. ArrowLeft/ArrowRight at the ends show the same
  banner.

## Banner and category list

- **D330: One banner, two states.** `CategoryBanner` drops in from the top on every category
  change. *Peek*: translucent, fades out from 1.4 s and is gone (unmounted) at 2 s (SC-004).
  *Open*: tapping it, or the category name in the top bar, turns it opaque, stops the timer and
  shows the list. The announcement goes through a separate polite live region, so the banner never
  takes focus. Card counts appear only when the category's whole list is loaded (the `total` the
  top bar already uses), so the banner never shows a wrong number. Under reduced motion the
  banner appears and disappears without sliding or fading, and still leaves at 2 s.
- **D331: The category list is a panel from the top to above the dock.** Rows are at least 52 px
  tall. The panel fills the space down to the dock, so most rows sit in the screen's lower half,
  within thumb reach, and the current category is scrolled into view (centred). A scrim behind it
  takes outside taps and swipes, so a dismissing swipe never reaches the tracks (FR-013).
  Keyboard: roving focus with ArrowUp/ArrowDown/Home/End, Enter picks (native button), Escape
  closes, and focus returns to the control that opened it.

## Layers and history

- **D332: Layers are history entries in router state.** The category list and full view are
  layers. Opening one pushes an entry with the same address and `state.browseLayer`
  (`'categories'` or `'full'`); closing it from the UI calls `history.back()`, so system back,
  Escape and the close controls all go the same way and no entry survives (FR-018). A change
  that must happen after closing (a card category tap in full view) waits for the layer to be
  gone, then replaces the address. Card and category changes keep the state (`state: prev`), as
  `fromList` does today.
  - *Rejected*: a search param (`?v=full`). It changes the address and a copied link would open
    full view.
  - *Rejected*: no history entry. Then system back would leave Browse instead of closing the
    layer.

## Full view

- **D333: Full view is a vertical snap scroller with a transparent tail.** The overlay holds the
  sheet (content, then metadata, `min-height: 100%`) and after it a transparent spacer one
  screen tall. Scrolling past the bottom of the sheet scrolls into the spacer, moving the sheet up
  with the finger and revealing Browse (still rendered underneath, on the same card) in
  proportion to the pull. Mandatory snapping settles either back on the sheet or on the spacer;
  an observer closes full view when the spacer has settled (≥ 95 % visible). Native momentum turns
  a flick into a close (FR-029). A short card's sheet is exactly one screen, so the pull starts
  straight away. Reduced motion: snapping is native and jumps; the close skips the fade.
  - *Rejected*: touch listeners that translate the sheet and spring it back. They need
    non-passive `touchmove`, hand-written spring physics and velocity tracking.
- **D334: Long press opens full view.** A pointer timer of 500 ms on the main view's card page
  opens it, cancelled by moving more than 10 px, by `pointerup`, or by `pointercancel` (the browser
  starting a native scroll). Presses that start on a link, a button, a form control or detected
  text are ignored. The page suppresses `contextmenu` while a press is pending and the card
  surface has `user-select: none` and `-webkit-touch-callout: none`, so neither the context menu
  nor a selection appears (FR-015). Full view keeps text selectable (FR-017).

## Presentation

- **D335: Content first.** In the main view the card sits on its own surface (`.browse-card`:
  surface colour, 24 px radius, soft shadow, larger title and body type than the list). The page is
  a column with `justify-content: safe center`, so a short card sits in the middle of the page and a
  tall one starts at the top. `Card` gains `meta={false}` to drop its categories and age footer
  (FR-001). Full view puts the same surface first and the metadata after it, smaller and in the
  muted colour (FR-016).
- **D336: The top bar and the dock.** Top bar (56 px + safe area): Close · the current category's
  name as a button with a chevron (opens the list) · "3 / 25" and the progress bar. The chip rail is
  removed. The dock: Previous card (`arrow-up`) · the card's actions · Full view (new `expand`
  icon) · Next card (`arrow-down`).
- **D337: Keys.** ArrowDown/PageDown: next card; ArrowUp/PageUp: previous card. On a tall card
  they first scroll it by 85 % of the screen until its edge shows. ArrowRight/ArrowLeft: next and
  previous category. `f`: full view. Escape closes the innermost layer (list, then full view, then
  Browse). Text fields and open menus keep their keys. RTL text doesn't change the mapping.
- **D338: First-run sheet v3.** The key becomes `gobbit:browse-hint:v3`, with four tips: swipe up
  and down for cards, swipe sideways for categories, tap the category name to jump, hold a card or
  tap Full view for its details.

## Detected text

- **D339: Detection = `linkify-it` + our own number rules, as a remark plugin.** Web addresses
  and emails come from `linkify-it` (the markdown-it linkifier, maintained, no dependencies beyond
  `uc.micro`, about 7 KB gzip). Phones and copyable numbers follow the spec's rules (FR-026, edge
  cases), which are product heuristics rather than a parsing problem:
  - a phone is a digit run with a leading `+` and 7–15 digits, or 7–15 digits written with spaces,
    dashes, dots or brackets;
  - anything else with 3 or more digits is a number to copy, except stand-alone years
    (1900–2099), dates, times, and digits touching a letter (`A4`, `2nd`);
  - an unformatted run (`0501234567`) counts as a number to copy: when unsure, copy.
  - *Rejected*: `libphonenumber-js`. It needs a default region the app doesn't have, and its
    metadata is about 40 KB gzip even in the `min` build.

  A remark plugin (`browse/detect/remark-detect.ts`, walked with `unist-util-visit`) replaces
  text nodes outside links, code and inline code with detected nodes; table cells use the same
  segmenter. Browse passes the plugin and its renderers through a small React context
  (`cards/text-detection.ts`) that `TextCard` and `TableCard` read. The plugin, `linkify-it` and
  the renderers stay in the lazy Browse chunk; the list, the editor preview and public pages are
  unchanged. Card titles are never detected (they don't go through `TextCard`).
- **D340: What a tap does.** Email, phone and web address render as links (`mailto:`, `tel:`, the
  address with `target="_blank" rel="noopener noreferrer"`) with an accessible name ("Email …",
  "Call …", "Open …"). A number renders as a button named "Copy …". It calls
  `navigator.clipboard.writeText` and shows a short toast, "Copied" or "Couldn't copy that
  number", which leaves after 2 s. Detected text is styled as a dotted underline in the accent
  colour, so it stays part of the sentence (FR-027). It counts as a link for the long-press rule.

## ADR

D325–D340 together become **ADR-072: Browse: vertical cards, sideways categories, layered full
view**. It amends ADR-065 (native scroll-snap stays, the axes swap).
