# Contract: Registration gate

No new routes. Two existing routes change behaviour in `REGISTRATION_MODE=waitlist`; in `open` mode both behave exactly as today.

## 1. `POST /auth/magic-link` (changed)

| | |
|---|---|
| Auth | None |
| Body | `{ "email": string, "next"?: string }` (unchanged) |
| 200 | `{ "ok": true }` — for every well-formed email, in both modes |
| 400 | Malformed email (unchanged) |
| 429 | `/problems/rate-limited` from `magic-link:email:*` or `magic-link:ip:*` (unchanged; checked before any lookup) |

Side effects after the rate limits:

| Mode | User exists? | Magic link row | Mail |
|------|--------------|----------------|------|
| any | yes | `sign_in` link | sign-in mail (unchanged) |
| `open` | no | `sign_in` link | sign-in mail (unchanged) |
| `waitlist` | no | none | `waitlistService.join({ email, kind: 'other', source: 'sign_in', ip, skipRateLimits: true })` → "You're not on Gobbit yet" confirmation mail, unless 028 sends nothing (entry already confirmed/invited); its own limits are skipped because the magic-link limits above already applied |

`next` is ignored for unknown emails in `waitlist` mode (there is no link to carry it).

## 2. `GET /auth/callback?token=` (changed)

| Link purpose | User exists? | Mode | Result |
|--------------|--------------|------|--------|
| `sign_in` | yes | any | session, `303` to `next` (unchanged) |
| `sign_in` | no | `open` | user + personal deck + session (unchanged) |
| `sign_in` | no | `waitlist` | `MagicLinkFailure('closed')`: transaction rolls back (link stays unconsumed, no user, deck or session); `303 ${APP_URL}/auth/error?reason=closed`, or `401 /problems/magic-link-invalid` (detail "Registration is closed") without `APP_URL` |
| `invite` | yes (created at invite) | any | unchanged |

Log line on refusal: `[auth] registration closed via=sign_in` (no email, no token).

## 3. `POST /decks/{id}/invites` (unchanged contract)

Still creates the invitee's user when needed, in both modes (`register(email, 'deck_invite')`). Status codes and bodies unchanged.

## 4. PWA

| Route | Change |
|-------|--------|
| `/sign-in` | "New here? Join the waitlist" → `/welcome` (030). After submit: "If you have a Gobbit account, a sign-in link is on its way. If you don't, we've sent you a link to join the waitlist." |
| `/auth/error?reason=closed` | Title "Gobbit is invite-only for now"; body "This email doesn't have an account yet. Join the waitlist and we'll let you know when there's room."; actions "Join the waitlist" (`/welcome`, full navigation) and "Get a new link" (`/sign-in`) |

## Decision events (D241)

Every branch above records one event (constitution VIII); the response never changes because of it.

| Step | Event | Outcome · reason |
|------|-------|------------------|
| magic-link limit hit | `auth.magic_link` | `refused` · `per_email` or `per_ip` |
| known email, link mailed | `auth.magic_link` | `sent` (`userId`) |
| unknown email, `waitlist` mode | `auth.magic_link` | `waitlisted` (028 records its own `waitlist.join`) |
| callback success | `auth.callback` | `signed_in` (`userId`, `created`) |
| callback failure | `auth.callback` | `failed` · `invalid`/`used`/`expired`/`onboarding`/`closed` |
| user created / found / refused | `users.register` | `created` / `existing` / `refused` · `registration_closed` (`via`, `actorId?`) |
