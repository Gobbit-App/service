# Quickstart: validate Browse mode

**Feature**: [spec.md](./spec.md) · **Contract**: [contracts/browse-ui.md](./contracts/browse-ui.md)

## 1. Local validation

```sh
pnpm install
pnpm compose:up            # or: Postgres via Compose + `pnpm dev`
pnpm db:migrate && pnpm db:seed
pnpm dev                   # API :3000, worker, web :5173
```

1. **Test data**: sign in as the seeded owner. In a shared deck, create two categories ("Food", "School"). Add 25 text cards to Food (more than one page of 20), 3 to School, and at least one image card. For entities, add a link card that the worker extracts, or use a card already reviewed in Phase 5.
2. **Open Browse**: open the Food list and press **Browse** in the deck header. The URL is `/d/<slug>/browse?c=food&i=<id>`, the first card fills the screen, and the deck chrome is gone.
3. **Paging and prefetch**:
   - Press `PageDown` 21 times. The cards move one at a time, and card 21 is there without waiting. The network panel shows page 2 requested around card 17 (n−3).
   - The browser's back history did not grow: one back press leaves Browse.
4. **Category change**: press `ArrowRight`. The header shows "School" at card 1 of 3. Pressing `ArrowRight` again at the last category does nothing.
5. **Panes**: Tab to the pane tabs, choose **Details**, then `PageDown`. The next card also opens on Details. A card without entities says so.
6. **Address round trip**: copy the URL, reload, and you land on the same category, card and pane.
7. **Close**: browse to card 7 of Food and press `Escape`. The Food list shows card 7 in view. Repeat with the browser back button.
8. **Deep link**: open `/d/<slug>/browse?i=<archived-card-id>`. You get the first card and "That card isn't available here".
9. **Offline**: in DevTools, set Network to Offline. Browse Food (cached) normally. Switch to a never-opened category: the offline copy appears and the header still works.
10. **Budget**: `pnpm build:web && pnpm budget` passes. `@use-gesture` appears only in the browse route chunk (T009 manifest check).

Automated:

```sh
pnpm test:unit
pnpm test:e2e -- --project=web-smoke --grep browse
```

## 2. Device demos (deployed instance)

Run these on the deployed instance after CI reports the commit on `/version.json`.

- **Demo 3 (SC-001)**:
  1. On a phone, open a category with 10+ cards.
  2. Tap **Browse** and swipe up through 10 cards.
  3. Swipe the header left to change category.
  4. Swipe the footer left to see a card's details (entities).
  5. Close and confirm the list position.
- **System gestures (SC-002)**:
  - On iOS Safari (installed PWA and in a tab), start a back-swipe at the left edge from the header, middle and footer: 10/10 leave Browse.
  - On Android with gesture navigation, the same from either edge: 10/10.
  - Pull down on the first card: no page reload.
- **Demo 4 (SC-003)**:
  1. Hand the phone, with the first-run overlay not yet dismissed on it, to a member who hasn't seen the screen.
  2. Ask them to "look at the next card, then the cards in another category".
  3. Time it, with no explanation. Pass: both done within 60 s.
  4. Note which affordance they used (gesture or button) in implementation-notes.md.
- **Tall card**: open a long table card. Swiping up scrolls inside the card first and moves to the next card only at its end.

## 3. Performance trace (Demo 5, SC-004)

Prerequisite: a mid-range Android phone, connected by USB with developer options and USB debugging enabled.

1. Prepare a category with 20 image cards (upload via `008-card-media`, or image cards with existing assets).
2. On the desktop, open `chrome://inspect/#devices`, then inspect the Browse tab running on the phone.
3. Performance panel: enable **Screenshots**, leave CPU throttling off (it's a real device), clear the cache once, then load Browse at card 1.
4. Record, swipe up through all 20 cards at a normal reading pace, then stop.
5. Check:
   - **Main**: no task with the red long-task marker (> 50 ms) during the swipes. Note the longest task.
   - **Frames**: no run of dropped frames during a snap.
   - **Network**: each card's image request starts before it becomes current, and the current card's request has priority "High".
   - **Elements**: at any moment at most three `.browse-page__content` subtrees are rendered (±1).
6. Save the trace locally (don't commit it) and record the longest task and device model in implementation-notes.md. If the check fails, profile the long task, then fix it and re-run before ticking demo 5 in PLAN.md.
