# Research: Registration gate

Decisions continue the project-wide D numbering. Phase 9 reserves D217–D240. This feature owns **D222–D225**. D222–D224 together become **ADR-061 (registration gate)** at close-out, with a row in the `docs/architecture.md` index; D225 is UI copy and needs no ADR.

## What exists today

- `POST /auth/magic-link` (`routes/auth.ts` → `auth.service.requestMagicLink`) normalizes the email, enforces `magic-link:email:<sha256>` (5/h) and `magic-link:ip:<ip>` (20/h), stores a `sign_in` magic link and mails it. It always answers `200 { ok: true }` (D22).
- `GET /auth/callback` → `auth.service.consumeMagicLink` runs, in one transaction: consume the link, resolve the user (`inviteUser` for `invite` links, `usersService.findOrCreateByEmail` for `sign_in`), `ensurePersonalDeck`, open the cookie session. Failures are `MagicLinkFailure(reason)` with `invalid | used | expired | onboarding`, redirected by `callbackFailureLocation` to `${APP_URL}/auth/error?reason=…`; the web copy lives in `apps/web/src/lib/auth-error-copy.ts`.
- `usersService.findOrCreateByEmail` (D25) is the only caller of `users.repo.createWithAccount`. It is called by the sign-in callback and by `memberships.service.invite` (D37: the invitee's user is created at invite time, so invite links resolve an existing user).
- No registration setting exists; anyone who types an email gets an account on first click.

## D222 — `REGISTRATION_MODE`, closed by default

- **Decision**: env `REGISTRATION_MODE` = `waitlist | open`, parsed in `env.ts` with default `waitlist`; any other value fails start-up (Zod enum). Passed to the auth and users services through their env picks. `GET /config` does not expose it (the web never branches on it; the API's answers already differ where they must).
- **Rationale**: a closed default means a forgotten variable never opens the door in production, and self-hosters/dev can still opt into today's behaviour with one line. Two values are enough; "invite-only without a waitlist" is `waitlist` with nobody looking at the list.
- **Alternatives considered**: a boolean `REGISTRATION_OPEN` (reads fine, but a third mode later, e.g. domain allow-lists, would need a new variable); a database setting toggled by a platform admin (needs an admin UI and caching for a switch flipped once); default `open` in development (e2e and dev would test a path production never runs).

## D223 — The gate acts when the link is requested

- **Decision**: in `waitlist` mode, `requestMagicLink` looks the email up after its rate limits. With no user it stores no magic link and calls `waitlistService.join({ email, kind: 'other', source: 'sign_in', ip, skipRateLimits: true })` from 028, which creates or refreshes the entry and sends the confirmation mail in its "you're not on Gobbit yet" wording. It passes `skipRateLimits: true`: the magic-link limits already ran before the lookup, so counting the same request twice would only add a second, differently-worded `429` path; the magic-link per-email limit (5/h) bounds the waitlist mails too. Any other error propagates like a mail failure for a known user does today. In `open` mode nothing changes.
- **Rationale**: acting at request time means an unknown email never receives a working sign-in link, so there is nothing to forward, leak or replay. The waitlist mail goes only to the inbox owner, so the visible response stays identical (D22). Reusing 028's join keeps one place that writes entries and one confirmation flow.
- **Alternatives considered**: send the sign-in link and refuse at the callback only (the person clicks a link that "doesn't work" — a worse experience, and every unknown email still costs a magic link row); answer `403 registration-closed` to the request (account enumeration, breaks D22); add to the waitlist without confirmation (anyone could fill the list with other people's addresses; 028's double opt-in exists for that).

## D224 — One guarded entry point for creating users

- **Decision**: `usersService.findOrCreateByEmail` is replaced by two functions:
  - `findExisting(email)` — normalize and look up; never creates. Used by the sign-in callback and by `requestMagicLink`.
  - `register(email, reason)` with `reason: 'deck_invite' | 'waitlist_invite' | 'open_sign_in'` — find or create (keeping D25's unique-violation fallback). It throws `RegistrationClosed` for `open_sign_in` unless the mode is `open`. `memberships.service.invite` calls it with `deck_invite`; 032 calls it with `waitlist_invite`; the callback calls it with `open_sign_in` only when `findExisting` returned nothing.

  The callback maps `RegistrationClosed` to a new `MagicLinkFailure('closed')`; the transaction rolls back, so no user, deck or session is left, and the route redirects to `/auth/error?reason=closed` (or `401 /problems/magic-link-invalid` with `reason: closed` without `APP_URL`). The refusal is logged as `[auth] registration closed via=sign_in` without the email.
- **Rationale**: the comment in `users.service.ts` already marks this as the gate. Naming the reason at the single creation point makes every future path (Phase 13 `/connect`, Phase 11 GDPR re-creation, imports) declare itself, and a unit test can cover the whole decision table. The callback check is defence in depth for links issued before the gate or while `open`.
- **Alternatives considered**: a flag argument `findOrCreateByEmail(email, { allowCreate })` (callers pass booleans with no meaning attached, and the default would have to be chosen); checking the mode in each caller (three copies of the rule; the next caller forgets); a DB trigger refusing `users` inserts (the database can't tell an invite from a sign-in).

## D225 — Copy: one message for everyone, a way in for newcomers

- **Decision**:
  - `SignInForm`'s "Check your inbox" text becomes: "If you have a Gobbit account, a sign-in link is on its way. If you don't, we've sent you a link to join the waitlist." — shown for every successful request.
  - The sign-in screen gains "New here? Join the waitlist" linking to `/welcome` (030).
  - `auth-error-copy` gains `closed`: title "Gobbit is invite-only for now", body "This email doesn't have an account yet. Join the waitlist and we'll let you know when there's room.", actions "Join the waitlist" (`/welcome`) and the existing "Get a new link".
  - The waitlist mail wording for source `sign_in` is owned by 028; this feature asks for: subject "You're not on Gobbit yet", one line saying someone asked to sign in with this address, and the confirm button.
- **Rationale**: one sentence that covers both outcomes keeps D22 and still tells a newcomer to look in their inbox. The error page is the only place a person meets the gate directly, so it must point somewhere useful.
- **Alternatives considered**: keeping today's "Check your inbox" copy unchanged (a newcomer expects a sign-in link and gets a waitlist mail with no warning); a separate "Request access" button on the sign-in screen (two forms asking for the same email).
