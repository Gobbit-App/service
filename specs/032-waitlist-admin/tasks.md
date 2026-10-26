---

description: "Task list for 032-waitlist-admin"
---

# Tasks: Waitlist admin and invite

**Input**: Design documents from `/specs/032-waitlist-admin/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/admin-waitlist-api.md; `028-waitlist` and `029-registration-gate` merged

**Tests**: REQUIRED (constitution V). Every row of the plan's traceability table maps to a test task below.

**Organization**: Tasks are grouped by user story.

## Format: `[ID] [P?] [Story] [Tier?] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: US1 review the list, US2 invite, US3 remove
- **[Tier]**: `[unit]` `*.test.ts(x)` next to code, `[int]` `apps/api/test/*.int.test.ts` (Docker), `[e2e:smoke]` `e2e/tests/smoke/`, `[e2e:full]` `e2e/tests/full/` (tier rule: constitution V, ADR-053)

---

## Phase 1: Foundational (Blocking Prerequisites)

- [ ] T001 [P] `PLATFORM_ADMINS` (comma list → normalized `string[]`, default empty) and `WAITLIST_INVITE_TTL_DAYS` in apps/api/src/env.ts + [unit] cases in env.test.ts; `WAITLIST_INVITE_TTL_DAYS_DEFAULT`, `ADMIN_WAITLIST_PAGE_MAX` in `@pb/shared`
- [ ] T002 [P] `isPlatformAdmin`, `requirePlatformAdmin` (404 `/problems/not-found`) in apps/api/src/access/platform-admin.ts + [unit] platform-admin.test.ts
- [ ] T003 [P] DTOs in packages/shared/src/schemas/waitlist-admin.ts; `meSchema.isPlatformAdmin` in packages/shared/src/schemas/auth.ts
- [ ] T004 No migration: confirm 028's `0018_waitlist` has `removed_at`, `removed_by`, `waitlist_removed_has_time` and `waitlist_entries_status_confirmed_idx` (they were moved there at planning time); stop and amend 028 if not + hand-written packages/db/migrations/down/0019_waitlist_admin.down.sql; schema in packages/db/src/schema/waitlist.ts
- [ ] T005 `GET /me` returns `isPlatformAdmin` (apps/api/src/routes/me.ts); [int] true/false case in apps/api/test/admin-waitlist.int.test.ts
- [ ] T006 Problems `waitlist-not-confirmed`, `waitlist-removed`, `waitlist-invited` in apps/api/src/errors/http-errors.ts

**Checkpoint**: Admin identity known to API and client; migration round-trips

---

## Phase 2: User Story 1 — Review the waitlist (Priority: P1)

**Goal**: Admins list and filter entries; everyone else gets 404.

**Independent Test**: three entries in different statuses; admin filters work; a deck owner who isn't an admin gets 404.

### Tests for User Story 1

- [ ] T010 [P] [US1] [int] 404 matrix: signed-out 401; reader, editor, deck owner, co-owner → 404 on `GET`, `POST …/invite`, `DELETE`, body identical to an unknown route, in apps/api/test/admin-waitlist.int.test.ts
- [ ] T011 [P] [US1] [int] List: default confirmed oldest-confirmed first; status and kind filters; keyset cursor across pages; `counts` follow the kind filter; `limit` > 100 → 400
- [ ] T012 [P] [US1] [unit] WaitlistScreen.test.tsx: tabs with counts, kind select, rows with `dir="auto"` notes, empty and offline states; SettingsScreen.test.tsx: Waitlist link only when `isPlatformAdmin`
- [ ] T013 [P] [US1] [unit] apps/web/src/api/persist.test.ts: admin waitlist key is not dehydrated

### Implementation for User Story 1

- [ ] T014 [US1] `listForAdmin`, `countsByStatus` in apps/api/src/repositories/waitlist.repo.ts
- [ ] T015 [US1] `waitlistAdmin.list` in apps/api/src/services/waitlist-admin.service.ts; wiring in services/index.ts
- [ ] T016 [US1] `GET /admin/waitlist` in apps/api/src/routes/admin-waitlist.ts; register in app.ts; `pnpm api:openapi`; example in api.http
- [ ] T017 [US1] apps/web/src/routes/admin.waitlist.tsx (code-split), apps/web/src/admin/WaitlistScreen.tsx, WaitlistRow.tsx, waitlist-queries.ts; key in api/query-keys.ts and `NOT_PERSISTED` in api/persist.ts; "Waitlist" link in settings/SettingsScreen.tsx; styles in styles.css

**Checkpoint**: Operator can see the confirmed queue on the phone

---

## Phase 3: User Story 2 — Invite (Priority: P1) 🎯 MVP (demo 5)

**Goal**: Invite a confirmed entry; the invitee signs in to their own personal deck with `general`.

**Independent Test**: invite one entry; consume the link; the new session lists exactly the personal deck with only `general`.

### Tests for User Story 2

- [ ] T020 [P] [US2] [unit] waitlist-admin.service.test.ts: `register` called with `waitlist_invite`; mail sent only after the transaction resolves; provider error → `mailSent: false`; one id-only log line per invite/resend
- [ ] T021 [P] [US2] [unit] `waitlistInviteEmail` in apps/api/src/mail/templates.test.ts (escaping, TTL wording, link)
- [ ] T022 [P] [US2] [int] Invite: entry → invited with `invited_by`, `invited_at`, `user_id`; account exists with 0 decks; `sign_in` link expires at `WAITLIST_INVITE_TTL_DAYS`; consuming it under `REGISTRATION_MODE=waitlist` opens a session and creates exactly one personal deck with only `general`
- [ ] T023 [P] [US2] [int] Rules: pending 409 `waitlist-not-confirmed`; removed 409 `waitlist-removed`; invited → 200 resend, new link, still one user; email already has an account (deck invite) → linked, not duplicated; two concurrent invites → one 201 + one 200, one user, entry invited once
- [ ] T024 [US2] [e2e:full] Admin invites a confirmed entry from the screen; the invitee opens the link in a new context and lands in "My deck" with `general` and no cards; a non-admin opening `/admin/waitlist` sees not-found, in e2e/tests/full/waitlist-admin.spec.ts (link retrieval per plan Risks; record the choice in implementation-notes.md)

### Implementation for User Story 2

- [ ] T025 [US2] `lockById`, `markInvited` in apps/api/src/repositories/waitlist.repo.ts; callback-style transaction repos in services/index.ts
- [ ] T026 [US2] `waitlistAdmin.invite` (transaction, mail after commit) in apps/api/src/services/waitlist-admin.service.ts; `waitlistInviteEmail` in apps/api/src/mail/templates.ts
- [ ] T027 [US2] `POST /admin/waitlist/{id}/invite` in apps/api/src/routes/admin-waitlist.ts; `pnpm api:openapi`
- [ ] T028 [US2] Invite / Resend actions and the "email couldn't be sent — resend" state in apps/web/src/admin/WaitlistRow.tsx + [unit] WaitlistRow.test.tsx

**Checkpoint**: PLAN.md demo 5 runs locally

---

## Phase 4: User Story 3 — Remove (Priority: P2)

**Goal**: Remove pending or confirmed entries.

**Independent Test**: removed entry leaves the default view, appears under Removed, can't be invited.

### Tests for User Story 3

- [ ] T030 [P] [US3] [int] pending/confirmed → 204 `removed` with `removed_at`/`removed_by`; invited → 409 `waitlist-invited`; removed → 204 no-op; a direct UPDATE to `removed` without `removed_at` violates `waitlist_removed_has_time`
- [ ] T031 [P] [US3] [unit] WaitlistRow.test.tsx: Remove asks to confirm, then DELETEs; not offered for invited rows

### Implementation for User Story 3

- [ ] T032 [US3] `markRemoved` (repo), `waitlistAdmin.remove` (service), `DELETE /admin/waitlist/{id}` (route); `pnpm api:openapi`
- [ ] T033 [US3] Remove action with confirmation in apps/web/src/admin/WaitlistRow.tsx

**Checkpoint**: All stories work independently

---

## Phase 5: Close-out

- [ ] T050 `pnpm lint && pnpm format:check && pnpm typecheck && pnpm test:unit && pnpm test:int && pnpm build:web && pnpm budget`
- [ ] T051 [P] docs/design/waitlist.md (admin section, Deviations), docs/design/auth.md (platform admins); docs/architecture.md: one line + ADR index row
- [ ] T052 [P] docs/adr.md: platform admins ADR from D234
- [ ] T053 [P] README.md, .env.example, infra/README.md: `PLATFORM_ADMINS`, `WAITLIST_INVITE_TTL_DAYS`
- [ ] T054 Run quickstart.md validation
- [ ] T055 `/speckit-converge` until it reports Converged

---

## Dependencies & Execution Order

- **Foundational (Phase 1)**: blocks all stories
- **US1** before **US2** in the UI (rows host the actions); the API parts of US2 and US3 are independent of US1's UI
- **US3** independent of US2
- **Close-out**: after all

### Within Each User Story

- Tests written and FAILING before implementation
- shared → migration → repo → service → route → `api:openapi` → web

---

## Notes

- [P] tasks = different files, no dependencies
- Log decisions the plan did not make, and deviations, in implementation-notes.md as you go
- Commit after each task or logical group (e.g. `feat(api): admin waitlist invite`)
