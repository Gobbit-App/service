# Quickstart: Member email privacy

How to see the feature working. Rules: [contracts/members.md](./contracts/members.md); storage: [data-model.md](./data-model.md).

## Prerequisites

Docker (for integration and e2e), `pnpm install`, a local `.env` (README). `pnpm db:migrate` applies `0029_invited_by_email`.

## Automated

```sh
pnpm test:unit      # displayNameOf / initialsFor chains, member-summaries, mail floor copy
pnpm test:int       # member-email-privacy.int.test.ts: every role × deck kind, no address anywhere
pnpm test:e2e       # @full member-privacy: reader sees no address; inviter sees the typed one
```

## By hand (`pnpm dev`, `api.http` or the app)

1. As the owner of a shared deck, invite `noa@example.test` by address and a known member by username.
2. `GET /decks/{id}/members` as the owner. Noa's pending row has `email: "noa@example.test"`, `displayName: "Member"`, no username or photo. The username invite has the username and `email: null`. Your own row has `email: null`. Both pending rows carry `invitedBy` (you).
3. Make a second user a co-owner (invite, accept, `PATCH` role) and list as them. Noa's row has `email: null`, `invitedBy` = the first owner.
4. List as a reader. No `email`, no `invitedBy` on any row.
5. Re-invite Noa as the co-owner. The first owner no longer sees the address; the co-owner does.
6. Sign in as a user with no names and no username and make a card. In the activity log, the review queue and on the card, they are "Member" with the glyph, never their address's first part.
7. Open Settings → Members on a phone-width window: the pending row shows the typed address for the inviter and "Invited by …" for owners. Nothing else changed on the row.

## Expected failures

None. An answer containing any `@example.test` address outside step 2's first row is a bug.
