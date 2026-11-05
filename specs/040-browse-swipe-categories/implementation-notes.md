# Implementation notes: 040 Browse rework

Decisions the plan didn't make, and deviations from it. At close-out these are copied into
"Deviations from the 040 plan" in [`docs/design/browse-mode.md`](../../docs/design/browse-mode.md).

## Decisions made while implementing

- **Track logic lives in `browse/use-category-track.ts`.** The outer track's settle, `visits`
  (remount counters), `jumpTo(slug, itemId?)` and `step(direction)` sit in one hook, so
  `BrowseScreen` only wires layers, keys and chrome.
- **The ends watcher is `browse/use-end-pull.ts`**: a passive touch listener on the outer track
  that reports a sideways pull of more than 48 px at the first or last category (D329). Touches
  that start on a table card or an edge strip are ignored.
- **The dock and the live region moved from `BrowseStack` to `BrowseScreen`.** Only the
  current category's track reports its current card (`onCurrent`), and one dock and one live
  region read it. That avoids a dock per mounted track.
- **`Card` gained a `titleId` prop.** Full view renders the same card as the page underneath, and
  two headings with the same id would break `aria-labelledby`.
- **Detected nodes are mdast `emphasis` nodes with `data.hName = 'span'`.** mdast has no generic
  inline node that `mdast-util-to-hast` passes through with properties, and `emphasis` is the
  one whose children render unchanged. The `span` renderer turns them into `Detected`.
- **The detection context type lives in `cards/text-detection.ts`; the provider, plugin and
  `linkify-it` live in `browse/detect/`.** `TextCard` and `TableCard` import only the context,
  so the list, the editor preview and public pages never load the detector (Browse stays lazy).
- **Toasts gained `timeoutMs`** (`ui/toast-store.ts`, `UndoToast`) for the 2 s copy confirmation.
  The default stays 6 s.
- **E2E seed helpers moved to `e2e/tests/smoke/helpers/browse-deck.ts`** so the smoke and the
  nightly spec share the 25 + 3 card deck and the locators.

## Deviations from the plan

- **T022 reuses `ui/use-long-press.ts`** (036's long press for the + button) instead of a new
  Browse hook. It already had the 500 ms timer, the 10 px slop and `contextmenu` suppression; Browse
  adds only its excluded targets (`a, button, input, textarea, select, [data-detect]`).
- **The category list is a `ui/sheet/Sheet`** (bottom sheet on phones, centred dialog above
  600 px), not a panel from the top (D331). The native `<dialog>` gives the scrim, focus trap,
  Escape and backdrop tap that D331 asked for, the rows still sit in thumb reach, and it matches
  the composer's sheets (ADR-071).
- **The banner is a pointer-only shortcut.** It is `aria-hidden`; a tap opens the list. Keyboard
  and screen-reader users get the same list from the top bar's category button, and the banner's
  text goes through the polite live region.
- **The detected number's copy control is a native inline `<button>`**, not `ui/buttons`. It is
  part of a sentence and has no icon; ADR-059 covers actions with icons.
- **The depth animation is vertical and runs on `.browse-card`** (`animation-timeline: view()`),
  not on the page, so an oversized (tall) page doesn't fade while it is read.
- **E2E was not run locally.** The specs (`smoke/browse.spec.ts`, `full/browse-rework.spec.ts`)
  typecheck and are left to CI, which runs them against the PR's stack with the seeded smoke
  session.
- **A category being left reopens on its first card even before the address updates.** The
  track remounts the stack it leaves (D328) in the same render in which the address still names
  that category and its `i`, so the stack froze on the card the reader left. `cardTarget()`
  (`browse/card-target.ts`) keeps a settle's or jump's targets until the address arrives. Found
  by reproducing the CI failure against the built app; the smoke test now reads on in MAIN first.
- **The e2e card swipe drags 65 % of the screen.** CDP touches end without a fling, so mandatory
  snapping returns to the nearest card; a 50 % drag minus the touch slop stayed short of half a
  page and snapped back. Real phones fling, so this is a test-helper fix, not an app change.
