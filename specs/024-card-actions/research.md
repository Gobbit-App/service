# Research: Card actions and icon buttons

Decisions continue the project-wide D numbering. The Usability pass reserved D200–D216: 022-editor-navigation owns D200–D204, 023-editor-inputs D205–D209, and this feature owns **D210–D216**. D210–D212 set conventions every later screen follows, so they become **ADR-059** (icon set and icon buttons).

`/speckit-clarify` was skipped (the spec is detailed); the open points it would have raised are settled below.

## What exists today

- Card actions: Favorite (★/☆) and Share (⤴) sit in the card header; Edit, History, Archive, Restore, Delete, Undelete and the link-check buttons are text pills in a `card-actions` row **after** the `<article>`, so in a list they sit between two cards.
- Icons: Unicode glyphs (◂ ⚙ ✕ ↑ ↓ ‹ › × ← →) in a handful of places; every other button is text.
- Styles: `.button--danger` is defined twice in `styles.css`. The first is an outline (danger border and text); the later "ingest tokens" rule adds a danger **fill** but keeps the danger text colour → light-red text on a red block. `editor/editor.css` is lazy but defines `.icon-button` globally, so once the editor has been opened favorite/share/browse icon buttons gain a border and a surface fill.
- Browse (009): ↑ previous card, ‹ › category, ‹ › view and ↓ next card buttons around the card; the position "3 of 12" is `aria-hidden` text; swipes, keys, the category menu and the view tabs already cover every move.

## D210 — One hand-drawn inline SVG icon set

- **Decision**: `apps/web/src/ui/icons/icon-paths.ts` exports `ICON_PATHS: Record<IconName, string>` (SVG path data, absolute or relative commands, 24 × 24 grid, content kept inside 2–22 so round caps don't clip) and `FILLABLE` (icons with a filled variant, e.g. `star`). `Icon({ name, filled?, className? })` renders one `<svg>` with `viewBox="0 0 24 24"`, `width/height` from CSS (`1.25rem`), `fill="none"` (or `currentColor` when filled), `stroke="currentColor"`, `stroke-width="1.75"`, round caps and joins, `aria-hidden="true"`, `focusable="false"`. Directional icons (`back`, `forward`) get `icon--directional`, mirrored by `[dir='rtl'] .icon--directional { transform: scaleX(-1) }`; all others never flip, so RTL card content does not change them. Icons use `currentColor`, so forced-colours mode paints them in the button's text colour.
- **Set (initial)**: back, close, edit, star, share, more, trash, archive, restore, undo, history, settings, search, plus, copy, photo, upload, check (publish/save/done), reject, send, sign-out, refresh (check again/try again), external, arrow-up, arrow-down, arrow-left, arrow-right, browse, inbox, file-import, select, link, user-minus, key, eye, bell-off (dismiss), list. New icons follow the same rules (asserted by a unit test that parses every path's coordinates).
- **Rationale**: the spec asks for hand-picked inline SVG with no library; path strings are the smallest form (≈ 60–120 bytes each, ~2 KB gzip for the set) and need no extra request, sprite or build plugin. One renderer guarantees one stroke and grid (FR-003).
- **Alternatives considered**: an icon library (Lucide, Heroicons — ruled out by the spec, and per-icon imports still add a dependency); an SVG sprite file (extra request, caching, offline precache); icon font (blurry, accessibility issues); per-icon React components (more bytes per icon, harder to test the grid).

## D211 — Button primitives and where labels show

- **Decision**: three components in `ui/buttons/`:
  - `IconButton({ icon, label, tip?, pressed?, tone?, disabledReason?, filled?, ...button })` — `.icon-button` chiclet: 44 × 44 hit area, 20 px icon, `aria-label={label}`, `data-tip={tip ?? label}` (with `disabledReason` the tip reads "label — reason"), `aria-pressed` when `pressed` is given, `tone="danger"` → `.icon-button--danger`.
  - `IconLink` — the same look for a router link (`NavLink` underneath).
  - `Button({ icon, label, variant: 'primary' | 'ghost' | 'danger', ... })` — the existing `.button` pill with the icon and `<span class="button__label">label</span>`. Below 480 px the label span becomes visually hidden (same clip technique as `.visually-hidden`), so the accessible name is still the label and the tooltip (`data-tip`) takes over. A `labelAlways` option is not offered: the spec makes the rule universal (FR-005).
  - `disabledReason` (offline, busy) renders `aria-disabled="true"` instead of `disabled`, keeps the control focusable and hoverable (so the tooltip explains why), dims it and ignores clicks. Plain `disabled` stays for form states with a visible reason next to them (e.g. Save card with its reason line).
- **Scope**: action buttons and action links (anything that does or opens something: save, cancel, publish, delete, add, copy, upload, send, sign out, back, settings, history, browse, review, load more, try again). Selection controls are not action buttons and keep their text: tabs (browse views, editor tabs), filter and category chips, chip toggles in the editor, the search mode toggle, recent-search items, menu radio items, the card-type radio group, checkboxes. Their text **is** the choice.
- **Breakpoint**: 480 px viewport width. Spec AS-4 names "a phone" as the example of a width below the breakpoint; 480 px covers phones in portrait (320–430 px) and keeps labels on tablets and desktops.
- **Rationale**: one primitive per shape makes FR-004–FR-006 a property of the component rather than of 100 call sites; unit tests cover the component once. Keeping the label in the DOM (hidden) instead of switching to `aria-label` means the accessible name never changes with width and existing tests and e2e selectors keep working.
- **Alternatives considered**: container queries per button group (more CSS, harder to reason about, and not needed for the layouts we have); `title` attributes for tooltips (rejected in D212).

## D212 — Tooltips

- **Decision**: CSS draws the tooltip from `data-tip` with `::after` above the control (`position: absolute`, banner colours, small type, `pointer-events: none`, `white-space: nowrap`). Shown on `:hover` only inside `@media (hover: hover)` (no sticky hover on touch), on `:focus-visible`, and while `[data-tip-open]` is set. `ui/tooltip-press.ts` exports `installTooltipPress(root = document)`: delegated passive `touchstart` on the nearest `[data-tip]`, a 500 ms timer, cancel on `touchmove` beyond 10 px, `touchend` or `touchcancel`; when it fires it sets `data-tip-open`, removes it after 1.5 s or on the next touch elsewhere, swallows the click that ends the press (capture listener, once) and prevents the `contextmenu` on that element. It never calls `preventDefault` on `touchstart`/`touchmove`, so `@use-gesture` swipes and scrolling see every event; a press that moves becomes a swipe and never shows the tooltip.
- **Rationale**: no tooltip library and no per-button state; one listener of ~40 lines. Native `title` is skipped because it duplicates the accessible name for some screen readers, never appears on touch and looks inconsistent.
- **Alternatives considered**: a React `Tooltip` component with portal and positioning (bytes, re-renders, overkill for one-line labels); Popover API (`popover` + anchor positioning — not yet in iOS Safari for anchors).

## D213 — Actions inside the card

- **Decision**: `Card` gains `actions?: ReactNode` rendered in `<div class="card__bar" role="group" aria-label="Card actions">` as the last child of the `<article>`, separated from the content by a hairline. Without `actions` (search results, editor preview excluded) the bar holds Favorite and Share. `CardActionBar({ item, deckSlug, role, onDone? })` builds the full bar:
  - **bar**: Edit (`canEditItem`), Favorite, Share, then at most one state action — Restore (archived), Undelete (deleted), Check again (flagged link the role may check);
  - **"More actions" menu**: History (`event.list`), Archive, Dismiss (link note), Delete (destructive, `window.confirm(DELETE_CONFIRM)` kept, 006).
  - So a card shows at most 4 icons + "more" (5 × 44 px = 220 px) and fits a 320 px phone (288 px inside the card padding).
  - Lifecycle and link-check logic move from `CardActions`/`LinkCheckButtons` into hooks (`items/use-card-lifecycle.ts`, `useLinkCheckRun`) so the bar and the menu share them. Offline: lifecycle and link-check actions get `disabledReason: 'needs a connection'`; Edit, Favorite, Share and History are unchanged (they already behave offline as before).
  - The "Offline: these actions need a connection." line goes away; the reason moves into each disabled control's tooltip (spec edge case).
  - Review queue: `ReviewCard` puts Publish (new) or Apply update + Publish as new (update/duplicate), Edit (inline) and Discard in its own `card__bar`; "Edit fully" goes into "more". The reject action keeps its current wording "Discard" (the queue's toasts and docs say discard); its icon is `reject` and it uses the destructive tone.
  - `ui/MoreMenu.tsx` follows the APG menu button pattern (same as `browse/CategoryMenu`): `aria-haspopup="menu"`, `aria-expanded`, `role="menu"` with `menuitem`s, focus moves into the menu, Arrow/Home/End/Escape/Tab, closes on outside pointer. Menu items show icon + label (spec AS-3).
- **Rationale**: a single component makes SC-001 testable and keeps the role rules (`availableActions`, `canEditItem`, `linkCheckActions`) in one place. Putting Favorite/Share in the same bar as Edit gives one consistent action zone instead of two.
- **Alternatives considered**: keeping Favorite/Share in the header and adding a footer bar for the rest (two zones, more icons on small cards); an overflow algorithm that measures width (layout thrash; the fixed split already fits 320 px).

## D214 — One destructive style, scoped lazy CSS

- **Decision**: one `.button--danger` rule: transparent background, `border-color: var(--color-danger)`, `color: var(--color-danger)`; hover tints the background with `color-mix` 10 %. The later filled rule is deleted. `.icon-button--danger` and `.menu__item--danger` use `color: var(--color-danger)`. Contrast (WCAG relative luminance): light `#a12b2b` on surface `#ffffff` ≈ 7.6:1 and on bg `#fbf6ef` ≈ 7.0:1; dark `#f08a8a` on surface `#26201c` ≈ 7.0:1 and on bg `#1b1714` ≈ 7.8:1. `styles.test.ts` parses the tokens from `styles.css` (both themes) and asserts ≥ 4.5:1 for danger text, accent-on-accent-text (primary buttons) and muted icon colour on surface/bg (icons need 3:1 as non-text, text 4.5:1). The same test asserts the lazy stylesheets (`editor/editor.css`, `browse/browse.css`) contain no selector for a shared control class (`.button`, `.icon-button`, `.menu`) that is not prefixed by their own root (`.editor`, `.table-fields`, `.card-editor`, `.browse…`). `editor.css`'s table tools become `IconButton`s (shared style); its leaking `.icon-button` rule is removed.
- **Rationale**: the outline style keeps destructive actions quiet in lists and readable in both themes; a test on the tokens stops future regressions without a browser.
- **Alternatives considered**: filled red with white text (louder than the rest of the quiet UI and needs a second dark-theme token); CSS modules for scoping (a build change for one bug).

## D215 — Browse without arrow buttons

- **Decision**: remove the header's previous-card and previous/next-category buttons and the footer's previous/next-view and next-card buttons (and the now-unused dots row keeps showing the view position). The position label becomes `PositionMenu`: a menu button whose name is "Card 3 of 12" (visible text "3 / 12", or "3" while the total is unknown) with two menu items, Previous card and Next card (each `aria-disabled` at the ends). Category changes stay available through the category menu (already a menu button), views through the tabs. Swipes (`use-zone-swipe`) and keys (`browse-keys`) are unchanged. The close button becomes an `IconButton` with the `close` icon.
- **Rationale**: a menu button works the same for screen readers (VoiceOver, TalkBack), switch access and keyboard, unlike an ARIA slider whose adjust gestures are poorly supported on Android and would compete with the global arrow-key handler.
- **Alternatives considered**: `role="slider"` adjustable (inconsistent mobile AT support, key clash); visually hidden buttons (a focusable but invisible control confuses sighted keyboard users).

## D216 — E2E tier and the accessibility check

- **Decision**: E2E tier **smoke + full**. Smoke updates the existing journeys (deck list, lifecycle, browse, review, editor) for the new controls and asserts actions sit inside each card. Full adds `e2e/tests/full/card-actions.spec.ts`: axe (`@axe-core/playwright`, rules `button-name`, `link-name` and `color-contrast` limited to buttons and action links) on the deck list, card page, browse, review and editor in light and dark (`page.emulateMedia({ colorScheme })`); labels hidden at 360 px and shown at 1024 px with the same accessible name; a long-press shows the tooltip; offline actions are `aria-disabled` with the reason; archived and links lists use the bar; opening the editor then returning keeps button styles (computed border of the favorite button unchanged).
- **Rationale**: SC-003 asks for an automated check; axe is the standard engine, dev-only in `e2e/` (constitution VII: established library over custom code), and runs where real CSS is applied.
- **Alternatives considered**: hand-written contrast checks in e2e (re-implementing axe); `vitest-axe` in jsdom (no real CSS → no contrast).
