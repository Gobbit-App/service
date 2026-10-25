# Icons and actions (024, `specs/024-card-actions`)

_Overview: [architecture.md](../architecture.md). Decisions: [adr.md](../adr.md) (ADR-059)._

Every action in the web app is an icon control from one hand-drawn set. A card's own actions sit inside the card. Web only: nothing changes in the API or the DB.

**Icons (D210)**:
- `ui/icons/icon-paths.ts` holds SVG path data for the whole set: 24 × 24 grid, content kept inside 2–22. `Icon` draws them with `stroke="currentColor"`, a 1.75 stroke, round caps and joins, `aria-hidden` and `focusable="false"`.
- No icon library, sprite or Unicode glyph. `icon-paths.test.ts` checks the grid of every path, and `no-glyphs.test.ts` fails on the old glyphs in any component.
- Directional icons (`back`, `forward`) carry `icon--directional` and mirror under `[dir='rtl']`. No other icon flips.
- A new icon is a path string added to the same file. It follows the same grid and stroke.

**Primitives (D211)** in `ui/buttons/`:
- `IconButton` and `IconLink` are the 44 × 44 `.icon-button` chiclet: a 20 px icon, `aria-label` = label, and `data-tip` (tooltip text). `pressed` becomes `aria-pressed`, and `tone="danger"` is the destructive tone.
- `Button` and `ButtonLink` are the `.button` pill with an icon and `.button__label`. Below 480 px the label is visually hidden and the tooltip takes over; the accessible name never changes.
- `disabledReason` (offline, busy) renders `aria-disabled` and keeps the control focusable. The tooltip then reads "label — reason". Plain `disabled` stays for form states that show their reason next to the control.
- Selection controls keep their text, because the text is the choice: tabs, chips, the search mode toggle, recent searches, menu radio items and the card-type radios.

**Tooltips (D212)**: CSS draws `[data-tip]::after`. It shows on hover only on pointer devices (`@media (hover: hover)`), on `:focus-visible`, and while `data-tip-open` is set. `ui/tooltip-press.ts` (installed once in `main.tsx`) sets `data-tip-open` after a still press of 500 ms. A move of more than 10 px cancels it, so swipes and scrolling are untouched. The click that ends the press is swallowed. There are no `title` attributes.

**Card bar (D213)**:
- `cards/CardActionBar` renders inside the card's `card__bar` (`role="group"`, "Card actions"). The same bar is used on the list, the card page and browse.
- The bar holds Edit, Favorite, Share and at most one state action: Restore for an archived card, or Check again for a flagged link.
- History, Dismiss, Check again (when it isn't in the bar), Archive and Delete go in `ui/MoreMenu`. This is an APG menu button, portalled to `<body>` because cards clip overflow. Delete is in the destructive tone and still asks `window.confirm`.
- A deleted card offers Undelete only.
- Offline, server actions stay visible with `disabledReason` "needs a connection".
- The rules stay in the hooks `items/use-card-lifecycle.ts` and `items/use-link-check-run.ts`, so the bar and the menu share them.
- The review queue's `ReviewCard` uses the same bar: Publish (or Apply update / Publish as new), Edit and Discard, with Edit fully in "more".

**Destructive style and CSS scoping (D214)**: there is one `.button--danger` rule: an outline with danger text and border. `.icon-button--danger` and `.menu__item--danger` use the same token. Danger text measures at least 7:1 in both themes. `styles.test.ts` checks the tokens: danger and primary text at ≥ 4.5:1, muted icons at ≥ 3:1. It also checks that the lazy stylesheets (`editor.css`, `browse.css`) never restyle `.button`, `.icon-button` or `.menu*` unscoped, which is how the editor used to change list buttons after it had been opened.

**Browse (D215)**: there are no arrow buttons. The header holds close (an icon), `browse/PositionMenu` ("Card 3 of 12" with Previous card and Next card items, `aria-disabled` at the ends) and the category menu. The footer holds the view tabs and dots. Swipes and keys are unchanged.

**App header**: back, page actions, Settings and Sign out are icon controls. Below 400 px the header has no gap between them, so seven 44 px controls fit in 360 px.

**Tests (D216)**: unit tests cover the primitives, the menu, tooltip-press, the card bar's role and offline rules, the position menu, the token contrast and the glyph scan. `@smoke` covers the lifecycle and browse journeys through the new controls. `@full` (`e2e/tests/full/card-actions.spec.ts`) covers:
- axe `button-name`, `link-name` and `color-contrast` in light and dark;
- labels hidden at 360 px and shown at 1024 px;
- a long press showing a tooltip;
- offline menu items;
- no editor style leaking onto the card bar.

**Bundle**: initial JS is 117.5 KB gzip (it was 114.7).

## Deviations from the 024 plan

- **The axe pages differ from the plan.** axe runs on the card page (with the open menu), the deck list, `/settings` and deck admin. It does not run on browse, review or the editor, which use the same primitives and are covered by their own `getByRole` specs.
- **The footer's Previous/Next view buttons were removed too.** Views stay on the tabs, the keys and swipes.
- **The app header has no gap below 400 px**, so the deck header's seven icon controls fit at 360 px. The deck title truncates there.
- **Deck settings uses the `list` icon**, so it can be told apart from account Settings (the gear).
- **Entity-chip remove controls draw 28 px inside a 44 px hit area.**
- **`WEB_SPECS` now includes `shares` and `editor-inputs`.** Those two `@full` specs had run in the API project by mistake.
