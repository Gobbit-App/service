# Quickstart: First run for invited people

How to check the feature end to end. The API is in `contracts/welcome.md`; the column and backfill are in `data-model.md`.

## Automated

```sh
pnpm db:migrate                       # 0031_membership_welcome
pnpm test:unit                        # DeckWelcome, consent gate, pending store, Browse hint gate
pnpm test:int                         # decks.service welcome, DELETE /decks/{id}/welcome, backfill, link accept inviter
pnpm test:e2e -- --grep "invite link" # @smoke: join by link → consent wall → welcome → closed for good
pnpm test:e2e -- --grep "welcome"     # @full: mailed invite, categories, search, second device
```

## By hand (`pnpm dev`, analytics configured so the consent wall shows)

1. **Owner** (seeded account): create a deck with two categories and a few cards. In Settings → Members, create a reader link.
2. **New person**: open the link in a private window, tap Join, enter a new `example.test` address and follow the mailed link.
   - **Expect**: the deck opens, and the consent wall shows alone.
3. Answer the consent question.
   - **Expect**: the welcome names the deck and the owner's shown name, then "You're a Reader: read only". It offers Categories, Search and Start reading. No email address appears.
4. Tap **Categories**.
   - **Expect**: Browse opens with the category list over it. Pick one; the list closes, then "How to browse" shows.
5. Go back to the deck and reload.
   - **Expect**: no welcome.
6. Sign in as the same person in a second browser.
   - **Expect**: no welcome (dismissal lives on the membership).
7. **Offline close**: invite a third person and accept. In DevTools set Offline, then close the welcome.
   - **Expect**: it stays closed after a reload.
   - Go back online. **Expect**: `DELETE /decks/{id}/welcome` is sent and the second browser shows no welcome for that person.
8. **Regressions**:
   - **Expect**: the owner never sees the welcome on their own deck or on the personal deck.
   - **Expect**: a member accepted before `0031` ran never sees it.
9. **Logs**:
   - **Expect**: `deck.welcome_dismiss` with `outcome=dismissed`, then `already_dismissed` for any retry. Its fields are ids only.

## Before/after screenshots (UI tasks)

The welcome sheet and Browse with its list open, at phone 412 px and desktop 1280 px, light and dark. Compare them with the sibling, `CategoryList` (the same `Sheet`).
