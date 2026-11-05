# 039 — Implementation notes

Decisions the plan didn't make and deviations from it, recorded while implementing. At close-out
the deviations are copied into `docs/design/card-editor.md` → "Deviations".

## PR1 — frame, Save, shortcuts (US1, US4, US6)

- **Blocked Save reports the attempt.** `Button` gained `onBlockedClick` (passed to
  `guardClick`): a blocked Save stays `aria-disabled` (focusable, described by its reason) and a
  click still reveals the field errors and the reason (D308). Mod+Enter goes through
  `form.requestSubmit()`, so the blocked case is handled in `onSubmit` too.
- **Errors appear after a change or a Save attempt.** A fresh card no longer shows "Title is
  required" on load; the reason under Save is visually hidden (still the button's description)
  until then.
- **The reason is a pill hung under Save**, positioned absolutely so the sticky rich toolbar
  offset (`--safe-top + 61px`, the same height as the composer bar) does not move.
- **Escape layering.** The colour panel and link row close on a capture-phase Escape and mark it
  handled; the composer listens in the bubble phase and skips handled events, IME composition and
  any open `dialog`. The panels stay inline (not sheets) in PR1.
- **Deck layout.** `DeckLayout` returns a bare `<Outlet/>` for `/new` as it already did for
  Browse; `BottomBar` is now rendered unconditionally in the remaining branch.
- **No route unit test for the bare layout** (the repo has no route-level unit tests); the
  absence of deck chrome on `/new` and edit is covered by `e2e/tests/full/composer.spec.ts`.
- **E2E names.** "Save card" → "Save", the editor's "Cancel" button and header "Back" → the top
  bar's "Close" link across smoke and full specs.

## PR2 — type chooser and type control (US2)

- **The type control is its own `<button>`, not a `ui/buttons` action.** It is a select-like
  disclosure (icon, current type and chevron always shown, `aria-haspopup="dialog"`), which the
  action buttons don't model; the same exception the editor's tabs had. Its name is
  "Card type: {Label}".
- **Tiles focus after the sheet opens.** `TypeTiles` focuses its start tile in a microtask:
  children's effects run before the enclosing `Sheet` calls `showModal()`, so focusing at once
  would land in a closed dialog and the sheet would remember the tile, not the type control, as
  the place to return focus to.
- **`ComposerHeader` extracted.** The chooser and the composer share the bar (Close, heading,
  deck); `ComposerTopBar` is the header plus Save, its reason and the progress line.
- **The chooser waits for config and the drafts read.** `/new` shows the loading state until the
  config (image storage) and, without `?type=`, the latest new-card draft are known, so the
  chooser never flashes before the composer opens on a resumed draft (D302).
- **Title focus after a pick lives in the route.** Picking sets a `picked` flag before the replace
  navigation; the composer gets `focusTitle` and focuses the title through a new `inputRef` on
  `TextInput`/`TitleField`. A deep link (`?type=`) or resumed draft does not steal focus.
- **`?type=image` without image storage shows the chooser** (Image unavailable, saying why)
  instead of opening a text card as before.
- **Unavailable tiles are `aria-disabled`, not `disabled`,** so they stay in the arrow-key order
  and keep their reason readable.
- **E2E.** Specs that wanted a text card on a bare `/new` now use `?type=text`; the add-from-menu
  and link journeys (`@smoke`) pick from the chooser.
