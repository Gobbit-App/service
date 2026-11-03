# Quickstart: validate 036

## Automated

```sh
pnpm typecheck && pnpm lint && pnpm test:unit
pnpm build:web && pnpm budget          # initial JS ≤ 150 KB gzip
pnpm compose:up && pnpm test:e2e        # @smoke + e2e/tests/full/bottom-bar.spec.ts
```

## By hand (phone, `pnpm dev` on the LAN or the deployed app)

1. **Deck page**: open a shared deck. The bar shows ⋯ on the left, Browse and Review in the middle and + on the right. Scroll to the bottom: the bar stays, and the last card is fully visible above it.
2. **Short press on +**: the menu opens with New card, Paste or share, Import and Shares. A tap outside closes it.
3. **Long press on +**: hold it. After about half a second the editor opens. No iOS callout or text selection appears, and no menu flashes.
4. **⋯ menu**: Settings opens one page with "This deck" and then "Your account". Back returns to the deck.
5. **Sign out**: ⋯ → Sign out shows your email, and choosing it signs you out.
6. **Deck list**: + opens the New deck form with the name field focused.
7. **Reader**: as an invited reader, the bar shows ⋯ and Browse only.
8. **Browse**: no bottom bar shows; Browse's own dock is unchanged.
