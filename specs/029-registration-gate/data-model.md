# Data Model: Registration gate

One small migration (D241). Reads `users` through the existing unique email index. Writes `waitlist_entries` only through 028's `waitlistService.join`.

## Migration `0019_users_registered_via` (next free number after 028's)

| Change | Detail |
|--------|--------|
| enum `registration_reason` | `deck_invite`, `waitlist_invite`, `open_sign_in` (from `registrationReasons` in `@pb/shared`) |
| `users.registered_via` | `registration_reason`, **nullable**: users created before this migration stay null |
| `users.registered_by` | uuid, nullable, FK `users(id)` `ON DELETE SET NULL`. The inviter (`deck_invite`) or the admin (`waitlist_invite`); null for `open_sign_in` |

Down file: drop both columns, then the enum. No backfill: the reason of older users is unknown, and null says so.

## Configuration

| Variable | Values | Default | Read by |
|----------|--------|---------|---------|
| `REGISTRATION_MODE` | `waitlist`, `open` | `waitlist` | `env.ts` → `auth.service`, `users.service` |

An invalid value fails start-up (Zod enum), like every other env setting.

## Shared types (`@pb/shared`, `auth/registration.ts`)

| Name | Value |
|------|-------|
| `registrationModes` | `['waitlist', 'open'] as const` |
| `RegistrationMode` | `(typeof registrationModes)[number]` |
| `registrationReasons` | `['deck_invite', 'waitlist_invite', 'open_sign_in'] as const` |
| `RegistrationReason` | `(typeof registrationReasons)[number]` |

## Service surface (`users.service`)

| Function | Creates? | Notes |
|----------|----------|-------|
| `findByEmail(email)` | no | unchanged |
| `findExisting(email)` | no | normalize + lookup; used by sign-in request and callback |
| `register(email, reason, actorId?)` | yes | the only caller of `users.repo.createWithAccount`; sets `registered_via`/`registered_by`; keeps D25's unique-violation fallback; throws `RegistrationClosed` for `open_sign_in` when the mode is `waitlist`. Records `users.register` (D241). Returns `{ user, created }` |
| `ensurePersonalDeck(user)` | — | unchanged (Phase 3B) |

`findOrCreateByEmail` is removed; its callers move as follows:

| Caller | Before | After |
|--------|--------|-------|
| `auth.service.consumeMagicLink` (`sign_in`) | `findOrCreateByEmail` | `findExisting` → else `register(email, 'open_sign_in')` |
| `memberships.service.invite` | `findOrCreateByEmail` | `register(email, 'deck_invite', inviterId)` |
| 032 waitlist invite | — | `register(email, 'waitlist_invite', adminId)` |

## Failure reasons

`MagicLinkFailureReason` (`auth.service.ts`) and the web's `AuthErrorReason` (`lib/auth-error-copy.ts`) gain `closed`:

| Reason | When | Web copy (title) |
|--------|------|------------------|
| `closed` | `sign_in` link for an email with no user while `waitlist` | "Gobbit is invite-only for now" |

## Waitlist call (from 028)

`waitlistService.join({ email, kind: 'other', source: 'sign_in', ip, skipRateLimits: true })` — creates or refreshes the entry and sends the `sign_in` wording of the confirmation mail. `skipRateLimits` because the magic-link limits (`magic-link:email:*`, `magic-link:ip:*`) already ran before the lookup and bound this path; no error is caught.

## Decision events (D241)

| Event | Outcomes · reasons | Fields |
|-------|--------------------|--------|
| `auth.magic_link` | `sent`, `waitlisted`, `refused` · `per_email`/`per_ip` | `emailHash`, `ipHash`, `userId?` |
| `auth.callback` | `signed_in`, `failed` · `invalid`/`used`/`expired`/`onboarding`/`closed` | `userId?`, `created?`, `ipHash` |
| `users.register` | `created`, `existing`, `refused` · `registration_closed` | `userId?`, `via`, `actorId?`, `emailHash` |
| `registration.mode` | `configured` | `mode` (start-up; `warn` when `open` in production) |
