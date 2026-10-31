# Implementation Plan: Registration gate

**Branch**: `029-registration-gate` | **Date**: 2026-10-26 | **Spec**: [spec.md](./spec.md) | **Roadmap**: `PLAN.md` § Phase 9 (demo 1)

**Input**: Feature specification from `/specs/029-registration-gate/spec.md`

Project override of the core template. Written for outside readers: the repository is public.

## Summary

**Setting.** `REGISTRATION_MODE` = `waitlist` (default) or `open` (D222).

**Request.** In `waitlist` mode, `POST /auth/magic-link` for an email with no user stores no link and hands the email to 028's `waitlistService.join(...)` with source `sign_in`, which sends the "not on Gobbit yet" confirmation mail. The response is the usual `200 { ok: true }` (D223).

**Creation.** `usersService.findOrCreateByEmail` splits into `findExisting(email)` and `register(email, reason)`; `register` refuses `open_sign_in` unless the mode is `open`. Deck invites register with `deck_invite` and keep working; 032 will use `waitlist_invite`. A sign-in link for an email with no user fails as `MagicLinkFailure('closed')` → `/auth/error?reason=closed`, inside the callback transaction (D224).

**Web.** One "check your inbox" message that covers both outcomes, a "New here? Join the waitlist" link on the sign-in screen, and copy for `reason=closed` (D225).

**Records.** Constitution VIII and ADR-060.

- Every sign-in request, callback and registration outcome is a decision event (`auth.magic_link`, `auth.callback`, `users.register`), identified only by keyed hashes and ids.
- `users.registered_via` and `registered_by` store how each new user got in and who let them in.
- A start-up `registration.mode` event raises an alert when production runs `open` (D241).

## Starting point

- `main @ f78bfa6`; [`028-waitlist`](../028-waitlist/spec.md) merged (provides `waitlistService.join`, the `sign_in` source and the mail variant).
- API:
  - `services/auth.service.ts`: `requestMagicLink` (rate limits → magic link → `signInEmail`), `consumeMagicLink` (one transaction via `CallbackTransaction`; `inviteUser` for `invite` links, `r.usersService.findOrCreateByEmail` for `sign_in`; `ensureOnboarding`), `MagicLinkFailure` with `invalid | used | expired | onboarding`.
  - `services/users.service.ts`: `findByEmail`, `ensurePersonalDeck`, `findOrCreateByEmail` (the only caller of `users.repo.createWithAccount`).
  - `services/memberships.service.ts` `invite`: `usersService.findOrCreateByEmail(input.email)`.
  - `services/index.ts` wires `createUsersService({ users, decks })` twice (callback repos and the app services).
  - `routes/auth.ts`: callback maps `MagicLinkFailure` through `lib/auth-redirect.ts#callbackFailureLocation`, or `magicLinkInvalid(reason)` without `APP_URL`.
  - `env.ts`: Zod `baseSchema`; no registration setting.
- Web: `routes/sign-in.tsx` + `ui/SignInForm.tsx` ("Check your inbox"); `routes/auth.error.tsx` + `lib/auth-error-copy.ts` (`parseReason`, `authErrorCopy`).
- Tests: `services/auth.service.test.ts`, `services/users.service.test.ts`, `services/memberships.service.test.ts`, `apps/api/test/auth.int.test.ts`; e2e `smoke/web.spec.ts` (signed-out deep link → sign-in). E2E never signs in by email (seeded `SMOKE_SESSION_TOKEN`).

## Technical Context

**Language/Version**: TypeScript (strict, ESM, no build step) on Node ≥ 22; React 19

**Primary Dependencies**: Hono + `@hono/zod-openapi`, Drizzle; TanStack Router. No new dependencies.

**Storage**: PostgreSQL 17. One migration: `users.registered_via` (enum) and `registered_by` (D241). 028 owns `waitlist_entries`.

**Testing**: Vitest unit; integration with Testcontainers; Playwright smoke and full

**E2E tier**: smoke + full — sign-in is a critical journey and this change edits its screen and the code behind it, so the existing smoke journeys stay on every PR and gain one assertion (the sign-in screen renders with the waitlist link; the signed-out deep link still lands on sign-in). Post-deploy smoke must not create waitlist rows or send mail, so submitting an unknown email runs only in `@full` against the local stack, together with the `reason=closed` page. The gate's decision table itself is guarded by unit and integration tests.

**Target Platform**: API in Docker Compose on Dokploy; PWA on phones and desktop

**Project Type**: pnpm monorepo — API, PWA, shared packages

**Performance Goals**: `POST /auth/magic-link` gains at most one indexed user lookup; no measurable latency change

**Constraints**: no account enumeration (D22); everything in the callback stays in one transaction (Phase 3B); no change to the initial bundle beyond copy

**Scale/Scope**: a few hundred users and waitlist entries

## Constitution Check

| Principle | How this plan complies |
|-----------|------------------------|
| I. Layered API | The decision lives in `users.service.register` and `auth.service`; routes only map `MagicLinkFailure('closed')` as they already do for other reasons |
| II. One source of truth | `registrationModes` and `RegistrationReason` in `@gobbit/shared` (env schema and services read the same lists); `closed` joins `MagicLinkFailureReason` in `auth.service.ts` and the web's `AuthErrorReason`, as the existing reasons do today; no DTO or OpenAPI change |
| III. Invariants in the DB | Uniqueness of users and waitlist entries is already enforced by indexes (users; 028). New enum column + FK with a hand-written down file |
| IV. Private by default | Closed by default; same response for every email; events carry keyed hashes, never the address |
| V. Tests at the right tier | Unit decision table for `register`; int matrix for request + callback in both modes; e2e smoke assertion + full journey (see E2E tier) |
| VI. Lean web | Copy and one link; no new chunk |
| VII. Simple, optional | One env var with a safe default; no dependency; works without AI keys or analytics |
| VIII. Accountable by default | Every request, callback and registration outcome is a decision event. New users store `registered_via`/`registered_by`. The mode is announced at start-up and alerts when `open` in production. The existing magic-link limits now say which one refused. Accountability table below |

No violations.

## Decisions this plan pins down

Full reasoning in [research.md](./research.md).

| ID | Decision | ADR? |
|----|----------|------|
| D222 | `REGISTRATION_MODE` = `waitlist \| open`, default `waitlist`, invalid value fails start-up; not exposed to the web | ADR-061 |
| D223 | In `waitlist` mode an unknown email gets no magic link; `waitlistService.join({ source: 'sign_in', kind: 'other', skipRateLimits: true })` sends the waitlist mail; magic-link limits only (`skipRateLimits`); response stays `200` | ADR-061 |
| D224 | `findExisting` + `register(email, reason)` replace `findOrCreateByEmail`; `open_sign_in` refused unless open; callback → `MagicLinkFailure('closed')` in the same transaction | ADR-061 |
| D225 | One "check your inbox" message for everyone; "New here? Join the waitlist" on sign-in; `closed` error copy with "Join the waitlist" | no |
| D241 | Events `auth.magic_link`, `auth.callback`, `users.register`, `registration.mode`; `users.registered_via` + `registered_by` set by `register` | ADR-061 |

## Project Structure

### Documentation (this feature)

```text
specs/029-registration-gate/
├── spec.md
├── checklists/requirements.md
├── plan.md
├── research.md
├── data-model.md
├── contracts/auth-gate.md
├── quickstart.md
├── tasks.md
└── implementation-notes.md   # created during /speckit-implement
```

### Source Code (repository root)

```text
packages/shared/src/
└── auth/registration.ts                     # NEW: registrationModes, RegistrationReason (+ ./auth subpath export if missing)

apps/api/src/
├── env.ts (+ env.test.ts)                   # + REGISTRATION_MODE
├── services/users.service.ts (+ test)       # findExisting, register(email, reason, actorId?), RegistrationClosed, users.register events
├── repositories/users.repo.ts               # createWithAccount sets registered_via/registered_by
├── app.ts / worker start-up                 # registration.mode event
├── services/auth.service.ts (+ test)        # gate in requestMagicLink; 'closed' in MagicLinkFailureReason/consumeMagicLink
├── errors/http-errors.ts                    # magicLinkInvalid: readable detail for 'closed'
├── services/memberships.service.ts          # invite → register(email, 'deck_invite', inviterId)
├── services/index.ts                        # wire waitlistService + mode into auth/users services
└── mail/templates.ts                        # (028 owns the sign_in wording; no change expected here)
apps/api/test/auth.int.test.ts               # + gate matrix (both modes)
apps/api/test/members.int.test.ts            # + invite of an unknown email with the gate on

packages/db/src/schema/users.ts             # + registered_via, registered_by
packages/db/migrations/0019_users_registered_via.sql (+ down/)

apps/web/src/
├── lib/auth-error-copy.ts (+ test)          # + 'closed'
├── routes/auth.error.tsx                    # + "Join the waitlist" action for closed
├── routes/sign-in.tsx                       # + "New here? Join the waitlist"
└── ui/SignInForm.tsx (+ test)               # one message for both outcomes
e2e/tests/smoke/web.spec.ts                  # + waitlist link assertion
e2e/tests/full/registration-gate.spec.ts     # NEW
```

**Structure Decision**: the rule sits in `users.service` because that is where users are created (D25) and where the code already says the Phase 9 gate goes; `auth.service` only decides what to do with an unknown email at request time. No new route.

## Invariant → test traceability

| Invariant / rule | Enforced in | Test (file, tier) |
|------------------|-------------|-------------------|
| FR-001 no user from sign-in when closed | `users.service.register` | `users.service.test.ts` (unit: reason × mode table — `open_sign_in`/waitlist throws, others create); `auth.int.test.ts` (int: stale sign-in link for unknown email → 303 `reason=closed`, no `users`/`decks`/`sessions` rows) |
| FR-002 unknown email → waitlist, no link | `auth.service.requestMagicLink` | `auth.service.test.ts` (unit: `join` called with `source: 'sign_in'`, no `magicLinks.create`, no sign-in mail); `auth.int.test.ts` (int: `waitlist_entries` row, zero `magic_links` rows, MemoryMailer holds the waitlist mail) |
| FR-003 identical responses | `routes/auth.ts` + service | `auth.int.test.ts` (int: status + body equal for existing, unknown, listed cases) |
| FR-004 closed callback leaves nothing | callback transaction | `auth.int.test.ts` (int: as FR-001, plus the link stays unconsumed because the transaction rolls back; a second click answers `closed` again) |
| FR-005 invites still create and sign in | `memberships.service.invite` → `register('deck_invite')` | `members.int.test.ts` (int: gate on, invite unknown email → user created, invite link opens session, later sign-in link works) |
| FR-006 single guarded entry point | `users.service` | `users.service.test.ts` (unit: table); `createWithAccount` has one caller (review checklist + grep in T050) |
| FR-007 safe default, invalid fails | `env.ts` | `env.test.ts` (unit: unset → `waitlist`; `open` → `open`; `yes` → start-up error) |
| FR-008 copy and links | web | `auth-error-copy.test.ts`, `SignInForm.test.tsx` (unit); `smoke/web.spec.ts` (e2e:smoke: waitlist link visible); `full/registration-gate.spec.ts` (e2e:full: closed page, unknown email submit shows the shared message) |
| FR-009 every outcome recorded, no address | `auth.service`, `users.service` | `auth.service.test.ts`, `users.service.test.ts` (unit: one event per outcome and reason, `via` present, no address); `auth.int.test.ts` (int: `expectDecision` for sent, waitlisted, refused per_email and per_ip, signed_in, each failed reason; no test address in captured lines) |
| FR-010 how a user got in | `users.repo.createWithAccount` | `users.service.test.ts` (unit: reason and actor passed); `members.int.test.ts` (int: deck invite → `registered_via = 'deck_invite'`, `registered_by` = inviter; `open` sign-in → `open_sign_in`, null actor; deleting the inviter nulls `registered_by`); `migrations.int.test.ts` (round trip) |
| FR-011 mode announced | start-up | `env.test.ts` / `app.test.ts` (unit: `registration.mode` at info for `waitlist`, warn for `open` with `NODE_ENV=production`) |
| `open` mode = today | both services | `auth.int.test.ts` (int: unknown email → link → user + personal deck + session) |

## Accountability

Constitution VIII and ADR-060. The convention is in `docs/design/api-conventions.md#decision-events`. Uses 028's `decisionLogger`, `logHash` and `expectDecision` (D239). All request events carry `requestId`.

| Decision | Event / audit row | Outcomes · reasons | Fields (ids/hashes only) | Level | Watched | Alert threshold (default) | Test |
|----------|-------------------|--------------------|--------------------------|-------|---------|---------------------------|------|
| Sign-in request | `auth.magic_link` | `sent`, `waitlisted`, `refused` · `per_email`/`per_ip` | `emailHash`, `ipHash`, `userId?` | info; warn for `refused` | aggregate by outcome; rate `waitlisted` ÷ all | `refused` > 30 per hour; `waitlisted` share > 3× its 7-day average (a link shared somewhere, or a bot) | unit + int |
| Callback | `auth.callback` | `signed_in`, `failed` · `invalid`/`used`/`expired`/`onboarding`/`closed` | `userId?`, `created?`, `ipHash` | info; warn for `failed` | aggregate by reason; rate failed ÷ all | failed > 25% over 1 hour with ≥ 20 callbacks (mail scanner or broken links); any `closed` > 10 per day | unit + int |
| Registration | `users.register` + `users.registered_via`/`registered_by` | `created`, `existing`, `refused` · `registration_closed` | `userId?`, `via`, `actorId?`, `emailHash` | info | instance for `created` via `open_sign_in` in production; aggregate by `via` | any `created` with `via = open_sign_in` while production mode is `waitlist` (must be impossible) | unit + int |
| Mode in effect | `registration.mode` (start-up) | `configured` | `mode` | info; **warn** when `open` in production | instance | any `warn` (production running open) | unit |
| Request latency | request line `POST /auth/magic-link` `durationMs` | — | — | — | p95 | p95 > 500 ms over 1 hour | — |

**Operator controls**:

- `REGISTRATION_MODE` opens or closes the door.
- The existing magic-link limits stay constants in this feature. Making them env-tunable is the Phase 11 accountability retrofit (`PLAN.md`), because they predate the principle and this feature doesn't change their values.
- `infra/README.md` § Registration gate gives the `jq` query per event and this SQL: `select registered_via, count(*) from users group by 1`.

## Rollout

- **Migrations**: `0019_users_registered_via` (two nullable columns and an enum; no backfill; reversible).
- **Env / config**: `REGISTRATION_MODE` (default `waitlist`). Production: leave unset (closed). `.env.example` documents `open` for local experiments; `infra/docker-compose.local.yml` leaves it unset.
- **API client**: no change (no route or schema change); `pnpm api:openapi` must produce no diff.
- **Deploy order / flags**: 028 deployed first (its service and mail). Deploying 029 closes registration immediately; announce nothing — existing users and pending invitees are unaffected.

## Risks

| Risk | Likelihood / impact | Mitigation |
|------|---------------------|------------|
| A family member who never signed in (no user) is locked out | M / M | Owners invite them to a deck (creates the user), or 032 invites them from the waitlist; the closed page explains it |
| Gate bypassed by a new creation path later | L / H | `register` requires a reason; `createWithAccount` has one caller; ADR-061 names the rule; Phase 13 plan already references it |
| Response timing reveals unknown emails | L / L | Both branches do one lookup and one mail; same status/body; rate limits run first. Exact timing parity is not a goal (D22 never claimed it) |
| Waitlist mail failure turns into a 500 only for unknown emails | L / L | Same behaviour as a mail failure for a known user today; both are 500 |

## Settle before starting

- [ ] Merge order with 030: the sign-in and error-page links point at `/welcome`. If 029 is ready first, ship it without the two links and let 030 add them (tasks T031–T034 move to 030).
- [x] Public wording: "invite-only for now", kept simple (owner, 2026-10-26)
- [ ] Constitution v1.3.0 (principle VIII, ADR-060) merged first (PR #61); 028's `decisionLogger`/`logHash` merged first

## Complexity Tracking

None.
