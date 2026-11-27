# Data model: First run for invited people

Migration `0031_membership_welcome` (and a hand-written `down/0031_membership_welcome.down.sql`). It adds one column and runs one backfill.

## `memberships` — one new column (D478)

| Column                 | Type                | Notes                                                        |
| ---------------------- | ------------------- | ------------------------------------------------------------ |
| `welcome_dismissed_at` | timestamptz(3) NULL | when the person dismissed the deck's welcome; null = not yet |

**Backfill** (same migration): `UPDATE memberships SET welcome_dismissed_at = accepted_at WHERE accepted_at IS NOT NULL`. This marks every member accepted before release, so they never see the welcome (FR-003). Pending rows stay null.

**Down**: drop the column.

**Lifecycle**:

| State                       | `accepted_at` | `welcome_dismissed_at` | Welcome                                                   |
| --------------------------- | ------------- | ---------------------- | --------------------------------------------------------- |
| pending invite              | null          | null                   | no access, no welcome                                     |
| accepted, not yet dismissed | set           | null                   | **shown** (unless the caller is on the owning account)    |
| dismissed                   | set           | set                    | never again for this membership                           |
| removed (`deleted_at` set)  | —             | —                      | row is inactive; a new invite inserts a new row with null |

No CHECK constraint ties `welcome_dismissed_at` to `accepted_at`. The service only ever sets the column on an accepted, active row, and the backfill respects the same rule. One invariant is still asserted in an integration test: dismissing a pending row changes nothing.

## Changed write: link acceptance over a pending invite (D482)

`invite-links.repo` accept, `existing` pending branch: `set({ role: link.role, acceptedAt: v.now, invitedBy: link.createdBy })`.

## DTOs (`@gobbit/shared`, `schemas/deck.ts`)

```text
deckWelcomeSchema = { membershipId: string, inviter: memberSummarySchema | null }
deckDetailSchema  = deckSchema.extend({ welcome: deckWelcomeSchema.nullable() })
```

- `memberSummarySchema` is the existing summary from 046/051: `id`, `name`, `username`, `initials`, `photo`. It carries no email.
- Only `GET /decks/{id}` answers `deckDetailSchema`. `deckSchema` is unchanged for the list, create and update.
- Web: `deckQuery` returns `DeckDetail`. Deck updates invalidate this query rather than writing into it (`useUpdateDeck`), so the refetch carries `welcome`.

## Web-only state (D481)

| Key                           | Store                           | Value                                                                           | Cleared                                                                                                                                                                                              |
| ----------------------------- | ------------------------------- | ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `gobbit:welcome-dismissed:v1` | `defaultStore()` (localStorage) | JSON array of membership ids dismissed here but not yet confirmed by the server | per id, on 204 or 404 from `DELETE /decks/{id}/welcome`. Kept across sign-out, like the other `gobbit:` keys: the ids are not personal data, and membership ids never match another person's welcome |
