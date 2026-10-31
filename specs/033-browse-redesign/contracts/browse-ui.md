# Contract: Browse UI (033)

This contract replaces §2–§4 of [009's contract](../../009-browse-mode/contracts/browse-ui.md). §1 (address) and §5 (image loading) stay, without `pane`.

## 1. Address

`/d/<deckSlug>/browse?c=<all|categorySlug>&i=<itemId>`. History rules are as in 009. A `pane` parameter is ignored.

## 2. Layout (viewport `W × H`)

| Part | Position | Contents and size |
|------|----------|-------------------|
| Top bar | fixed at the top, translucent | close · chip rail · "n / N", with a 2 px progress bar; ≤ 120 px + safe-top |
| Track | full screen, scroll-snap `x mandatory` | one page per `W` |
| Page | `overflow-y: auto`, padded for the bars | the card, then Details, then Source |
| Dock | floating pill at the bottom, above safe-bottom | Previous card · card actions · Next card |
| End page | after the last card (no more pages) | "That's all in <c>" · Continue to <next> · Back to the list |

Only the current page ±1 render content. The other pages are empty placeholders of the same width. Only the current page is in the a11y tree.

## 3. Moves

| Action | Gesture | Tap | Key | Accessible name |
|--------|---------|-----|-----|-----------------|
| Next card | swipe left | dock › | `ArrowRight`, `PageDown` | "Next card" (button) |
| Previous card | swipe right | dock ‹ | `ArrowLeft`, `PageUp` | "Previous card" (button) |
| Read more | scroll down | n/a | `ArrowDown` (native) | regions "Details" and "Source" |
| Category | n/a | chip | `Tab` + `Enter` | the chip name (button, `aria-current` on the current one) in the nav "Categories" |
| Continue | n/a | end page | `Enter` | "Continue to <name>" (button) |
| Close | system back | ✕ | `Escape` | "Close browse" (button) |
| Dismiss hint | n/a | "Got it" | `Escape` / `Enter` | dialog "How to browse" |

Position: "Card 3 of 25" is announced in a polite live region. The visible counter is `aria-hidden`.

## 4. States

| State | Display |
|-------|---------|
| Loading, empty, offline | One page with the list's copy. The top bar stays usable; the dock is hidden. |
| Deep link not found | The first card, plus the notice "That card isn't available here". |
