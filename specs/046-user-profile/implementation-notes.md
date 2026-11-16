# Implementation notes: Member profile and creator avatar (046)

Decisions the plan did not make, and deviations. At close-out the deviations are copied into
`docs/design/profile.md`.

## Verification gap (process)

The local implementation environment has no Docker or Postgres, so integration tests
(`*.int.test.ts`, including the migration round trip) were written but **not executed locally**. CI
runs them on the PR; every task marked done with an `[int]` tag or a migration is unverified until CI is green.
Unit tests, `pnpm typecheck`, ESLint and Prettier ran locally.

## Decisions

- **Hold trigger error**: the trigger raises `P0001` with the message `username_held`, matching the other
  triggers in the repo (item_needs_category), instead of `check_violation` + HINT as first planned.
- **Username conflict mapping**: `mapPgError` returns one identical 422 problem (`username` / `unavailable`) for
  a unique clash and a held name, so the client cannot tell them apart (D425). The real reason for the decision
  event comes from `usernameConflictReason(err)` (`'taken' | 'held'`), not from the response body.
- **Asset scope CHECKs**: two constraints, `assets_scope_values_chk` (scope in deck, profile) and
  `assets_scope_chk` (`(scope = 'deck') = (deck_id IS NOT NULL)`), instead of an enum constant in the DB package.
- **`assets.repo.upsert`**: the update-on-conflict guard is `deck_id = v.deckId` when a deck is given, else
  never updates (`false`), because a profile asset has no deck. Revisit in T052 when profile assets are recorded.
- **Initials edge cases** (D420 silent): a name with no letter (emoji only) contributes nothing and falls back to
  the email local part; a combining mark stays with its letter; no honorific stripping ("Dr. Dana" → `D`).
- **`displayNameOf`** lives in `packages/shared/src/schemas/profile.ts`, so importing it loads zod; the web
  must not import it as a value on the main chunk (use the summaries' ready-made `name`, or move it to a
  zod-free subpath if a main-chunk caller needs it).

## Deviations

- **Invite decision (Accountability row "Invite by username")**: the plan said invite events gain `via: 'username'`,
  but the codebase records no invite decision event or audit row today (`usersService.register` logs only the
  registration), so there was nothing to extend. Only the unknown-username miss is recorded (`profile.lookup`
  `not_found`). Constitution VIII says inviting is a decision that needs a record; that gap pre-dates this
  feature and is left for the accountability retrofit tracked in `PLAN.md`.

## Deviations: email masking (spec Story 5.3 / 7.6, FR-010, FR-022)

Invite-by-username (D425) would let an owner turn a username into an address, and `GET /decks/{id}/members` already returned every member's `email`. Decision: `email` is nullable in `membershipSchema` and `memberSchema`. A `{username}` invite answers `membership.email = null` (the email path is unchanged: the owner typed it). In `GET /decks/{id}/members` and the role-change response, `email` is `null` for any member whose profile has a `username`, except to that member themselves; members without a username keep today's behaviour. The web members list shows `@username` when the email is null.
