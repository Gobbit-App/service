# Implementation Plan: Waitlist admin and invite

**Branch**: `032-waitlist-admin` | **Date**: 2026-10-26 | **Spec**: [spec.md](./spec.md) | **Roadmap**: `PLAN.md` § Phase 9 (demo 5)

**Input**: Feature specification from `/specs/032-waitlist-admin/spec.md`

Project override of the core template. Written for outside readers: the repository is public.

## Summary

**Who.** Platform admins are the emails in `PLATFORM_ADMINS` (D234). Everyone else gets 404 from `/admin/*`, and `GET /me` tells the app whether to show the entry.

**API.** `GET /admin/waitlist` (filter by status and kind, keyset pages, counts), `POST /admin/waitlist/{id}/invite` (confirmed → invited, or resend), `DELETE /admin/waitlist/{id}` (→ removed) (D235). An invite registers the account through 029's guarded `usersService.register(…, 'waitlist_invite')`, marks the entry and inserts a long-lived `sign_in` magic link in one transaction, then sends a "You're in" email after commit (D236). The personal deck is left to Phase 3B's `ensurePersonalDeck` on first sign-in — the demo proves the gate doesn't bypass it.

**Screen.** A code-split `/admin/waitlist` route in the PWA with status tabs, a kind filter and Invite / Resend / Remove per row; never persisted offline (D237). Admin actions leave `invited_by`/`removed_by` on the row and an id-only log line (D238).

## Starting point

- `main` with 028 and 029 merged (this feature can't start before both).
- From 028: `waitlist_entries` (statuses, `confirmed_at`, `invited_at`, `invited_by`, `user_id`), `waitlist.repo.ts`, `waitlist.service.ts`, `WAITLIST_KIND_LABELS` and the waitlist enums in `@pb/shared/waitlist`.
- From 029: `REGISTRATION_MODE`; `usersService.findExisting(email)` and `usersService.register(email, reason)` replace `findOrCreateByEmail`.
- Existing: `magic-links.repo.create` (per-row `expiresAt`, `purpose`, `next`); `auth.service.consumeMagicLink` (consume → user → `ensurePersonalDeck` → session); `mail/templates.ts`; `routes/me.ts` + `meSchema` (`packages/shared/src/schemas/auth.ts`); `env.ts` (`positiveInt`, comma-list transform like `CORS_ORIGINS`); `errors/http-errors.ts` (`/problems/not-found`, `/problems/conflict` family).
- Web: `/settings` → `settings/SettingsScreen.tsx` with `SettingsSection`; `api/persist.ts` `NOT_PERSISTED`; `api/query-keys.ts`; infinite-list precedent `api/events.ts` + `events/` (D188); `autoCodeSplitting`; `pnpm budget` (`apps/web/scripts/bundle-budget.ts`).
- e2e: `e2e/fixtures/api.ts` (API helpers with the smoke session); `MemoryMailer` is not reachable from e2e, so the journey reads the invite link through a test-only path (see Risks).

## Technical Context

**Language/Version**: TypeScript (strict, ESM, no build step) on Node ≥ 22; React 19

**Primary Dependencies**: Hono + `@hono/zod-openapi`, Drizzle; TanStack Router/Query. No new dependencies.

**Storage**: PostgreSQL 17. No migration: 028's `0018_waitlist` ships `removed_at`, `removed_by`, the CHECK and the list index.

**Testing**: Vitest unit and component tests; integration with Testcontainers; Playwright full

**E2E tier**: full — an operator-only screen on a secondary path: a regression blocks no member's core use, and the access and invite rules are guarded on every PR by int tests (non-admin 404 matrix, invite transaction, onboarding on first sign-in). One nightly journey: admin invites a confirmed entry, the invitee signs in and sees only their personal deck with `general`; plus a negative (non-admin gets not-found at `/admin/waitlist`). Sign-in itself stays covered by 029's smoke journey.

**Target Platform**: PWA on phones and desktop; Docker Compose on Dokploy

**Project Type**: pnpm monorepo — API, PWA, shared packages

**Performance Goals**: list of 50 entries renders < 1 s on a mid-range phone; invite round-trip < 2 s excluding mail delivery

**Constraints**: code-split route (bundle budget); plain CSS; waitlist data never persisted; no email in logs

**Scale/Scope**: hundreds to low thousands of entries; one or two admins

## Constitution Check

| Principle | How this plan complies |
|-----------|------------------------|
| I. Layered API | `routes/admin-waitlist.ts` (parse) → `waitlist-admin.service.ts` (admin guard, status rules, transaction, mail) → `waitlist.repo.ts` / `magic-links.repo.ts` (SQL). The guard is a service call, so Phase 12's `/admin/domains` and any later client reuse it. Non-admins get 404 (ADR-004). |
| II. One source of truth | `schemas/waitlist-admin.ts` and the `meSchema` change in `@pb/shared`; web uses the generated client and 028's `WAITLIST_KIND_LABELS` |
| III. Invariants in the DB | `removed` ⇔ `removed_at` CHECK; 028's invited/confirmed CHECKs and one-live-entry-per-email index; users' unique email; migration + hand-written down file, round-trip tested |
| IV. Private by default | Admin surface hidden (404) and env-defined; account creation only through 029's guarded entry point; emails never logged or persisted on the device; fixtures use `example.test` |
| V. Tests at the right tier | Unit (env parsing, guard, labels, components), int (admin matrix, invite transaction, concurrency, onboarding on first sign-in), e2e full journey + negative |
| VI. Lean web | Code-split route, plain CSS, `pnpm budget`; the waitlist query key is added to `NOT_PERSISTED` |
| VII. Simple, optional | `PLATFORM_ADMINS` empty by default = feature dormant; no new dependency; mail via the existing `Mailer` |

No violations.

## Decisions this plan pins down

Full reasoning in [research.md](./research.md).

| ID | Decision | ADR? |
|----|----------|------|
| D234 | Platform admins = `PLATFORM_ADMINS` env emails; `isPlatformAdmin` / `requirePlatformAdmin` in `access/platform-admin.ts`; 404 for everyone else; `GET /me.isPlatformAdmin` | yes — ADR-062 at close-out (Phase 12 reuses it) |
| D235 | `GET /admin/waitlist` (status default `confirmed`, kind, keyset, counts), `POST …/{id}/invite` (201 / 200 resend; 409 pending/removed), `DELETE …/{id}` (→ removed; 409 invited) | no |
| D236 | Invite = one transaction (lock entry, `usersService.register(…, 'waitlist_invite')`, mark invited, `sign_in` link with `WAITLIST_INVITE_TTL_DAYS`), mail after commit with `mailSent` flag; no deck at invite — Phase 3B onboarding on first sign-in | no |
| D237 | PWA `/admin/waitlist`, code-split; Settings link only for admins; waitlist queries in `NOT_PERSISTED`; online-only | no |
| D238 | `invited_by`/`removed_by` on the row, id-only log line per action; no admin events table | no |

## Project Structure

### Documentation (this feature)

```text
specs/032-waitlist-admin/
├── spec.md
├── checklists/requirements.md
├── plan.md
├── research.md
├── data-model.md
├── contracts/admin-waitlist-api.md
├── quickstart.md
├── tasks.md
└── implementation-notes.md   # created during /speckit-implement
```

### Source Code (repository root)

```text
packages/shared/src/
├── schemas/waitlist-admin.ts                # NEW: query, entry, page, invite result
├── schemas/auth.ts                          # meSchema + isPlatformAdmin
└── limits.ts (or constants)                 # + WAITLIST_INVITE_TTL_DAYS_DEFAULT, ADMIN_WAITLIST_PAGE_MAX

packages/db/
├── src/schema/waitlist.ts                   # + removedAt, removedBy, CHECK, index (if not in 028)
└── (no migration — 028 ships the schema)

apps/api/src/
├── env.ts                                   # + PLATFORM_ADMINS (list), WAITLIST_INVITE_TTL_DAYS
├── access/platform-admin.ts                 # NEW: isPlatformAdmin, requirePlatformAdmin (+ .test.ts)
├── repositories/waitlist.repo.ts            # + listForAdmin, countsByStatus, lockById, markInvited, markRemoved
├── services/waitlist-admin.service.ts       # NEW: list, invite, remove (+ .test.ts)
├── services/index.ts                        # wire service + transaction repos
├── mail/templates.ts                        # + waitlistInviteEmail (+ test)
├── errors/http-errors.ts                    # + waitlist-not-confirmed, waitlist-removed, waitlist-invited
├── routes/admin-waitlist.ts                 # NEW
├── routes/me.ts                             # + isPlatformAdmin
└── app.ts                                   # register admin routes
apps/api/test/admin-waitlist.int.test.ts     # NEW

apps/web/src/
├── routes/admin.waitlist.tsx                # NEW (code-split)
├── admin/WaitlistScreen.tsx                 # NEW: tabs, filter, list, empty/offline states
├── admin/WaitlistRow.tsx                    # NEW: entry + actions
├── admin/waitlist-queries.ts                # NEW: infinite query, mutations, invalidation
├── admin/*.test.tsx                         # NEW component tests
├── api/query-keys.ts, api/persist.ts        # + adminWaitlist key, NOT_PERSISTED
└── settings/SettingsScreen.tsx              # + "Waitlist" link when isPlatformAdmin
e2e/tests/full/waitlist-admin.spec.ts        # NEW
```

**Structure Decision**: a top-level `admin/` folder in the web app and `admin-waitlist` route/service in the API, separate from `deck-admin/` (deck roles) — platform admin is a different authority. Phase 12 adds `/admin/domains` beside it.

## Invariant → test traceability

| Invariant / rule | Enforced in | Test (file, tier) |
|------------------|-------------|-------------------|
| FR-001 env-defined admins; 404 for everyone else | `env.ts`, `access/platform-admin.ts`, every admin route | `env.test.ts` (unit: trims, lower-cases, empty); `platform-admin.test.ts` (unit); `admin-waitlist.int.test.ts` (int: signed-out 401; reader, deck owner, co-owner → 404 on all three routes, body identical to unknown route) |
| FR-002 list, filters, paging, counts | `waitlist-admin.service.list`, `waitlist.repo.listForAdmin` | `admin-waitlist.int.test.ts` (int: default confirmed oldest-first; status/kind filters; cursor stable across pages; counts follow kind) |
| FR-003 invite registers via the guarded entry point, records inviter, sends mail | `waitlist-admin.service.invite`, `usersService.register` | `waitlist-admin.service.test.ts` (unit: calls `register` with `waitlist_invite`, mail after commit, `mailSent:false` on provider error); int: entry invited with `invited_by`, user exists, `sign_in` link expires after `WAITLIST_INVITE_TTL_DAYS`, works with `REGISTRATION_MODE=waitlist` |
| FR-004 no deck at invite; onboarding on first sign-in | `invite` doesn't touch decks; `consumeMagicLink` → `ensurePersonalDeck` | int: after invite the account has 0 decks; after consuming the link it has exactly one, personal, with only `general`; e2e full journey |
| FR-005 pending/removed not invitable; resend; one account per email | service status checks under `FOR UPDATE`; users unique email | int: pending 409, removed 409, invited → 200 resend with a new link and still one user; pre-existing account (deck invite) linked, not duplicated; two concurrent invites → one 201 + one 200, one user |
| FR-006 remove pending/confirmed only | service + `waitlist_removed_has_time` (028) | int: pending/confirmed → 204 removed with `removed_by`; invited 409; removed → 204 no-op; DB rejects `removed` without `removed_at` |
| FR-007 `me.isPlatformAdmin` and hidden entry | `routes/me.ts`; `SettingsScreen` | int: `/me` true/false; `SettingsScreen.test.tsx` (unit: link only when true) |
| FR-008 code-split, not persisted | route split; `NOT_PERSISTED` | `pnpm budget` (CI); `persist.test.ts` (unit: admin waitlist key not dehydrated); `WaitlistScreen.test.tsx` (unit: offline message) |
| FR-009 trace | service, log sink | `waitlist-admin.service.test.ts` (unit: one log line per action with ids, no email) |
| Journey | — | `e2e/tests/full/waitlist-admin.spec.ts` (e2e:full: invite → sign in → own deck with `general`; non-admin sees not-found) |

## Rollout

- **Migrations**: none (028 ships the schema).
- **Env / config**: `PLATFORM_ADMINS` (set to the operator emails in Dokploy), optional `WAITLIST_INVITE_TTL_DAYS`. Document both in `README.md`, `.env.example` and `infra/README.md`.
- **API client**: `pnpm api:openapi` (admin routes, `me.isPlatformAdmin`).
- **Deploy order / flags**: one deploy; with `PLATFORM_ADMINS` unset the feature is dormant.
- **Docs**: `docs/design/waitlist.md` (admin section), `docs/design/auth.md` (platform admins), `docs/architecture.md` (one line + ADR row), `docs/adr.md` (platform admins ADR).

## Risks

| Risk | Likelihood / impact | Mitigation |
|------|---------------------|------------|
| Admin list leaks emails to non-admins | L / H | 404 guard in the service for every route; int matrix over every role and route; DTO only built in the admin service |
| Invite path skips onboarding and the user lands with no deck | L / H | No deck code in invite; int + e2e assert the deck appears only after first sign-in, through `ensurePersonalDeck` |
| Mail provider down at invite time | M / L | Mail after commit, `mailSent:false`, Resend button |
| e2e can't read the invite email | M / M | The journey reads the link through the same test-only mailbox hook other e2e use if one exists; otherwise it asserts the invite via API and signs in by minting a `sign_in` link through a test fixture against the local stack only (full tier never runs post-deploy against real mail). Decide in implementation-notes. |
| Emails cached on a shared phone | L / M | `NOT_PERSISTED`; online-only screen |

## Settle before starting

- [ ] 028 and 029 merged; confirm 028's column names (`removed_at`/`removed_by` and the list index were moved into 028 at planning time).
- [x] Invite email signed "Gobbit" (owner, 2026-10-26)
- [ ] Owner question in the spec: remove vs. erase.

## Complexity Tracking

None.
