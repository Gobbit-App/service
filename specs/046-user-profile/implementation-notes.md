# Implementation notes: Member profile and creator avatar (046)

Decisions the plan did not make, and deviations. At close-out the deviations are copied into
`docs/design/profile.md`.

## Verification gap (process)

The local implementation environment has no Docker or Postgres, so integration tests
(`*.int.test.ts`, including the migration round trip) were written but **not executed locally**. CI
runs them on the PR; every task marked done with an `[int]` tag or a migration is unverified until CI is green.
Unit tests, `pnpm typecheck`, ESLint and Prettier ran locally.

## Screenshots (constitution X) — blocked locally

The authoring environment cannot run the app (no Postgres/Docker), so the phone and desktop, light and dark
screenshot tasks (T036, T049, T060, T066) are **not done**: `.tsx`/`.css` tasks that depend on them are only
statically checked (typecheck, ESLint, unit tests, `ui-system.test.ts`). They must be taken on a machine
with the stack running (`pnpm compose:up`) before merge; the palette (T020) and the `.avatar` clipping
(photo clipped to a circle, tooltip as `::after`) especially need an eye.

**Check first in the screenshots**: `.card__meta` is now `flex-wrap: nowrap` (chips shrink first; the age label and
avatar stay fixed) so the avatar never drops onto the action bar. This touches the footer of every card, not only
shared-deck cards: compare a card with many chips at 412 px against `main`.

## Full e2e stability (CI, 2026-11-17)

- **Photo spec, two causes**: (1) the PWA service worker answers Cloudinary images itself, past Playwright's
  `page.route`, so the fake delivery stopped serving once the worker took over (the trace showed
  `_serviceWorkerRef` requests getting a real 404 from Cloudinary, and `Avatar` correctly fell back to
  initials); the photo describe now sets `serviceWorkers: 'block'`, as `cover.spec.ts` does, and the offline test
  keeps the worker. (2) a real CSS bug: `.cloud-image { position: relative }` (later in the file) overrode
  `.avatar__photo { position: absolute }`, so the photo wrapper collapsed (`sizes="1px"` in the failing locator);
  the rule is now `.avatar .avatar__photo`.
- **Tooltip spec flake**: the list first renders from the persisted cache and then re-renders on the fresh fetch;
  the test now waits for the network to settle before the click sequence.
- **Cover spec** (`at 360px a covered card keeps its box…`): it raced the calc card's lazily loaded result block
  (about 150 px) between its two measurements, unrelated to images or to this feature's code. It now waits for the
  calc result before measuring. (An earlier guess that the relative age text made the footer wrap was wrong
  and its CSS change was reverted.)

- **Profile update limit vs e2e**: the T077 limit (`PROFILE_UPDATE_RATE_PER_HOUR`, default 30) refused the full tier's
  profile saves with 429 (one shared owner account saves its profile in many specs). `infra/docker-compose.local.yml`
  (used by the local and both e2e stacks, never deployed) now defaults the API to 1000; the lookup limit keeps its
  default because a spec drives it to a 429 on purpose. Setting it in the workflow files was not possible from this
  environment (the push token has no `workflow` scope).

## Decisions

- **Hold trigger error (D418)**: the trigger raises `P0001` with the message `username_held`, matching the other
  triggers in the repo (item_needs_category), instead of `check_violation` + HINT as first planned.
- **Username conflict mapping**: `mapPgError` returns one identical 422 problem (`username` / `unavailable`) for
  a unique clash and a held name, so the client cannot tell them apart (D425). The real reason for the decision
  event comes from `usernameConflictReason(err)` (`'taken' | 'held'`), not from the response body.
- **Asset scope CHECKs (D423)**: two constraints, `assets_scope_values_chk` (scope in deck, profile) and
  `assets_scope_chk` (`(scope = 'deck') = (deck_id IS NOT NULL)`), instead of an enum constant in the DB package.
- **`assets.repo.upsert` (D423)**: the update-on-conflict guard is `deck_id = v.deckId` when a deck is given, else
  never updates (`false`), because a profile asset has no deck.
- **Initials edge cases (D420)**: a name with no letter (emoji only) contributes nothing and falls back to
  the email local part; a combining mark stays with its letter; no honorific stripping ("Dr. Dana" → `D`).
- **`displayNameOf` (D419)** lives in `packages/shared/src/schemas/profile.ts`, so importing it loads zod; the web
  must not import it as a value on the main chunk (use the summaries' ready-made `name`, or move it to a
  zod-free subpath if a main-chunk caller needs it).
- **Small additions no task named**: optional `subject` prop on `editor/use-leave-guard.tsx` and `editor/DiscardChangesDialog.tsx` (so the profile form reuses the guard with its own wording); a `/settings/profile` entry in `analytics/catalogue.ts` (the typed route catalogue must list every route); e2e-only variables `SMOKE_INVITEE_USERNAME`, `E2E_MEMBER_B_TOKEN`, `E2E_MEMBER_C_TOKEN` (see `docs/design/testing.md`).

## Deviations

- **Invite decision (D425; Accountability row "Invite by username")**: the plan said invite events gain `via: 'username'`,
  but the codebase records no invite decision event or audit row today (`usersService.register` logs only the
  registration), so there was nothing to extend. Only the unknown-username miss is recorded (`profile.lookup`
  `not_found`). Constitution VIII says inviting is a decision that needs a record; that gap pre-dates this
  feature and is left for the accountability retrofit tracked in `PLAN.md`.

- **`.card__meta` is `flex-wrap: nowrap` (D428)**: chips shrink first, the age label and avatar stay fixed, on
  every card (see the screenshot checks above).

## Deviations: e2e has one member session (T037, T050, T038, T051)

E2E has no way to obtain a second member's session (sign-in needs an emailed magic link; `deck-admin.spec.ts`
notes the same), and the API refuses self-invites. So:

- The smoke invite-by-username journey runs only when the optional `SMOKE_INVITEE_USERNAME` names a standing member whose username
  was set out of band; otherwise it is skipped. The always-on smoke test covers the lookup preview (username → avatar
  and `@username`, no email) against the owner's own fresh username, but does not send an invite. Cross-member
  behaviour (invite lands, two members see the same colour, hold for another member) is covered at the API
  integration tier (`profile.int.test.ts`), which can create several users with factories.
- `SMOKE_INVITEE_USERNAME` is a new optional env var of the e2e setup only (not the app); document it next to
  the other `SMOKE_*` variables in the e2e README/CI notes.

- **`e2e/tests/full/profile.spec.ts` needs provisioning**: cross-member cases use optional bearer tokens
  `E2E_MEMBER_B_TOKEN` and `E2E_MEMBER_C_TOKEN` (users on the smoke owner's account, so implicit owners of smoke
  decks). They are not yet wired into `e2e/lib/env.ts`, the seed or CI, so those cases **skip** until they are.
  Wire them (seed two extra sessions, as `SMOKE_SESSION_TOKEN` is) before relying on the full tier for them.
- **Photo e2e needs `CLOUDINARY_API_SECRET`**: `PATCH /me/profile` refuses an avatar whose asset was not recorded
  through the real signed confirm (T053), so the photo specs skip without the secret (third-party hosts are still
  faked at the network edge). No test seeds a photo by writing an unrecorded `publicId` through the API.
- **Removed creator (D429)**: the e2e case is an empty `test.fixme` (no API route deletes a user); the integration test covers it.
- **Members-row avatar** assertion in the "same initials and colour" test fails until T064 adds `Avatar` to
  `MembersSection` (Phase 5, same PR).
- **429 lookup test** consumes the owner's hourly lookup budget; it runs last in its describe.

## Deviations: email masking (D425; spec Story 5.3 / 7.6, FR-010, FR-022)

Invite-by-username (D425) would let an owner turn a username into an address, and `GET /decks/{id}/members` already returned every member's `email`. Decision: `email` is nullable in `membershipSchema` and `memberSchema`. A `{username}` invite answers `membership.email = null` (the email path is unchanged: the owner typed it). In `GET /decks/{id}/members` and the role-change response, `email` is `null` for any member whose profile has a `username`, except to that member themselves; members without a username keep today's behaviour. The web members list shows `@username` when the email is null.

## CI fixes after the first run

- **Avatar CHECK**: `users_avatar_shape_chk` wraps `jsonb_typeof(avatar->'publicId')` in `coalesce(..., '')`; without it `'{}'` evaluated to NULL, which a CHECK accepts. The other 0027 checks are on nullable columns (NULL passes on purpose) or NOT NULL columns.
- **422, not 400, for profile fields**: `profilePatchSchema` validates types only; `profile.service.update` trims, enforces the code-point limits (`Use at most N characters.` on `firstName`/`lastName`/`location`) and the username shape, all as `unprocessableField`.
- **Reload shows stale form**: `ProfileForm` follows a later `profile` (persisted cache first, fresh fetch after) for every untouched field.
- **Personal deck in e2e**: the smoke bearer session never signs in and the personal deck is created at sign-in; the seed stays deck-free (D49), so the "no avatar in the personal deck" e2e check skips when `GET decks/me` is not 200. The rule is covered at the integration tier (`creator` is `null` for a personal deck, `profile.int.test.ts`) and by the web unit tests.
- `/s/{id}` of a public card is a 302 to its public page (D181); the payload scans expect that.
