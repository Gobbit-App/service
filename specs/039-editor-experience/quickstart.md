# Quickstart: validate the composer (039)

## Prerequisites

`pnpm install`, Docker for the local stack, `pnpm dev` (API :3000, web :5173), signed in as the seeded
owner. For image cards, set the Cloudinary env (`README.md`). Without it, Image shows as unavailable.

## 1. Automated checks

```
pnpm typecheck && pnpm lint && pnpm test:unit
pnpm build:web && pnpm budget          # initial JS ≤ 150 KB gzip
pnpm test:e2e --grep @smoke            # create journey through the chooser
pnpm test:e2e --grep "composer"        # @full composer spec (widths, keys, axe)
```

## 2. Frame (US1)

Open a deck, then New card. There is no search box, no chip rail and no bottom bar. The top bar shows
Close, "New card" with the deck name, and Save. Open a card, then Edit: same top bar with "Edit card".
Close with unsaved text: "Discard changes?" appears. Back on the deck, the chrome is back.

## 3. Type choice (US2)

`/d/{slug}/new`: six tiles. Use Tab to reach them, arrows to move, Enter to pick: the composer opens on
that type with Title focused. `/d/{slug}/new?type=link` skips the chooser. In a new card, open the
type control, switch from a table with cells to Text: the confirm appears. Keep keeps the cells.
Switch drops them and keeps title and body.

## 4. Canvas, save and preview (US3–US6)

- Phone width (375 px): title and body sit at the top. Type 500 characters in the body and the
  counter appears. Focus the body on a touch device and the toolbar and Save sit above the keyboard.
- Leave the title empty on a link card and press Save: the first invalid field gets focus and Save
  reads "Fix 1 field".
- Tap Preview, then Preview again: back at the same scroll position with focus where it was.
- 1280 px: the editor is centred with the preview beside it and the preview stays in view. Ctrl+Enter
  saves and Escape leaves through the guard.

## 5. Manual device pass (owner, SC-006)

On a real phone (iOS Safari and Android Chrome) and a desktop, compare against Gmail compose and Bear
(D312). Check rotation with the keyboard open, right-to-left text, and reduced motion (sheets appear
without sliding).
