# Quickstart: Deck admin screens

Validates [spec.md](./spec.md) end to end. Setup per `README.md`; 016 merged. Contract: [deck-admin](./contracts/deck-admin.md).

## 1. Automated

```sh
pnpm test:unit                 # deck-admin components, labels
pnpm test:int                  # members.int (role PATCH)
pnpm api:openapi && git diff --exit-code packages/api-client
pnpm build:web && pnpm budget
pnpm test:e2e -- full/deck-admin.spec.ts
```

## 2. Owner flow

1. Create a communal deck via `api.http` (`POST /decks` with `kind: communal`), open it in the PWA as the owner.
2. Deck menu → Deck settings. Rename the deck.
3. Set three categories to "Everyone" and one to "Members".
4. Turn on Public: the dialog lists the three categories and the address. Confirm.
5. Copy the public address; open it in a private window: only the three categories' cards.

## 3. Co-owner

1. Invite a second email as Co-owner; the list shows it pending.
2. Accept the link in another browser profile. The new co-owner opens Deck settings: the public switch is enabled; there is no delete.
3. As the first owner, change an editor to Maintainer; the editor's next page load shows the review queue.
4. Try to change your own role: refused with a message.

## 4. Deployed instance

Repeat sections 2–3 on the deployed instance with the real community deck (together with 020 for demo 5).
