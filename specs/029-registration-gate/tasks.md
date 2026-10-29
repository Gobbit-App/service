---

description: "Task list for 029-registration-gate"
---

# Tasks: Registration gate

**Input**: Design documents from `/specs/029-registration-gate/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/auth-gate.md; `028-waitlist` merged (`waitlistService.join`, `sign_in` source and mail wording); `030-landing-page` merged for T031–T034 (see plan, "Settle before starting")

**Tests**: REQUIRED (constitution V). Every row of the plan's traceability table maps to a test task below.

**Organization**: Tasks are grouped by user story.

## Format: `[ID] [P?] [Story] [Tier?] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: US1 unknown email → waitlist, US2 existing and invited people, US3 copy and links
- **[Tier]**: `[unit]` `*.test.ts(x)` next to code, `[int]` `apps/api/test/*.int.test.ts` (Docker), `[e2e:smoke]` `e2e/tests/smoke/`, `[e2e:full]` `e2e/tests/full/` (tier rule: constitution V, ADR-053)

---

## Phase 1: Foundational (Blocking Prerequisites)

- [x] T001 [P] `registrationModes`, `registrationReasons` + types in packages/shared/src/auth/registration.ts; `./auth` subpath export if missing
- [x] T002 [P] [unit] env.test.ts: `REGISTRATION_MODE` unset → `waitlist`; `open` → `open`; `yes` → start-up error
- [x] T003 `REGISTRATION_MODE` in apps/api/src/env.ts (Zod enum, default `waitlist`)
- [x] T004 [P] [unit] users.service.test.ts: `register` table — every reason × mode (`open_sign_in` + `waitlist` throws `RegistrationClosed`; others create); returns existing user without creating; unique-violation fallback kept; `findExisting` never creates
- [x] T005a packages/db/src/schema/users.ts `registered_via`, `registered_by` + `registration_reason` enum; `pnpm db:generate` → 0019_users_registered_via.sql (re-number if taken) + down file; [int] migrations round trip; `createWithAccount` takes `{ via, by }`
- [x] T005 `findExisting`, `register(email, reason, actorId?)` (sets `registered_via`/`registered_by`, records `users.register`), `RegistrationClosed` in apps/api/src/services/users.service.ts; remove `findOrCreateByEmail`; pass the mode in apps/api/src/services/index.ts (both `createUsersService` calls)
- [x] T006 `memberships.service.invite` → `register(input.email, 'deck_invite')` in apps/api/src/services/memberships.service.ts; update memberships.service.test.ts mocks

**Checkpoint**: One guarded creation point; behaviour unchanged in `open` mode; typecheck green

---

## Phase 2: User Story 1 — Unknown email lands on the waitlist (Priority: P1) 🎯 MVP

**Goal**: With the gate on, an unknown email gets the waitlist mail instead of a sign-in link, and a sign-in link can't create an account.

**Independent Test**: request a link for a new `@example.test` address: `200`, no `magic_links` row, a `sign_in` waitlist entry, the waitlist mail captured.

### Tests for User Story 1

- [x] T010 [P] [US1] [unit] auth.service.test.ts: `waitlist` mode + unknown email → `waitlistService.join({ email, kind: 'other', source: 'sign_in', ip, skipRateLimits: true })`, no `magicLinks.create`, no sign-in mail; errors propagate; `open` mode unchanged
- [x] T011 [P] [US1] [unit] auth.service.test.ts: callback for `sign_in` with no user in `waitlist` mode → `MagicLinkFailure('closed')`; `users.register` `refused`/`registration_closed` with `via: 'open_sign_in'` and `emailHash`, no address; `auth.callback` `failed`/`closed`; `auth.magic_link` `sent`/`waitlisted`/`refused` (`per_email`, `per_ip`) per branch
- [x] T012 [P] [US1] [int] Gate matrix in apps/api/test/auth.int.test.ts: unknown email → 200 + waitlist row + no link + MemoryMailer waitlist mail; existing/unknown/listed answers have equal status and body; stale `sign_in` link for unknown email → 303 `reason=closed`, no `users`/`decks`/`sessions` rows, link still unconsumed; without `APP_URL` → 401 problem; `open` mode → user + personal deck + session with `registered_via = 'open_sign_in'`; `expectDecision` for every Accountability row; no test address in any captured line

### Implementation for User Story 1

- [x] T013 [US1] Gate in `requestMagicLink` (after rate limits: `users.findExisting` → else `waitlistService.join`) and `closed` in `MagicLinkFailureReason` / `consumeMagicLink` in apps/api/src/services/auth.service.ts; inject `waitlistService` and the mode in apps/api/src/services/index.ts
- [x] T014 [US1] `magicLinkInvalid` detail for `closed` ("Registration is closed") in apps/api/src/errors/http-errors.ts

**Checkpoint**: Demo 1 first half works via `api.http`

---

## Phase 3: User Story 2 — Existing and invited people sign in as before (Priority: P1)

**Goal**: The gate is invisible to users and invitees.

**Independent Test**: gate on: invite an unknown email, accept, later sign in from the sign-in screen.

### Tests for User Story 2

- [x] T020 [P] [US2] [int] apps/api/test/members.int.test.ts: gate on, invite unknown email → user created (201) with `registered_via = 'deck_invite'`, `registered_by` = inviter, `users.register` `created` with `actorId`; invite link opens a session in the deck; a later sign-in link for the same email is issued and works
- [x] T021 [P] [US2] [int] apps/api/test/auth.int.test.ts: existing user signs in unchanged in both modes; pending invitee requesting a sign-in link gets one

### Implementation for User Story 2

- [x] T022 [US2] No new code expected beyond T005–T006; fix anything T020–T021 expose

**Checkpoint**: Demo 1 second half ("an invited email still can")

---

## Phase 4: User Story 3 — Copy and links (Priority: P2)

**Goal**: Newcomers find the waitlist; one message for every email.

**Independent Test**: sign-in screen links to `/welcome`; `reason=closed` page explains the gate.

### Tests for User Story 3

- [x] T030 [P] [US3] [unit] auth-error-copy.test.ts (`closed` parsed and copied; unknown stays `unknown`); SignInForm.test.tsx (one message after any successful submit)
- [ ] T031 [P] (moved to 030) [US3] [e2e:smoke] e2e/tests/smoke/web.spec.ts: the sign-in screen shows "New here? Join the waitlist" pointing at `/welcome` (no submit: post-deploy smoke must not write waitlist rows)
- [ ] T032 [P] (moved to 030) [US3] [e2e:full] e2e/tests/full/registration-gate.spec.ts: submit an unknown `@example.test` email → shared message; open `/auth/error?reason=closed` → copy, "Join the waitlist" reaches `/welcome`, "Get a new link" reaches `/sign-in`

### Implementation for User Story 3

- [ ] T033 [US3] (`closed` copy done; action moved to 030) `closed` in apps/web/src/lib/auth-error-copy.ts; "Join the waitlist" action in apps/web/src/routes/auth.error.tsx (full navigation, `/welcome` is server-rendered)
- [ ] T034 [US3] (shared message done; link moved to 030) "New here? Join the waitlist" in apps/web/src/routes/sign-in.tsx; shared message in apps/web/src/ui/SignInForm.tsx

**Checkpoint**: All stories work

---

## Phase 5: Close-out

- [x] T049 `registration.mode` start-up event in apps/api/src/app.ts (warn when `open` and `NODE_ENV=production`); [unit] both levels; infra/README.md § Registration gate (jq per event, thresholds, `registered_via` SQL)
- [x] T050 `pnpm lint && pnpm format:check && pnpm typecheck && pnpm test:unit && pnpm test:int && pnpm build:web && pnpm budget`; `git grep createWithAccount` shows one caller (`users.service.register`)
- [x] T051 [P] docs/design/auth.md: "Registration gate" section (mode, request-time gate, `register` reasons, `closed`); update the D25 paragraph that says users are created on first sign-in
- [x] T052 [P] docs/adr.md ADR-061 (registration gate: D222–D224, D241) + one index row in docs/architecture.md
- [x] T053 [P] README.md env table + .env.example: `REGISTRATION_MODE`
- [x] T054 [P] Update the "Phase 9 gates registration here" comments in users.service.ts and docs/adr.md ADR text references if any point at `findOrCreateByEmail`
- [ ] T055 Run quickstart.md validation
- [ ] T056 `/speckit-converge` until it reports Converged

---

## Dependencies & Execution Order

- **Foundational (Phase 1)**: blocks every story
- **US1** after Phase 1; **US2** after Phase 1 (independent of US1); **US3** after 030 merges (links target `/welcome`)
- **Close-out**: after all stories

### Within Each User Story

- Tests written and FAILING before implementation
- shared → env → users.service → auth.service → web

---

## Notes

- [P] tasks = different files, no dependencies
- Log decisions the plan did not make, and deviations, in implementation-notes.md as you go
- Commit after each task or logical group (e.g. `feat(api): registration gate`)
- E2E tier: smoke + full — see plan Technical Context
