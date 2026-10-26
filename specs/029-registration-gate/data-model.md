# Data Model: Registration gate

No migration. Reads `users` (existing unique email index); writes `waitlist_entries` only through 028's `waitlistService.join`. No new columns: a user created by an invite is indistinguishable from one created by open sign-in, which is the point (the reason is logged, not stored).

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
| `register(email, reason)` | yes | the only caller of `users.repo.createWithAccount`; keeps D25's unique-violation fallback; throws `RegistrationClosed` for `open_sign_in` when the mode is `waitlist`. Returns `{ user, created }` |
| `ensurePersonalDeck(user)` | — | unchanged (Phase 3B) |

`findOrCreateByEmail` is removed; its callers move as follows:

| Caller | Before | After |
|--------|--------|-------|
| `auth.service.consumeMagicLink` (`sign_in`) | `findOrCreateByEmail` | `findExisting` → else `register(email, 'open_sign_in')` |
| `memberships.service.invite` | `findOrCreateByEmail` | `register(email, 'deck_invite')` |
| 032 waitlist invite | — | `register(email, 'waitlist_invite')` |

## Failure reasons

`MagicLinkFailureReason` (`auth.service.ts`) and the web's `AuthErrorReason` (`lib/auth-error-copy.ts`) gain `closed`:

| Reason | When | Web copy (title) |
|--------|------|------------------|
| `closed` | `sign_in` link for an email with no user while `waitlist` | "Gobbit is invite-only for now" |

## Waitlist call (from 028)

`waitlistService.join({ email, kind: 'other', source: 'sign_in', ip, skipRateLimits: true })` — creates or refreshes the entry and sends the `sign_in` wording of the confirmation mail. `skipRateLimits` because the magic-link limits (`magic-link:email:*`, `magic-link:ip:*`) already ran before the lookup and bound this path; no error is caught.
