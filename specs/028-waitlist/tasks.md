---

description: "Task list for 028-waitlist"
---

# Tasks: Waitlist with double opt-in

**Input**: Design documents from `/specs/028-waitlist/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/waitlist-api.md

**Tests**: REQUIRED (constitution V). Every row of the plan's traceability table maps to a test task below.

**Organization**: Tasks are grouped by user story.

## Format: `[ID] [P?] [Story] [Tier?] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: US1 join and confirm, US2 bots and floods, US3 summary view, US4 prune
- **[Tier]**: `[unit]` `*.test.ts` next to code, `[int]` `apps/api/test/*.int.test.ts` or `packages/db/test/*.int.test.ts` (Docker). No `[e2e:*]` tasks: E2E tier none (plan Technical Context); 030 owns the browser journey

---

## Phase 1: Foundational (Blocking Prerequisites)

- [ ] T001 `waitlistKinds`, `waitlistSources`, `waitlistStatuses` in packages/shared/src/enums.ts; packages/shared/src/waitlist/constants.ts (`WAITLIST_NOTE_MAX`, `WAITLIST_UTM_MAX`, `WAITLIST_CONFIRM_TTL_DAYS`, `WAITLIST_PENDING_RETENTION_DAYS`, `WAITLIST_PRUNE_CRON`) with `./waitlist-constants` subpath; `WAITLIST_JOIN_PER_IP_PER_HOUR`, `WAITLIST_JOIN_PER_EMAIL_PER_HOUR` in packages/shared/src/limits.ts (+ limits.test.ts rows)
- [ ] T002 [P] packages/shared/src/schemas/waitlist.ts (`waitlistJoinSchema`, `waitlistJoinResponseSchema`, `waitlistConfirmResultSchema`); export from index.ts
- [ ] T003 [P] [unit] packages/shared/src/schemas/waitlist.test.ts: kinds; note 500 vs 501 code points (emoji counted once); empty note → absent; malformed email; utm upper-case lowered, invalid utm dropped; unknown field rejected; `website` accepted
- [ ] T004 pgEnums in packages/db/src/schema/common.ts; packages/db/src/schema/waitlist-entries.ts; export in schema/index.ts; `pnpm db:generate` → packages/db/migrations/0018_waitlist.sql (re-number if taken); append CHECKs, partial unique indexes, `set_updated_at` trigger and `waitlist_summary` view per data-model.md
- [ ] T005 packages/db/migrations/down/0018_waitlist.down.sql; [int] `pnpm test:int` passes packages/db/test/migrations.int.test.ts round trip
- [ ] T006 [P] [int] packages/db/test/waitlist-invariants.int.test.ts: each CHECK rejects a contradicting row (upper-case email, note 501, bad utm, pending without token, confirmed without `confirmed_at`, invited without `invited_at`, removed without `removed_at`); second live entry for one email rejected; removed + new pending allowed; deleting a user sets `user_id`/`invited_by` to null
- [ ] T007 apps/api/src/repositories/waitlist.repo.ts: `findLiveByEmail`, `insertPending` (`ON CONFLICT` on the live index → null), `refreshPending`, `confirmByTokenHash` (atomic `UPDATE … RETURNING`), `markInvited`, `remove`, `pruneExpired({ pendingBefore, removedBefore })`
- [ ] T008 `rateKeys.waitlistEmail` in apps/api/src/lib/rate-window.ts

**Checkpoint**: Table, view and repository exist; migration reversible

---

## Phase 2: User Story 1 — Join the waitlist and confirm (Priority: P1) 🎯 MVP

**Goal**: A visitor joins, receives a link, confirms; the row reads `confirmed`.

**Independent Test**: `POST /waitlist` → mail captured → open link → row `confirmed`.

### Tests for User Story 1

- [ ] T010 [P] [US1] [unit] apps/api/src/mail/templates.test.ts rows: `waitlistConfirmEmail` wording per source, link and TTL present, HTML escaped; `waitlistExistingUserEmail` links `${APP_URL}/sign-in`
- [ ] T011 [P] [US1] [unit] apps/api/src/services/waitlist.service.test.ts with fake repo/mailer/users: outcome table (new, pending → new token + updated fields, `sign_in` re-join keeps form fields, confirmed/invited → no mail, existing user → existing-user mail, no row); mail failure logged without address, no throw; `markInvited` from non-confirmed and `remove` of removed → 409
- [ ] T012 [P] [US1] [int] apps/api/test/waitlist.int.test.ts: join → 202, pending row, one mail in `MemoryMailer`; stored hash = sha256(mailed token) ≠ token; confirm → 303 `/welcome?confirmed=1`, row confirmed; reuse/unknown/missing token → 303 `?confirm=invalid`, row unchanged; expired (clock + 7 d + 1 s) → invalid; two parallel confirms → one success; without `APP_URL` → 200 `{ confirmed }`; padded upper-case email matches the same row; `400` problem for bad input; identical status/headers/body for new, pending, confirmed, existing user

### Implementation for User Story 1

- [ ] T013 [US1] `waitlistConfirmEmail`, `waitlistExistingUserEmail` in apps/api/src/mail/templates.ts
- [ ] T014 [US1] apps/api/src/services/waitlist.service.ts (`join`, `confirm`, `markInvited`, `remove`; token via lib/tokens.ts; email via `normalizeEmail`; user lookup via `usersRepo.findByEmail`); wire in apps/api/src/services/index.ts
- [ ] T015 [US1] apps/api/src/routes/waitlist.ts: `POST /waitlist` (OpenAPI, 202) and `GET /waitlist/confirm` (outside OpenAPI, `Cache-Control: no-store`, `Referrer-Policy: no-referrer`); register in app.ts; `pnpm api:openapi`; examples in apps/api/api.http

**Checkpoint**: Demo 2's join-and-confirm half works with curl locally

---

## Phase 3: User Story 2 — Bots and floods don't fill the list (Priority: P1)

**Goal**: Honeypot drops silently; per-IP and per-email limits refuse floods.

**Independent Test**: `website` filled → 202, no row, no mail; 11th request from one IP → 429.

### Tests for User Story 2

- [ ] T020 [P] [US2] [int] apps/api/test/waitlist.int.test.ts: honeypot → same 202 body, no row, no mail, one log line without the address (`capture-logger`); 11th join from one IP → 429 + `Retry-After`; 4th join for one email → 429 for both a new email and an existing user's email; confirm counts in the same IP bucket; service call with `skipRateLimits` bypasses both

### Implementation for User Story 2

- [ ] T021 [US2] Honeypot branch and per-email `rateLimits.enforce(rateKeys.waitlistEmail(hash), WAITLIST_JOIN_PER_EMAIL_PER_HOUR)` before any lookup, both skipped with `skipRateLimits`, in waitlist.service.ts
- [ ] T022 [US2] Own `createAnonRateLimiter({ limit: WAITLIST_JOIN_PER_IP_PER_HOUR })` bucket (injectable `deps.waitlistLimiter`) applied with `publicRateLimit` to `/waitlist` and `/waitlist/*` in apps/api/src/app.ts; export the limiter options so 030 can attach `POST /welcome` with `onLimited: rateLimitedHtml`

**Checkpoint**: Demo 2 complete through the API

---

## Phase 4: User Story 3 — See the demand (Priority: P2)

**Goal**: `SELECT * FROM waitlist_summary` reports counts.

**Independent Test**: seeded entries across weeks/kinds/statuses → view counts match.

### Tests for User Story 3

- [ ] T030 [P] [US3] [int] packages/db/test/waitlist-invariants.int.test.ts: entries in two weeks, several kinds, both sources, every status → one row per group with the right count; invited entry whose user has a `sessions` row → `joined`; invited without session → `invited`; removed counted under `removed`

### Implementation for User Story 3

- [ ] T031 [US3] View SQL already in T004; fix any count/grouping issue found by T030 in the migration (not in a follow-up migration while unreleased)

**Checkpoint**: Demo 6 works locally

---

## Phase 5: User Story 4 — Unconfirmed emails don't linger (Priority: P2)

**Goal**: Weekly prune deletes expired pending and old removed entries.

**Independent Test**: clock +38 d → expired pending deleted, confirmed kept.

### Tests for User Story 4

- [ ] T040 [P] [US4] [unit] apps/api/src/jobs/prune-waitlist.test.ts: cutoffs computed from `now` (`expiry + 30 d`, `removed_at + 30 d`), count returned and logged without addresses
- [ ] T041 [P] [US4] [int] apps/api/test/waitlist.int.test.ts: clock +38 d after join → expired pending and 31-day-old removed deleted; confirmed, invited and fresh pending kept

### Implementation for User Story 4

- [ ] T042 [US4] apps/api/src/jobs/prune-waitlist.ts (`createPruneWaitlist({ waitlist, now })`); `pruneWaitlist` in apps/api/src/jobs/queues.ts; schedule `WAITLIST_PRUNE_CRON` in apps/api/src/worker.ts

**Checkpoint**: All stories pass

---

## Phase 6: Close-out

- [ ] T050 `pnpm lint && pnpm format:check && pnpm typecheck && pnpm test:unit && pnpm test:int`
- [ ] T051 [P] New docs/design/waitlist.md (table, statuses, join outcomes, confirm, limits, prune, view, deviations); one line in docs/architecture.md map; ADR-061 (registration gate and waitlist) drafted in docs/adr.md if 029 hasn't, with its index row
- [ ] T052 [P] README.md: waitlist endpoint, limits, how to read `waitlist_summary`
- [ ] T053 [P] CLAUDE.md ground rule line: waitlist joins only through `waitlist.service.join` (no enumeration, double opt-in)
- [ ] T054 PLAN.md: tick demo 6 (and the waitlist half of demo 2) only after quickstart section 4 has run on the deployed instance
- [ ] T055 Run quickstart.md validation
- [ ] T056 `/speckit-converge` until it reports Converged

---

## Dependencies & Execution Order

- **Foundational (Phase 1)**: blocks all stories
- **US1**: after Phase 1
- **US2**: after US1 (same service and route)
- **US3**: after Phase 1 (view only; can run in parallel with US1)
- **US4**: after Phase 1 (repo `pruneExpired`); int test needs US1's join
- **Close-out**: after all stories
- **Downstream**: 029 (gate) and 030 (landing form) start after US1 + US2 merge; 032 (admin) uses `markInvited`/`remove`

### Within Each User Story

- Tests written and FAILING before implementation
- shared → db → repo → service → route → `api:openapi`

---

## Notes

- [P] tasks = different files, no dependencies
- Test addresses use `example.test`; no real names or emails (specs and tests are public)
- Log decisions the plan did not make, and deviations (e.g. a different migration number), in implementation-notes.md as you go
- Commit after each task or logical group (e.g. `feat(api): waitlist join and confirm`)
