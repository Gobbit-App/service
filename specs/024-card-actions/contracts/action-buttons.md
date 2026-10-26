# Contract: Card action bar and icon buttons (UI)

No HTTP contract changes. This is the UI contract other screens and tests rely on.

## 1. Icon buttons

- Every action button or action link renders an `<svg>` from `ui/icons` (stroke 1.75 on a 24 grid, `currentColor`, `aria-hidden`).
- Icon-only controls have `aria-label` = their action name and `data-tip` = their tooltip. Toggles expose `aria-pressed`.
- Labelled buttons contain `<span class="button__label">`; below 480 px it is visually hidden. The accessible name is the same at every width.
- Hit area ≥ 44 × 44 px; `:focus-visible` shows the 3 px accent ring.
- A control that can't run right now (offline, busy) has `aria-disabled="true"`, stays focusable, ignores clicks and its tooltip ends with the reason ("Archive — needs a connection").

## 2. Card bar

- Each card (`<article class="card">`) ends with `<div class="card__bar" role="group" aria-label="Card actions">`. No action control is rendered outside an `<article>` in item lists.
- Accessible names: `Edit`, `Add to favorites` / `Remove from favorites`, `Share`, `Restore`, `Undelete`, `Check again`, `More actions`; in the menu (`role="menu"`): `History`, `Archive`, `Dismiss`, `Delete`.
- `Delete` asks `Delete this card? You can undo it for 30 days.` before running, then shows the existing toast with Undo.
- Review cards: `Publish` or `Apply update` + `Publish as new`, `Edit`, `Discard`; menu: `Edit fully`.

## 3. Destructive style

- `.button--danger`, `.icon-button--danger`, `.menu__item--danger`: text/icon `var(--color-danger)` on the surface, ≥ 4.5:1 in light and dark.

## 4. Browse

- No buttons named `Previous card`, `Next card`, `Previous category…`, `Next category…`, `Previous view`, `Next view` are rendered as standalone buttons.
- `Card n of N` is a menu button; its menu has menu items `Previous card` and `Next card`.
- `Close browse` stays (icon `close`). Category menu and view tabs unchanged.

## 5. Tooltip

- Hover (hover-capable pointers), keyboard focus and a 500 ms still touch-press show the tooltip text. A press that moves more than 10 px does not, and the swipe proceeds.
