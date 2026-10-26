# Implementation Plan: Waitlist with double opt-in

**Branch**: `028-waitlist` | **Date**: 2026-10-26 | **Spec**: [spec.md](./spec.md) | **Roadmap**: `PLAN.md` § Phase 9 (demos 2 and 6)

**Input**: Feature specification from `/specs/028-waitlist/spec.md`

Project override of the core template. Written for outside readers: the repository is public.

## Summary

**Store.** One table, `waitlist_entries` (D217): one live row per email, with kind, optional note, source (`landing` | `sign_in`), campaign tag and a status (`pending → confirmed → invited`, or `removed`). CHECKs tie each status to its timestamps; a partial unique index allows one live entry per email.

**Join.** `waitlist.service.join()` holds every rule (D218):

- `POST /waitlist` (JSON, OpenAPI) calls it with `source = 'landing'`. 030's HTML form and 029's sign-in gate call the same function.
- Every well-formed request answers `202 { ok: true }`, whether the email is new, already listed, already a user, or a bot. Only the mail differs: a confirmation link, an "already have an account" note, or nothing.
- Confirmation tokens are 32 random bytes; only the sha256 is stored, on the entry. They expire after 7 days.

**Confirm.** `GET /waitlist/confirm?token=` confirms in one atomic `UPDATE` and redirects to `${APP_URL}/welcome?confirmed=1` (or `?confirm=invalid`). 030 renders those pages.

**Spam.** A `website` honeypot (silent drop), 10 joins per IP per hour in memory (D175 limiter, own bucket), and 3 per email per hour in `rate_limit_counters` (D219). No CAPTCHA.

**Retain.** A weekly `prune-waitlist` job deletes pending entries 30 days after their link expired and removed entries 30 days after removal (D220).

**Report.** A SQL view, `waitlist_summary`, counts entries by ISO week, kind, source and effective status, where `joined` = invited and the user has signed in (D221).

No screen. No AI. No new dependency or env var.

## Starting point

- `main @ f78bfa6`. Latest migration `0017_share_status`.
- Users: `usersService.findOrCreateByEmail()` is the only user creator; `usersRepo.findByEmail()` looks up live users; `normalizeEmail()` lives in `services/users.service.ts`.
- Sign-in: `POST /auth/magic-link` (D22–D26) answers `200` for every well-formed email; `lib/tokens.ts` (`generateToken`, `hashToken`); `lib/auth-redirect.ts` builds `APP_URL` redirects with an API fallback.
- Rate limits: `rateLimits.enforce(key, limit)` over `rate_limit_counters` (D39, keys in `lib/rate-window.ts`); `createAnonRateLimiter` + `publicRateLimit({ limiter, ipHeader, now, onLimited })` wired in `app.ts` for `/public/*`, `/p/*` (D175, D182). Hourly limits live in `packages/shared/src/limits.ts`.
- Mail: `Mailer` (`ResendMailer`, `ConsoleMailer`, `MemoryMailer` in tests); templates in `mail/templates.ts`.
- Jobs: `QUEUES` in `jobs/queues.ts`, schedules in `worker.ts`, factory per prune job (`jobs/prune-search-queries.ts`); domain cron constants in `@pb/shared` (`INGEST_PRUNE_CRON` in `ingest/constants.ts`).
- Migrations: Drizzle-generated, hand-written SQL appended (`0007_default_deck`); down files in `packages/db/migrations/down/`; up/down round trip in `packages/db/test/migrations.int.test.ts`.

## Technical Context

**Language/Version**: TypeScript (strict, ESM, no build step) on Node ≥ 22

**Primary Dependencies**: Hono + `@hono/zod-openapi`, Drizzle, pg-boss, Resend (existing). No new dependency.

**Storage**: PostgreSQL 17. One migration: three enums, `waitlist_entries` with CHECKs and an `updated_at` trigger, view `waitlist_summary`.

**Testing**: Vitest unit (schema, templates, service with fakes, prune factory); integration with Testcontainers (endpoint, confirm, limits, CHECKs, prune, view)

**E2E tier**: none — no UI in this feature; the endpoint, confirm redirect, limits, prune and view are covered by integration tests. The browser journey (landing form → mail → confirmed page) is 030's smoke test.

**Target Platform**: API and worker in Docker Compose on Dokploy

**Project Type**: pnpm monorepo — API, worker, shared packages

**Performance Goals**: join < 500 ms p95 with the Resend call in the request (SC-004); confirm < 100 ms

**Constraints**: same answer for every well-formed join (no enumeration); tokens stored hashed; no third-party script; nothing written for a honeypot drop; no email addresses in logs

**Scale/Scope**: hundreds to a few thousand entries before Phase 11

## Constitution Check

| Principle | How this plan complies |
|-----------|------------------------|
| I. Layered API | Route parses → `waitlist.service` (rules, mail) → `waitlist.repo` (Drizzle). The gate (029) and the form (030) call the service, never the repo |
| II. Typed contracts | `waitlistJoinSchema` in `@pb/shared`; OpenAPI route; `pnpm api:openapi` regenerates the client |
| III. Invariants in the DB | Lower-case email, note length, utm format, status ↔ timestamp CHECKs, one live entry per email (partial unique index); view computed in SQL |
| IV. Private by default | No enumeration (D22 extended); token hashes only; view exposes counts, not emails; prune bounds unconfirmed data; logs without addresses |
| V. Tests at the right tier | Unit for schema, templates, service branches, prune factory; int for every FR; E2E tier none (no UI here; 030 owns the journey) |
| VI. Lean web | No web change |
| VII. Simple, optional | No new env var or dependency; works with `ConsoleMailer` locally and without AI keys |

No violations.

## Decisions this plan pins down

Full reasoning in [research.md](./research.md).

| ID | Decision | ADR? |
|----|----------|------|
| D217 | `waitlist_entries`: kind `family/community/personal/other`, source `landing/sign_in`, status `pending/confirmed/invited/removed`; note ≤ 500, `utm_source` ≤ 64 `[a-z0-9_-]`; confirm token hash + expiry on the entry; `confirmed_at`/`invited_at`/`invited_by`/`user_id`/`removed_at`; lower-case CHECK; unique `email WHERE status <> 'removed'`; status ↔ timestamp CHECKs; transitions in the service | ADR-059 (with 029) |
| D218 | One `waitlist.service.join()` for API, form and gate; `202 { ok: true }` for every well-formed request; outcomes differ only by mail (confirm / existing user / none); `GET /waitlist/confirm` atomic `UPDATE`, `303` to `/welcome?confirmed=1` or `?confirm=invalid` (`200` JSON without `APP_URL`); TTL 7 days; mail after commit, failure logged, still `202` | ADR-059 |
| D219 | Honeypot `website` (silent drop, log line); 10/IP/hour in the anonymous in-memory limiter (own bucket, shared with confirm and 030's form); 3/email/hour in `rate_limit_counters` (`waitlist:email:<sha256>`), checked before lookup; gate calls skip both; no CAPTCHA | ADR-059 |
| D220 | Weekly `prune-waitlist` (`'0 6 * * 0'`): delete pending 30 days after expiry, removed 30 days after removal; count logged | no |
| D221 | `waitlist_summary` view: week, kind, source, effective status (`joined` = invited + user has a session), count | no |

## Project Structure

### Documentation (this feature)

```text
specs/028-waitlist/
├── spec.md
├── checklists/requirements.md
├── research.md          # D217–D221
├── plan.md              # this file
├── data-model.md        # migration, view, constants, DTOs, mail
├── contracts/waitlist-api.md
├── quickstart.md
├── tasks.md
└── implementation-notes.md   # created during /speckit-implement
```

### Source Code (repository root)

```text
packages/shared/src/
├── enums.ts                     # + waitlistKinds, waitlistSources, waitlistStatuses
├── limits.ts                    # + WAITLIST_JOIN_PER_IP_PER_HOUR, WAITLIST_JOIN_PER_EMAIL_PER_HOUR
├── waitlist/constants.ts        # NEW: note/utm max, TTL, retention, prune cron (subpath ./waitlist-constants)
├── schemas/waitlist.ts          # NEW: waitlistJoinSchema, response, confirm result (+ .test.ts)
└── index.ts                     # export schemas
packages/shared/package.json     # + "./waitlist-constants"

packages/db/
├── src/schema/common.ts         # + waitlistKind/Source/Status pgEnums
├── src/schema/waitlist-entries.ts   # NEW
├── src/schema/index.ts          # export
├── migrations/0018_waitlist.sql     # generated + hand-written CHECKs, trigger, view
├── migrations/down/0018_waitlist.down.sql
└── test/waitlist-invariants.int.test.ts   # NEW: CHECKs, unique index, view

apps/api/src/
├── repositories/waitlist.repo.ts    # NEW: upsertPending, findLive, confirmByTokenHash, markInvited, remove, pruneExpired
├── services/waitlist.service.ts     # NEW (+ .test.ts with fakes)
├── services/index.ts                # wire service (mailer, rateLimits, users repo, env)
├── routes/waitlist.ts               # NEW: POST /waitlist (OpenAPI), GET /waitlist/confirm
├── app.ts                           # waitlist anon limiter bucket on /waitlist/*; register routes
├── lib/rate-window.ts               # + rateKeys.waitlistEmail
├── mail/templates.ts                # + waitlistConfirmEmail, waitlistExistingUserEmail (+ tests)
├── jobs/prune-waitlist.ts           # NEW (+ .test.ts)
├── jobs/queues.ts                   # + pruneWaitlist
└── worker.ts                        # schedule WAITLIST_PRUNE_CRON
apps/api/test/waitlist.int.test.ts   # NEW
apps/api/api.http                    # + join/confirm examples
packages/api-client/                 # regenerated (pnpm api:openapi)
```

## Invariant → test traceability

| Invariant / rule | Enforced in | Test (file, tier) |
|------------------|-------------|-------------------|
| FR-001 fields and validation | `waitlistJoinSchema` | `schemas/waitlist.test.ts` (unit: kinds, note 500/501 code points incl. emoji, bad email, utm dropped not rejected, unknown field); `waitlist.int.test.ts` (int: `400` problem with field errors) |
| FR-002 double opt-in, single use, 7 days | `waitlist.service.confirm`, atomic `UPDATE` | `waitlist.int.test.ts` (int: confirm → `confirmed`, `303 /welcome?confirmed=1`; reuse, unknown, expired (clock + 7 d) → `?confirm=invalid`, row unchanged; two parallel confirms → one success; no `APP_URL` → `200` JSON) |
| FR-003 same answer | `waitlist.service.join` | `waitlist.int.test.ts` (int: new / pending / confirmed / existing user / honeypot → identical status, headers and body); `waitlist.service.test.ts` (unit: outcome table and mails per branch) |
| FR-004 honeypot | `join` | `waitlist.int.test.ts` (int: no row, `MemoryMailer` empty, log line without the address) |
| FR-005 limits | `publicRateLimit` bucket; `rateLimits.enforce(rateKeys.waitlistEmail)` | `waitlist.int.test.ts` (int: 11th from one IP `429` + `Retry-After`; 4th for one email `429` before any lookup (existing user and new email behave the same); confirm shares the IP bucket; `skipRateLimits` bypasses both) |
| FR-006 callable service with source | `waitlist.service.join({ source })` | `waitlist.service.test.ts` (unit: `sign_in` wording; form fields not overwritten by a `sign_in` re-join) |
| FR-007 transitions and CHECKs | service + DB CHECKs | `waitlist-invariants.int.test.ts` (int: each CHECK rejects a contradicting row; second live entry for an email rejected; removed email can re-join); `waitlist.service.test.ts` (unit: `markInvited` from non-confirmed and `remove` of removed → 409) |
| FR-008 retention | `prune-waitlist` | `prune-waitlist.test.ts` (unit: cutoffs from `now`); `waitlist.int.test.ts` (int: clock +38 d deletes expired pending and old removed, keeps confirmed/invited and fresh pending) |
| FR-009 summary view | migration SQL | `waitlist-invariants.int.test.ts` (int: counts per week/kind/source/status; invited + session → `joined`; removed counted) |
| FR-010 hashed tokens | `hashToken` before insert | `waitlist.int.test.ts` (int: stored hash ≠ token, equals sha256 of the mailed token) |
| Migration reversible | down file | `packages/db/test/migrations.int.test.ts` (int: existing round-trip test covers 0018) |
| No addresses in logs | service logging | `waitlist.int.test.ts` (int: `capture-logger` output contains no test address for honeypot, mail failure, prune) |

## Rollout

- **Migrations**: `0018_waitlist` (number re-checked when implementing; another feature may land first). Down file drops view, table and types.
- **Env / config**: none new. Confirm links use `API_URL`, redirects use `APP_URL` (both exist). Production already requires `RESEND_API_KEY` for sign-in.
- **API client**: `pnpm api:openapi` (adds `POST /waitlist`; the confirm `GET` stays outside OpenAPI like `/auth/callback`).
- **Deploy order / flags**: migration then API and worker (normal). The endpoint is live but unlinked until 030 ships the form; nothing calls it with `source = 'sign_in'` until 029.

## Risks

| Risk | Likelihood / impact | Mitigation |
|------|---------------------|------------|
| Mail scanners prefetch the confirm link | M / L | Accepted (D218): the scanner works for the address owner; outcome idempotent |
| Confirmation mails used to spam third parties | L / M | 3 per address per hour, 10 per IP per hour, honeypot; mail text says "ignore if this wasn't you" |
| One community NAT hits the IP limit at a launch event | M / L | Limit is a constant in `limits.ts`; raise it before an event (open question in research.md) |
| Timing difference between branches hints at existence | L / L | Mail is sent in every branch except honeypot/confirmed; content identical; accepted residual |
| Migration number collides with a parallel feature | M / L | Re-number at implementation time; record in implementation-notes.md |

## Settle before starting

- [ ] Rate-limit values: 10 per IP and 3 per email per hour (research.md open question).
- [x] Double opt-in, no CAPTCHA, summary via SQL only (settled 2026-10-26, spec Clarifications).

## Complexity Tracking

| Item | Why needed | Simpler alternative rejected because |
|------|------------|---------------------------------------|
| First SQL view in the schema | Demo 6 asks for a SQL view; no code reads it | A route + screen is 032's job; a materialized view needs refreshes |
