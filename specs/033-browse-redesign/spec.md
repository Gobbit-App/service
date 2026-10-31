# Feature Specification: Browse redesign — full-screen, sideways card flipping

**Feature**: `033-browse-redesign` · **Status**: Implemented · **Supersedes**: the zone model of [`009-browse-mode`](../009-browse-mode/spec.md) (FR-002, FR-006–FR-009, FR-011, FR-012)

## Why

Browse (009) splits the screen into three zones. The header and footer bands each take a quarter of the screen (at least 88 px), so half the screen is chrome and the card is squeezed into the middle. Category and pane swipes only count inside those bands and are decided on release. Nothing moves under the finger, so they feel broken. Cards page vertically, but a tall card (an image) also scrolls vertically inside its page, so the two vertical scrolls compete. The result reads as an old web page, not as a modern app that puts the content first.

## Outcome

Browse feels like a native, full-screen reader. The card fills the screen. A sideways swipe flips to the next card, and the card follows the finger. Scrolling down reads the rest of the card. The controls are compact and float over the content.

## User scenarios

1. **Flip through a category**: a member opens Browse from a list. The card fills the screen. They swipe left and the next card slides in under their finger; swipe right goes back. A counter ("3 / 25") and a thin progress bar show where they are.
2. **Read a long card**: on a tall card (a photo, a long table) they scroll down. The card's details (extracted entities, categories, type) and its source (kind, link, added/edited/published) follow the content in the same scroll.
3. **Change category**: the categories sit in a chip rail at the top. Tapping one shows its cards from the first. At the end of a category, one more swipe shows an end page that offers to continue with the next category or to go back to the list.
4. **Act on a card**: favorite, share, edit and the more menu sit in a floating dock at the bottom, between the previous and next card buttons. They are always reachable without scrolling.
5. **Without gestures**: everything works with taps (dock arrows, chips) and with a keyboard (←/→ and PageUp/PageDown for cards, Tab to the chips, Escape to close).

## Requirements

- **FR-001** (kept from 009): Browse opens from the All and category lists on the first visible card. It shows the same cards, order and visibility rules as the list. The address restores category and card, and card changes don't add history entries. Close and system back return to the list with the card in view. The next page loads ahead, cached categories work offline, and nothing is added to the initial download.
- **FR-002**: Each card MUST fill the screen between a compact top bar and a floating bottom dock. The top chrome MUST NOT take more than 120 px (plus the safe area). The bottom dock MUST float over the content.
- **FR-003**: A horizontal swipe anywhere on the card MUST move to the next (leftward) or previous card. The card MUST follow the finger and settle on a whole card. A vertical swipe MUST only scroll the current card.
- **FR-004**: The card's details and source MUST follow its content in the same vertical scroll. There are no pane tabs. The `pane` address parameter is no longer used, but old links still open.
- **FR-005**: The top bar MUST show:
  - a close control;
  - every category (All first, then chip-row order) in a horizontally scrollable chip rail, with the current one marked and scrolled into view;
  - the position ("3 / 25", or "3" while more pages exist) with a progress bar.
- **FR-006**: After the last card of a category, an end page MUST offer "Continue to <next category>" (when there is one) and "Back to the list".
- **FR-007**: The bottom dock MUST hold Previous card, the card's actions (as in the list) and Next card. Previous and Next MUST be disabled at the ends.
- **FR-008**: Keys:
  - ArrowRight and PageDown go to the next card.
  - ArrowLeft and PageUp go to the previous card.
  - ArrowUp and ArrowDown scroll the card natively.
  - Escape closes.
  - Keys typed in text fields and open menus are left alone.
- **FR-009**: The first time the new Browse opens on a device, a short "How to browse" sheet MUST explain the three moves: swipe sideways, scroll down, tap a category. Dismissal is remembered per device. It uses a new storage key, so readers of the old design see it once.
- **FR-010**: Reduced motion: card changes jump without animation and no decorative motion plays.
- **FR-011**: Loading, empty and offline states fill the card area; the top bar (close, chips) stays usable.

## Success criteria

- **SC-001**: A member flips 10 cards, switches category from the chip rail and reads a card's source, without leaving Browse.
- **SC-002**: On a 390×844 phone, the card's title starts within 130 px of the top, and the card area is at least 75 % of the screen height.
- **SC-003**: Every Browse action works with taps only and with a keyboard only (e2e).
- **SC-004**: The initial download stays within the 150 KB gzip budget, and the Browse chunk gets smaller (no gesture library).

## Out of scope

The following are not part of this feature:

- an immersive (chrome-hiding) mode;
- pinch-zoom on images;
- swiping between categories (the chip rail and the end page cover it);
- API or DB changes.
