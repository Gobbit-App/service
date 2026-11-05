# Quickstart: validate 040

## Automated

```bash
pnpm --filter @gobbit/web exec vitest run src/browse src/cards   # unit
pnpm typecheck && pnpm lint
pnpm build:web && pnpm budget                                    # initial ≤ 150 KB, Browse lazy
pnpm test:e2e -- --grep @smoke tests/smoke/browse.spec.ts        # smoke journey
pnpm test:e2e -- tests/full/browse-rework.spec.ts                # variants
```

## By hand (390×844, Android Chrome; repeat the gesture checks on iOS Safari)

1. `pnpm dev`, sign in, make a deck with categories General (10 cards) and Links (3), one card
   with a phone number, an email, a web address and "Gate code 4821", and one long table card.
2. Open Browse from All. Only card content shows, on its own surface; a short card sits centred.
3. Swipe up and down: one card per swipe. On the long table, the content scrolls first.
4. Swipe left: General's first card and a banner "General · 10 cards" that is gone within 2 s.
   Swipe right twice: the "No previous category" banner, nothing moves.
5. Swipe sideways inside the table and from within 24 px of the screen edge: the category stays.
6. Tap the category name, pick Links. Reopen; close by tapping outside, by swiping, by Close and
   with system back. The category stays.
7. Hold a card (not a link) for half a second: full view with Categories, Details and Source.
   Text is selectable. Swipe up past the bottom: Browse shows through, release closes on the same
   card. Release early: springs back.
8. In full view tap a category: Browse switches to it on the same card, with the banner. Close
   Browse: you land on that category's list with the card in view.
9. Tap the phone (dialer), the email (mail app), the web address (new tab), "4821" ("Copied").
10. Keyboard (desktop): ↑/↓ cards, ←/→ categories, `f` full view, Escape closes list → full view
    → Browse.
11. Clear storage, reload: the "How to browse" sheet shows once.
