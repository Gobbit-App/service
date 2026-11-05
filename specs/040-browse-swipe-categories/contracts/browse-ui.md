# Contract: Browse UI (040)

Replaces §2–§4 of [034's contract](../../034-browse-redesign/contracts/browse-ui.md). §1
(address) stays; layers add router state only (data-model §2).

## 1. Layout (viewport `W × H`)

| Part | Position | Contents |
|------|----------|----------|
| Top bar | fixed top, ≤ 64 px + safe-top | Close · category name button (chevron) · "n / N" + 2 px progress |
| Category track | full screen, `x mandatory`, `direction: ltr` | one page per cycle entry, current ±1 mounted |
| Card track | per category page, `y mandatory`, `scroll-snap-stop: always` | one page per card + end page |
| Card page | `min-height: 100%`, padded for the bars | the card surface only, centred when short; 24 px `pan-y` strips at both sides |
| Dock | floating pill at the bottom | Previous card · card actions · Full view · Next card |
| Banner | top, under the top bar | "Recipes · 12 cards" (count when known), or "No next category" |
| Category list | panel from the top bar down to the dock, scrim behind | "Categories" + Close, rows ≥ 52 px |
| Full view | fixed overlay, own `y mandatory` scroller | sheet (Close, card surface, Categories, Details, Source) + transparent tail |

## 2. Moves

| Action | Gesture | Tap | Key | Accessible name |
|--------|---------|-----|-----|-----------------|
| Next card | swipe up | dock | `ArrowDown`, `PageDown` (tall card: scrolls 85 % first) | "Next card" |
| Previous card | swipe down | dock | `ArrowUp`, `PageUp` | "Previous card" |
| Next category | swipe left | list | `ArrowRight` | n/a |
| Previous category | swipe right | list | `ArrowLeft` | n/a |
| Open category list | tap the banner | category name | `Tab` + `Enter` | "Category: Recipes, choose another" |
| Pick a category | n/a | row | ↑/↓/Home/End + `Enter` | the row's name (+ count); current has `aria-current` |
| Close the list | tap outside, swipe | Close | `Escape`, system back | "Close categories" |
| Open full view | hold 500 ms | dock | `f` | "Full view" |
| Close full view | swipe up past the bottom | Close | `Escape`, system back | "Close full view" |
| Card category tap | n/a | category in full view | `Enter` | "Browse <name>" |
| Detected text | n/a | tap | `Enter` | "Call …", "Email …", "Open …", "Copy …" |
| Close Browse | system back | Close | `Escape` | "Close browse" |

Escape closes the innermost layer: list, then full view, then Browse.

## 3. Announcements

- Card change: "Card 3 of 25" in the polite live region (034).
- Category change: "Recipes, 12 cards" in the same region; the banner itself is `aria-hidden`.
- Copy: the toast ("Copied" / "Couldn't copy that number") is a status message.

## 4. States

As 034 §4, per category page: loading, empty and offline show one page with the list's copy. The
top bar, sideways swipes and the list stay usable; the dock is hidden.
