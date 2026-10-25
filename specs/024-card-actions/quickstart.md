# Quickstart: Card actions and icon buttons

Validates [spec.md](./spec.md). Setup per `README.md`; no AI key needed. Contract: [action-buttons](./contracts/action-buttons.md).

## 1. Automated

```sh
pnpm test:unit                 # icons, buttons, tooltip press, menu, card bar, browse bands, styles checks
pnpm build:web && pnpm budget  # ≤ 150 KB, growth ≤ 6 KB vs 114.7 KB
pnpm test:e2e -- smoke/web.spec.ts smoke/lifecycle.spec.ts smoke/browse.spec.ts smoke/review.spec.ts full/card-actions.spec.ts
```

## 2. By hand (`pnpm dev`, a 360 px window, then a desktop window)

1. Open a deck: each card ends with a bar of icons (Edit, star, share, ⋯) inside its border; nothing sits between cards.
2. Long-press the pencil → "Edit" tooltip; release → no navigation. Tap → editor opens.
3. ⋯ → History, Archive, Delete with icons; Delete is red, asks to confirm, then shows "Card deleted · Undo".
4. Archived list: Restore in the bar; links list: Check again in the bar, Dismiss in ⋯.
5. Desktop: hover any icon → tooltip; Tab → focus ring; "Save card" shows its label; at 360 px only the icon.
6. Open the editor, go back to the list: the star and share icons look the same as before.
7. Dark theme: Delete and Remove member are readable.
8. Browse: no arrows; swipe up/down/left/right still moves; "3 / 12" opens Previous/Next card; ✕ icon closes.
9. Devtools offline: Archive/Delete dim; their tooltip says "needs a connection".
10. Review queue: Publish, Edit, Discard icons in the card; ⋯ → Edit fully.
