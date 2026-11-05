# Research: First-class card composer (039)

Decisions use the range reserved by the spec, **D300–D319**. Everything here is web-only: no API,
database or contract change (FR-021).

## D300 — The composer is its own frame, outside the deck chrome (ADR-071)

- **Decision**: `/d/{slug}/new` and `/i/{id}/edit` render one `ComposerFrame`: a slim sticky top bar
  (`ComposerTopBar`: Close on the leading side, "New card" / "Edit card" over the deck name, the
  Preview toggle below the tablet breakpoint, Save on the trailing side) above the writing surface.
  `DeckLayout` returns a bare `<Outlet/>` for the new-card route, just as it does for Browse. The edit
  route drops `AppHeader` and the `.page` wrapper. Close is a link to the existing back target (D200),
  so the leave guard (D201–D204) keeps catching it. The top bar sits inside the `<form>`, so Save is a
  real `type="submit"` button.
- **Rationale**: The deck search, chip rail and bottom bar are deck navigation. The composer is a task
  you finish or abandon, so it gets the full screen, as composers do in mail and notes apps. Rendering
  the frame from `CardEditor` gives create and edit the same frame without a new layout route.
- **Alternatives**: hiding the deck chrome with CSS on `/new` (it would still mount, fetch and stay in
  the tab order); a pathless layout route for both screens (it moves files and route ids, so analytics
  patterns (033) and the back targets change for no gain).

## D301 — Type chooser: tiles in a single-choice group, picking navigates

- **Decision**: With no `?type=`, the new-card route shows `TypeChooser`: one tile per creatable type
  (six since 037 added Reminder; the spec says five) with an icon, a name and a one-line hint.
  Semantics: `role="radiogroup"` named "Card type", tiles are `role="radio"` buttons named by their
  type name and described by their hint, with a roving tabindex. Arrow keys (and Home/End) move focus.
  Enter, Space, a tap or a click picks. Picking does a replace navigation to `?type=X` (so Back leaves
  the composer instead of returning to the chooser) and focuses the title. Image without storage is
  `aria-disabled` and shows the reason (`IMAGES_UNAVAILABLE`) inside the tile.
- **Rationale**: The radiogroup gives FR-007's "named group, arrow keys, selected state" with native
  screen-reader support. The APG radio pattern selects on arrow. Here selecting starts the composer,
  so arrows only move focus and picking is explicit. Hints are written for new members ("Link: save a
  page with its preview").
- **Alternatives**: a segmented control (six labels don't fit 320 px, per the spec's assumption); a
  `listbox` (wrong semantics for a one-off choice); auto-select on arrow (navigates on every key press).

## D302 — When the chooser is skipped

- **Decision**: The chooser is skipped when (a) `?type=` names a creatable type the deck can use, or
  (b) no `?type=` is given and an unsaved new-card draft exists for the deck: the composer opens on
  the type of the most recently saved draft so the restore offer shows (spec edge case). `?type=image`
  without image storage shows the chooser with Image unavailable and its reason. An unknown `?type=`
  is dropped by `validateSearch` and shows the chooser.
- **Rationale**: Shortcuts and shares keep their one-tap entry. A draft someone left behind is never
  hidden behind a chooser that offers no hint of it.
- **Alternatives**: a "Continue draft" tile on the chooser (more UI for a rare case); keeping today's
  silent fallback to Text for an unavailable image (the spec asks for the reason to be shown).

## D303 — In-composer type control, with a confirm before losing content

- **Decision**: New cards show a compact type control (icon + type name + chevron) at the top of the
  writing area. It opens the same tiles in a `Sheet` (D304). Switching keeps title, body, categories
  and source and applies D271 (an untouched card rebaselines onto the new type's sample). When the
  current payload holds content the new type can't keep (`payloadHasContent(draft)` is true: a link
  URL or preview, a photo, table cells, calc fields or reminder settings that differ from that type's
  start), a confirm sheet asks "Switch to {Type}?" ("Your {current} content will be removed.") with
  Switch (danger) and Keep (default focus) before switching. Edit shows a read-only label with the
  type's icon.
- **Rationale**: The spec requires a confirm (US2-4). Comparing with the type's starting payload makes
  an untouched sample switch freely.
- **Alternatives**: keep the old payload around to switch back to (it would be saved with the wrong
  type, and drafts are keyed by type anyway).

## D304 — One sheet pattern on the native dialog (ADR-071)

- **Decision**: `ui/sheet/Sheet.tsx` wraps `<dialog>` + `showModal()`: a bottom sheet with the actions
  at thumb height below 600 px, and a centred dialog from 600 px. It has one elevation, a 20 px radius
  and a ≤ 220 ms rise or fade, which is removed under `prefers-reduced-motion`. Escape and the
  backdrop close it through `onClose`. Focus moves to the given initial control and returns to the
  opener. The leave guard (`DiscardChangesDialog`, still shared with the review queue), the type
  picker and the type-switch confirm use it. The 038 colour picker and link row stay inline panels
  attached to the toolbar (see the deviation note in `implementation-notes.md`). Restore draft is an
  inline card (US7-3).
- **Rationale**: The native dialog provides a focus trap, inert background, Escape and top-layer
  stacking without a library (FR-018, FR-024).
- **Alternatives**: a portal-based modal (re-implements inertness); `popover` on desktop (two
  patterns to maintain).

## D305 — Keyboard dock on touch screens via `visualViewport`

- **Decision**: `useKeyboardInset()` listens to `visualViewport` `resize`/`scroll` and writes
  `--kb-inset` (the height the on-screen keyboard covers: `innerHeight − (vv.height + vv.offsetTop)`,
  0 when unsupported) on the composer root, plus `data-keyboard="open"` above a 120 px threshold.
  On coarse-pointer screens below 768 px, while the keyboard is open and a composer field has focus,
  a `ComposerDock` is fixed at `bottom: var(--kb-inset)`. It holds a compact Save. While the body has
  focus, the 038 formatting toolbar moves into the same strip with CSS (`position: fixed`, one
  horizontally scrolling row), so its DOM and tab order stay as 038 built them. The writing area gets
  bottom padding equal to the dock, so the caret never sits under it.
- **Rationale**: iOS Safari doesn't resize the layout viewport for the keyboard, and Android only does
  so with `interactive-widget`, which would change every page. `visualViewport` works on both and
  degrades to an inset of 0.
- **Alternatives**: moving the toolbar with a portal (changes tab order and remounts the panels);
  `interactive-widget=resizes-content` in the global viewport meta (affects the whole app, Chromium
  only).

## D306 — Composer order and sections

- **Decision**: Order: type control (new) or type label (edit) → leading media for types that lead
  with it (`link`: URL, fetch preview and photo; `image`: photo and description) → headline title →
  body (038 editor, borderless on the canvas) → the type's section for the other types (titled
  "Table", "Calculator", "Reminder"; Text has none) → "Details" (categories, source, then the entity
  chips on agent proposals). Type sections and Details are `<section aria-labelledby>` with a small
  heading.
- **Rationale**: US3-1 and FR-008–FR-010. A link card starts from its URL, which drives the preview.
- **Alternatives**: splitting the link fields so the URL sits after the body (the preview would then
  sit above the field that fetches it).

## D307 — Counters from 80 %

- **Decision**: `LimitMeter` shows "used / max characters" from 80 % of the limit and always when over
  it (`shouldShowCount`). It is still announced from 90 % as today. Counting is unchanged.
- **Rationale**: FR-011. A permanent counter adds noise to a calm canvas.

## D308 — Save: top bar, blocked reason, focus the first invalid field

- **Decision**: Save in the top bar uses `disabledReason` (`aria-disabled`, the reason as a tip, and
  as visible text under the top bar on narrow screens) instead of `disabled`, so it stays focusable
  and explains itself (ADR-059). A Save attempt while blocked by field errors shows every client
  error (even on an unchanged card) and focuses the first `[aria-invalid="true"]` field in the form,
  scrolling it to the centre. A save refused by the server focuses the first invalid field once the
  errors render. While saving, Save is `aria-busy`, shows "Saving…", and the form ignores further
  submits. The form-level error renders in `ComposerErrorBanner` (`role="alert"`) at the top of the
  writing area.
- **Rationale**: FR-013 and US4. ADR-059 already uses `aria-disabled` with a reason elsewhere.

## D309 — Preview: a toggle on phones, side by side from 768 px

- **Decision**: Below 768 px the top bar's Preview toggle (`IconButton`, `aria-pressed`) swaps the
  canvas for the preview. Both stay mounted (`hidden`), as the old tabs did. Leaving the preview
  (toggle or Escape) restores the window scroll position and refocuses the element that had focus.
  From 768 px the composer is a two-column grid (editor up to 40 rem, preview up to 24 rem) with the
  preview `position: sticky` under the top bar, and there is no toggle. `EditorTabs` is removed.
- **Rationale**: US5. The tabs read as a document toolbar. The toggle is the pattern the spec names.

## D310 — Keyboard shortcuts

- **Decision**: `useComposerShortcuts` on the composer root: Ctrl/Cmd+Enter calls
  `form.requestSubmit()`. Escape closes the preview on narrow screens first, otherwise navigates to
  the back target (so the leave guard decides). It is ignored when the event was already handled
  (`defaultPrevented`), when a `dialog[open]` exists, or when focus is inside the rich editor's open
  panel (colour or link row), which closes itself on Escape.
- **Rationale**: FR-015 and US6-2.

## D311 — Composer tokens

- **Decision**: New theme tokens in `styles.css`: type scale `--text-xs … --text-2xl`, spacing
  `--space-1 … --space-6` (4, 8, 12, 16, 24, 32 px), `--elevation-1 … 3`, `--radius-sm` 8 px and
  `--radius-lg` 20 px, motion `--motion-fast` 120 ms and `--motion-base` 220 ms with `--ease-out`
  (both 0 ms under reduced motion). They extend the existing colour tokens with no new colours, so
  light and dark contrast stays as audited (FR-017). Breakpoints stay literals (600 px sheet,
  768 px tablet, 1024 px desktop) because CSS custom properties can't be used in media queries.
- **Rationale**: FR-017 and FR-019, without a UI kit (FR-024).

## D312 — Reference apps for the owner review (SC-006)

- **Decision**: The owner compares the composer side by side with the **Gmail** compose screen
  (Android and web) and **Bear** (iOS and macOS) on a phone and a desktop before merge.
- **Rationale**: One mail and one notes composer, each on both form factors, as the spec suggests.

## D313 — E2E tier: smoke + full

- **Decision**: `@smoke`: the create journey (open New card, pick Text from the chooser, write, save,
  see the card). Existing smoke editor tests switch from radio/tab/Cancel selectors to the chooser
  tiles, the Preview toggle and Close. `@full` (`e2e/tests/full/composer.spec.ts`): no deck chrome on
  `/new`; keyboard-only type pick; type switch confirm (cancel and accept); preview toggle restores
  focus; Ctrl+Enter saves; Escape goes through the leave guard; no sideways scroll and no target under
  44 px at 320, 375, 768 and 1280 px; axe on the chooser, the composer, the preview and an open sheet
  in light and dark.
- **Rationale**: Constitution V. Creating a card is a critical journey and its selectors change.
