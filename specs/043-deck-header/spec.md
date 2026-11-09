# Feature Specification: Deck header

**Feature Branch**: `worktree-042-deck-header` | **Created**: 2026-11-09 | **Status**: Implemented

**Input**: The top of a deck page uses three rows: back + deck title, a full-width search box and a chip row of categories. That spends most of a phone's first screen on navigation, looks unfinished and is awkward to use. Turn it into one breadcrumb line, deck › category, each with a small caret that opens a switcher (like a repository switcher). Search becomes a header button that opens a bottom sheet with the search box and recent searches.

## User Scenarios & Testing

### User Story 1 — One-line breadcrumb (P1)

A member opens a deck and sees one header row: Back, the deck name, a separator and the current view (All, Favorites, a category, Archived, Links to check or Search), with a Search button at the end.

**Acceptance**:
1. On a card list the header is one row at 360 px wide, with no horizontal overflow; long names truncate with an ellipsis.
2. The deck name links to the deck's main page.
3. Off the card lists (Your shares, Review, Log, Settings, Import, Upcoming) only the deck crumb shows, with no view crumb and no Search.

### User Story 2 — Switch deck or category from the crumbs (P1)

**Acceptance**:
1. The caret beside the deck name opens a menu of the member's decks, with the current one checked, plus "All decks", which leads to the deck list.
2. The view crumb opens a menu of All, Favorites, the categories in order, then Archived and Links to check for those allowed to see them (same rules as the old chips). The current view is checked; on search results none is.
3. Picking an item navigates; Escape or a click outside closes the menu without navigating.

### User Story 3 — Search in a sheet (P1)

**Acceptance**:
1. Search (or `/` outside a text field) opens a sheet from the bottom on phones (centred from 600 px) with a focused search box and, if there are any, the deck's recent searches.
2. Enter runs the search and closes the sheet; a blank Enter does nothing; Escape closes without searching.
3. On search results the sheet opens prefilled with the current query; the view crumb reads "Search".

### Edge cases

- A reader never sees Archived or Links to check in the view menu.
- `/` does nothing in inputs, editors, open dialogs, with a modifier held, or off the card lists.
- The deck list query failing or loading leaves the deck menu with "All decks" only.

## Requirements

- **FR-001** One header row on card lists: Back, deck crumb with switcher, view crumb with switcher, Search.
- **FR-002** The view menu offers exactly the views the old chip row offered, with the same permission gates.
- **FR-003** Search opens a modal sheet; it doesn't search as you type (no debounce).
- **FR-004** Menus are WAI-ARIA menu buttons; choices are `menuitemradio` with `aria-checked`.
- **FR-005** No new API, route or dependency.

## Success Criteria

- **SC-001** At 360 × 780 the header is under 80 px tall (was three rows).
- **SC-002** Every view reachable from the old chip row is reachable in two taps.
