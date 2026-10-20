# Contract: Browse UI

**Feature**: [spec.md](../spec.md) · **Data model**: [data-model.md](../data-model.md)

Browse adds no HTTP endpoint. This contract fixes the address, the zones, and the mapping between gestures, controls, keys and accessible names. The unit and e2e tests assert against it.

## 1. Address

```
/d/<deckSlug>/browse?c=<all|categorySlug>&i=<itemId>&pane=<content|details|source>
```

| Event | History | Params after |
|-------|---------|--------------|
| Open from list (header "Browse" button) | **push** (`state.fromList = true`) | `c` = list's category or `all`; `i` = first card visible in the list |
| Card change (swipe, button, key) | replace | `i` updated |
| Category change | replace | `c` updated, `i` removed (first card) |
| Pane change | replace | `pane` updated |
| Close / system back | `history.back()` if `fromList`, else push the list href (`deckHref`) | n/a |

- **List href**: `c=all` → `/d/<slug>`; otherwise → `/d/<slug>/c/<c>` (`chipHref`).
- **Deck chrome**: hidden while the path ends with `/browse`.

## 2. Zones (per snap page, viewport height `H`)

| Zone | Height | Horizontal swipe | Vertical swipe | `touch-action` |
|------|--------|------------------|----------------|----------------|
| Header band | `max(25 % H, 88px)` | category next/prev | scrolls the snap container (card) | `pan-y` |
| Middle (card content) | remainder | **ignored** | scrolls the card content, then chains to the next/previous card | `auto` |
| Footer band | `max(25 % H, 88px)` | pane next/prev | scrolls the snap container (card) | `pan-y` |

- **Swipe**: horizontal distance ≥ 40 px or velocity ≥ 0.3 px/ms, with the dominant axis x.
  - Leftward = **next**, rightward = **previous**, whatever the text direction.
  - One swipe = one step; no wrap. At the first or last item the chevron is disabled and the swipe does nothing.
- **Edge guard**: a pointer-down with `clientX < 24` or `clientX > innerWidth − 24` is never handled as a swipe.
- **Overscroll**: snap container `overscroll-behavior-y: contain`; inner content `auto`.
- **Active pages**: only the current page binds gesture handlers. Only the current card ±1 render content; the other pages are empty `100dvh` placeholders.

## 3. Gesture ↔ tap ↔ keyboard ↔ accessible name

| Action | Gesture | Tap control | Key | Accessible name (role) |
|--------|---------|-------------|-----|------------------------|
| Next card | swipe up (anywhere) | ↓ button in the footer | `PageDown`, `ArrowDown` | "Next card" (button) |
| Previous card | swipe down | ↑ button in the header | `PageUp`, `ArrowUp` | "Previous card" (button) |
| Next category | swipe left on the header | › chevron | `ArrowRight` | "Next category: <name>" (button) |
| Previous category | swipe right on the header | ‹ chevron | `ArrowLeft` | "Previous category: <name>" (button) |
| Pick a category | n/a | tap the category name → menu of categories | `Enter` on the name | "Category: <name>" (button, `aria-haspopup="menu"`) |
| Next/previous pane | swipe left/right on the footer | tab | `Tab` to the tablist, then `ArrowLeft`/`ArrowRight` | "Content", "Details", "Source" (tab, in a `tablist` named "Card view") |
| Close | system back gesture/button | ✕ button | `Escape` | "Close browse" (button) |
| Dismiss hint | n/a | "Got it" | `Escape` / `Enter` | dialog named "How to browse" |

Notes:

- **Position**: "3 of 10" (or "3" while more pages exist) is a live region (`aria-live="polite"`) announcing card changes.
- **Arrow keys**: ArrowUp and ArrowDown are handled only when focus is not inside a scrollable card body. There they scroll the content natively first.
- **Reduced motion** (`prefers-reduced-motion: reduce`): `scrollIntoView({ behavior: 'auto' })` and no band transitions.

## 4. Visible states

| State | Content | Controls |
|-------|---------|----------|
| Loading first page | the list's loading copy | header active |
| Empty category | `emptyListCopy(filter)` (same as the list) | card buttons disabled; header active |
| Offline, not cached | "You're offline and these cards aren't saved on this device yet." (same as the list) | header active |
| Deep link not found | first card + notice "That card isn't available here" | normal |
| First run | "How to browse" overlay labelling the header, middle and footer zones | dismiss only |

## 5. Image loading (D144)

| Card | `loading` | `fetchpriority` | `sizes` |
|------|-----------|-----------------|---------|
| current | `eager` | `high` | measured content width (`<n>px`) |
| ±1 neighbours | `lazy` | (default) | same |
| others | not mounted | n/a | n/a |

`srcset` uses the existing buckets, 360/720/1080 (`cards/cloudinary.ts`).
