# Research: Deck header (043)

Decisions continue the project-wide `D` series. This feature uses **D380–D382**.

## D380 — One breadcrumb header replaces header + search box + chip row

- **Decision**: `deck-header/DeckHeader.tsx` renders `<header class="app-header">` with Back, an `<nav aria-label="Breadcrumb"><ol>` (deck crumb as the page `h1`, then the view crumb) and a Search icon button. The view crumb and Search appear only on the card lists (`app/list-tools.ts`, unchanged). `ChipRow`, `SearchBox` and `useDebounced` are deleted.
- **Why**: deck › category is a hierarchy; one row frees most of a phone's first screen. A breadcrumb `nav` with an ordered list is the standard accessible pattern.
- **Alternatives**: a horizontally scrolling chip row in the header (still two rows on phones, hidden overflow); a sticky search box (keeps the space problem).

## D381 — Switchers are `MoreMenu` choices

- **Decision**: both carets reuse `ui/MoreMenu` (D213). `MenuAction` gains an optional `checked`, which renders `menuitemradio` + `aria-checked` and a check slot; its `icon` becomes optional. `MoreMenu` gains `align: 'start' | 'end'` (RTL-aware); the crumbs open at their start edge. The menu is capped at `min(70vh, 28rem)` and scrolls. Deck items come from `decksQuery()` plus "All decks" (`/?all=true`); view items from `ui/deck-views.ts` (`deckViews`, the old chip order and gates) through `deck-header/switcher-actions.ts`.
- **Why**: one menu implementation with keyboard, focus and portal behaviour already tested; radio semantics say which item is current.
- **Alternatives**: a `<select>` (no links, poor styling, no "All decks" action); a sheet listing (heavier than a menu for a handful of items).

## D382 — Search opens a sheet; `/` shortcut

- **Decision**: Search opens `deck-header/SearchSheet.tsx`, a `ui/sheet/Sheet` (bottom on phones, centred from 600 px) with a `role="search"` form, the box focused and prefilled with the current query, and `RecentSearches` read once per opening. Enter runs `onSearch` (blank ignored) and closes it; navigation to `/d/$slug/search` is unchanged (`replace` while already searching). `use-search-shortcut.ts` opens it on `/` outside text fields, modifiers and open dialogs.
- **Why**: search is used occasionally; a button costs one tap and no space, and the sheet has room for recent searches. Submit-on-Enter replaces the 250 ms debounce, so there's no request per keystroke.
- **Alternatives**: expand the box inline in the header (cramped at 360 px, no room for recents).
