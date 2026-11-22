---

description: "Task list for 051 member email privacy"
---

# Tasks: Member email privacy — no addresses in member data

**Input**: Design documents from `/specs/051-member-email-privacy/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/members.md](./contracts/members.md), [quickstart.md](./quickstart.md)

**Tests**: REQUIRED (constitution V). Every task that adds logic has a matching test task, and every row of the plan's traceability table maps to a test task (noted per task as "trace: …").

**E2E tier**: full. One new `@full` spec. The smoke journeys stay unchanged (D465).

**Before T001**: rebase this branch on `origin/main` (one commit ahead, #182). Ask first (plan, "Settle before starting").

## Format: `[ID] [P?] [Story] [Tier?] Description`

- **[P]**: can run in parallel (different files, no dependency on an unfinished task)
- **[Story]**: US1, US2 or US3 from spec.md
- **[Tier]**: `[unit]`, `[int]`, `[e2e:full]`

---

## Phase 1: Foundational (Blocking Prerequisites)

**Purpose**: the column, the shared constant and the DTO field that every story reads.

- [ ] T001 Add `invitedByEmail` to `memberships` in packages/db/src/schema/memberships.ts: column `invited_by_email`, "`boolean NOT NULL DEFAULT false`" (data-model.md). No other schema change.
- [ ] T002 `pnpm db:generate` → packages/db/migrations/0029_invited_by_email.sql (additive `ADD COLUMN … NOT NULL DEFAULT false`, no backfill) + hand-written packages/db/migrations/down/0029_invited_by_email.down.sql that drops the column. Check the generated name matches `0029_invited_by_email`, or rename it together with the journal entry.
- [ ] T003 [P] Export `MEMBER_NAME = 'Member'` from packages/shared/src/schemas/profile.ts (the one copy of the literal, D459). Add `invitedBy` to `memberSchema` in packages/shared/src/schemas/membership.ts: "`(MemberSummary & { displayName: string }) | null`, with `id` nullable for the placeholder" (contracts/members.md). Reuse the shape of the existing `sharedBy` schema (D421) instead of writing a new one. Make `email` explicitly `string | null` if it is not already.
- [ ] T004 [P] [int] packages/db/test/memberships-invariants.int.test.ts: `invited_by_email` defaults to false on an insert that omits it and rejects null. packages/db/test/migrations.int.test.ts already round-trips every migration, including 0029's down file; make sure it passes.

**Checkpoint**: `pnpm db:migrate` applies 0029; `pnpm typecheck` passes (the `invitedBy` field may be temporarily filled with `null` in `memberships.service` so typecheck stays green).

---

## Phase 2: User Story 1 — Members never see each other's addresses (Priority: P1) 🎯 MVP

**Goal**: no member answer carries an address, for any role and any deck kind, the viewer's own row included (FR-001, FR-003, FR-004, FR-010).

**Independent Test**: on shared and communal decks with an owner, co-owner, maintainer, editor and reader (some with a username, some without), and a personal deck as its owner, every member-facing answer contains no member address. The inviter's pending typed-address row is the only exception, and US3 adds it.

### Tests for User Story 1

> Write these first and make sure they FAIL before implementation.

- [ ] T005 [P] [US1] [int] New apps/api/test/member-email-privacy.int.test.ts: the SC-001 scan. Build each deck kind with the roles above (users on `example.test`). As each role, call `GET /decks/{id}/members`, `PATCH /decks/{id}/members/{userId}` (as owner/co-owner), `POST /decks/{id}/invites` (both `{email}` and `{username}`), `GET /decks/{id}/events`, `GET /decks/{id}/review`, `GET /decks/{id}/shares`, `GET /shares/{id}` and the deck's item list. Assert that no JSON body contains any member's address, apart from one allowed case: the inviter's own `{email}` invite answer, and later (US3) their pending row. Include each viewer's own row (FR-004) and the implicit account-owner row. Trace: FR-001, SC-001, FR-004.
- [ ] T006 [P] [US1] [unit] apps/api/src/services/memberships.service.test.ts: `list` answers `email: null` on every row, the viewer's own row and the implicit owner row included. `changeRole` answers `email: null`. A `{username}` invite answers `email: null` (FR-003). Trace: FR-001, FR-003, FR-004.
- [ ] T007 [P] [US1] [int] apps/api/test/invites.int.test.ts: keep the existing case "username invite answers no address" and add that the pending row stays address-free in the members list for every viewer, the inviter included. Trace: FR-003.

### Implementation for User Story 1

- [ ] T008 [US1] apps/api/src/repositories/users.repo.ts: `summariesByIds` stops selecting `email` (D460). Fix the type fallout in apps/api/src/services/member-summaries.ts only as far as compiling needs. Initials move in T014.
- [ ] T009 [US1] apps/api/src/services/memberships.service.ts: `profileOf`/`list` set `email: null` on every row (drop the `username && viewerId !== id` rule). `changeRole` answers `email: null`. `invite` keeps the typed address only for `{email}` and `null` for `{username}`, as today. Leave `invitedBy: null` for now (US3 fills it). Make T005–T007 pass, apart from the US3 cases.
- [ ] T010 [US1] apps/web/src/deck-admin/MembersSection.tsx: no code change expected; the secondary line already falls back to `@username`. Confirm the members list and pickers (`EventNotifyFields`, `ReminderFields`) still render with `email: null` everywhere by running `MembersSection.test.tsx`. Record "no change" in implementation-notes.md, or fix and screenshot if a change turns out to be needed (UI reference: `span.muted` in `admin-member__who`).

**Checkpoint**: T005 passes except the US3 assertions (mark those `it.todo` until Phase 4); `memberships.int.test.ts` and `member-role.int.test.ts` pass.

---

## Phase 3: User Story 2 — A name that does not give away the address (Priority: P1)

**Goal**: wherever a member is shown to someone else, the name is profile name, else username, else "Member", and the initials follow it (FR-006, FR-007, FR-008). Deleted actors stay "Former member".

**Independent Test**: a member `dana.levi@example.test` with no names and no username shows nowhere to others with "dana", "levi" or initials "DL". With a username, it shows the username. Their own `/me` profile initials are unchanged.

### Tests for User Story 2

- [ ] T011 [P] [US2] [unit] packages/shared/src/schemas/profile.test.ts: `displayNameOf` returns the full name, else the username, else `MEMBER_NAME`, and never `displayName`. Whitespace-only names fall through. Trace: FR-006, D459.
- [ ] T012 [P] [US2] [unit] packages/shared/src/avatar/index.test.ts: `initialsFor({ firstName, lastName, fallback })`: names first; else the fallback split on `.`/`-`/`_`; `''` with no letters. Update the existing email-based cases to pass `fallback`. Trace: FR-007, D460.
- [ ] T013 [P] [US2] [unit] apps/api/src/services/member-summaries.test.ts: initials come from the username when there are no names, and are `''` with neither. No email is read. Trace: FR-007.
- [ ] T014 [P] [US2] [unit] apps/api/src/mail/templates.test.ts: `inviteEmail` with `inviterName === MEMBER_NAME` gives subject and body "A Gobbit member invited you to …"; any other name keeps "<name> invited you to …". Trace: D464.
- [ ] T015 [US2] [int] (after T005, same file) Add the SC-002 case to apps/api/test/member-email-privacy.int.test.ts: a `dana.levi@example.test` member with no names and no username makes a card, shares a link and changes something. As another member, the members row, activity actor, review `sharedBy`, share `reviewedBy` and item `creator` show "Member" with `initials: ''`, and no answer contains "dana", "levi" or "DL". Then set a username and see it as the name with its initials. Trace: FR-006, FR-007, SC-002.
- [ ] T016 [P] [US2] [int] Deleted actor and inviter floor: apps/api/test/item-events.int.test.ts keeps its existing deleted-actor case passing unchanged ("Former member"). apps/api/test/admin-waitlist.int.test.ts asserts that a deleted inviter's `invitedByName` is still null. Trace: D459 floor gated on `users.id`.
- [ ] T017 [P] [US2] [int] apps/api/test/profile.int.test.ts: `/me` `profile.initials` for a user with no names still comes from their own email (FR-008). `/me` `user.displayName` is the username, else "Member". Trace: FR-008, D459.

### Implementation for User Story 2

- [ ] T018 [US2] packages/db/src/schema/users.ts: `displayNameSql` becomes `coalesce(nullif(btrim(concat_ws(' ', first_name, last_name)), ''), username, CASE WHEN id IS NOT NULL THEN 'Member' END)`. Widen the `Pick` to include `id` and `username`. The literal comes from `MEMBER_NAME` if `@gobbit/db` may import `@gobbit/shared`; otherwise keep one literal with a comment pointing at `MEMBER_NAME`, and record the choice in implementation-notes.md. `users.display_name` is no longer read (D459).
- [ ] T019 [P] [US2] packages/shared/src/schemas/profile.ts: `displayNameOf({ firstName, lastName, username })` gives the full name, else `username`, else `MEMBER_NAME`. Update its callers (review `sharedBy`, shares `reviewedBy`, and any other caller `tsc` finds) to pass `username`. Check that `CurrentUser`/`users.findById` exposes `username` where these callers need it, and add it to that select if not.
- [ ] T020 [P] [US2] packages/shared/src/avatar/index.ts: `initialsFor({ firstName, lastName, fallback })` replaces the `email` parameter (same splitting).
- [ ] T021 [US2] Update every `initialsFor` caller (depends on T020):
  - apps/api/src/services/member-summaries.ts passes `fallback: username`, never `MEMBER_NAME`.
  - apps/api/src/services/profile.service.ts passes the own email (self).
  - apps/web/src/app/BottomBar.tsx and apps/web/src/profile/ProfileForm.tsx pass the own email (self, FR-008).
  - apps/api/src/services/memberships.service.ts, if it calls it directly.
  - The fixture in apps/api/test/item-events.int.test.ts (`initialsFor({ email })` → the new expectation).
  - Web: argument rename only, no visual change; state "no visual change, argument rename" in the task report instead of screenshots.
- [ ] T022 [P] [US2] apps/api/src/mail/templates.ts: `inviteEmail` uses the floor copy when `inviterName === MEMBER_NAME` (one ternary, D464). Check that `memberships.service` `sendInvite` passes the chain-built name (`inviter.displayName` from `CurrentUser`).
- [ ] T023 [US2] Update existing int expectations that assumed email-derived names, without changing what each test checks: apps/api/test/{memberships,item-events,shares,review,profile,auth,sessions,admin-waitlist,ingest-auto-publish}.int.test.ts. Expect the profile name, else the username, else "Member". The `e2e/tests/full/activity-log.spec.ts` and `e2e/tests/full/profile.spec.ts` read `me.user.displayName` at run time; run them to confirm, and edit only if one fails.

**Checkpoint**: T011–T017 pass; `pnpm test:unit` and `pnpm test:int` are green, apart from the US3 todos.

---

## Phase 4: User Story 3 — The inviter keeps track of the invites they sent (Priority: P2)

**Goal**: the inviter of a pending typed-address invite sees that address, and nobody else does. Such a row is anonymous to everyone. Owners and co-owners see "Invited by" (FR-002, FR-005, D461–D463).

**Independent Test**: owner A invites `noa@example.test` by address; co-owner B lists the members. A sees the address, B sees "invited by A" without it, and a reader sees neither. After Noa accepts, nobody sees the address and Noa's profile shows.

### Tests for User Story 3

- [ ] T024 [P] [US3] [int] apps/api/test/member-email-privacy.int.test.ts (turn the US1 todos into real cases):
  - The inviter sees their typed address on the pending row; the co-owner, maintainer, editor and reader don't.
  - After accept, nobody does.
  - A re-invite by the co-owner by address moves it to the co-owner.
  - A re-invite by username clears it for everyone.
  - A demoted inviter still sees it.
  - A pending invite created before the flag (insert a row with `invited_by_email` false) shows no address.
  - Trace: FR-002, D461.
- [ ] T025 [US3] [int] (after T024, same file) D462: invite by address an existing user who has a name, a username and a photo. The pending row and the invite answer show `displayName: "Member"`, `username: null`, `initials: ''`, `photo: null` to every viewer, the inviter included. After accept, the profile shows. A `{username}` invite's pending row keeps the summary. Trace: D462.
- [ ] T026 [US3] [int] (after T025, same file) D463: owner and co-owner get `invitedBy` (the inviter's summary plus `displayName`) on pending rows; maintainer, editor and reader get `null`; accepted rows get `null`. When the inviter is removed from the deck, `invitedBy` is the placeholder (`id: null`, `displayName: "Member"`, no photo). A deleted inviter account (`invited_by` null) gives the same placeholder. Trace: FR-005, D463.
- [ ] T027 [P] [US3] [unit] apps/api/src/services/memberships.service.test.ts: the per-viewer rules as pure cases (pending × typed × viewer-is-inviter → address; anonymous typed pending row; `invitedBy` by `can(role, 'member.invite')`; "inviter still on the deck" checked against the list in memory). Trace: D461–D463.
- [ ] T028 [P] [US3] [unit] apps/web/src/deck-admin/MembersSection.test.tsx: a pending row with `email` shows the address as its secondary line; a pending row with `invitedBy` shows "Invited by <displayName>"; a row with neither shows `@username` or nothing, as today. Trace: UI secondary line.
- [ ] T029 [P] [US3] [e2e:full] New e2e/tests/full/member-privacy.spec.ts (`@full`):
  - The owner invites an address and a reader (`member(deck, 'reader')` fixture).
  - The owner's Settings → Members shows the typed address on the pending row.
  - The reader's members screen shows no `@example.test` text, and no "Invited by".
  - Negative path: once the invitee accepts (`newUser` signs in through the mailbox), the owner no longer sees the address.
  - Trace: UI, FR-001, FR-002.

### Implementation for User Story 3

- [ ] T030 [US3] apps/api/src/repositories/memberships.repo.ts: `create` writes `invitedByEmail` (true for `{email}`, false for `{username}`), and `reinvite` rewrites it together with `invitedBy`, `role` and `invitedAt`. Select `invitedBy` and `invitedByEmail` in the list query if they are not there already.
- [ ] T031 [US3] apps/api/src/services/memberships.service.ts (after T009):
  - Address (D461): set the invitee's `users.email` only when the row is pending ∧ `invitedByEmail` ∧ `invitedBy === viewerId`.
  - Anonymous row (D462): a pending typed-address row is anonymous for every viewer, and so is the `{email}` invite answer.
  - Invited by (D463):
    - `invitedBy` is set on pending rows when `can(role, 'member.invite')`, built like `sharedBy` from the summaries.
    - The 046 placeholder replaces an inviter who isn't an implicit owner or an accepted member in the same list, and one whose `invitedBy` is null.
  - This makes T024–T027 pass.
- [ ] T032 [US3] `pnpm api:openapi` to regenerate packages/api-client (`Member.invitedBy`). CI checks for drift.
- [ ] T033 [US3] apps/web/src/deck-admin/MembersSection.tsx: the secondary `span.muted` line in `admin-member__who` becomes `member.email ?? (member.invitedBy ? 'Invited by ' + member.invitedBy.displayName : member.username ? '@' + member.username : null)`. Use the same element and class, with no new class or token. UI reference: the existing secondary line in `admin-member__who` (plan "UI reference"), with docs/design/ui-system.md. Screenshots: phone 412 px + desktop 1280 px, light + dark, of the members list as owner (a pending typed row, a pending username row with "Invited by") and as reader, compared with today's row.

**Checkpoint**: all int, unit and the `@full` spec pass; quickstart steps 1–7 behave as written.

---

## Phase 5: Close-out

**Purpose**: keep the repository's docs and gates true.

- [ ] T034 `pnpm lint && pnpm format:check && pnpm typecheck && pnpm test:unit && pnpm test:int && pnpm budget` (no new web import, so the budget is unchanged). Run `ui-system.test.ts`; its baselines must not rise.
- [ ] T035 E2E at the plan's tier: `pnpm test:e2e --grep @full` passes `member-privacy`, `activity-log`, `profile` and `deck-admin`; `@smoke` (`smoke/members.spec.ts`) passes unchanged in CI.
- [ ] T036 [P] docs/design/profile.md: replace the D419 paragraph ("clearing restores the old value") and the D420 paragraph (initials from email) with D459/D460. Add the per-viewer address rule (D461–D463) and the mail floor (D464). Add a "Deviations" entry list from implementation-notes.md. Note that the `users.display_name` follow-up is still open.
- [ ] T037 [P] docs/adr.md: ADR-084 (D459 name chain, D461 typed-invite flag, D462 anonymous pending typed row with its `userId` residual). docs/architecture.md: one ADR index row, keeping the file under 250 lines.
- [ ] T038 [P] CLAUDE.md, Profile ground rule: names are profile name, else username, else "Member" (`MEMBER_NAME`; null on a left join to a deleted user). Member answers carry no address except the inviter's own pending typed invite (`invited_by_email`). `initialsFor` takes `fallback` (the username for others, the own email for self).
- [ ] T039 [P] community-go-list.md: tick H6 (and G17) on merge, with a progress-log row for deviations. PLAN.md Phase 16: link spec 051. README.md: no change (no env var or command); confirm.
- [ ] T040 Run quickstart.md by hand (steps 1–7), then `/speckit-converge` until it reports Converged, then `/ponytail:ponytail-review`. The PR states "E2E tier: full — privacy rules are API answers covered by the int scan; one @full screen check", the visible change (nameless members show as username or "Member"), and that pending invites sent before deploy lose their address for the inviter.

---

## Dependencies & Execution Order

- **Rebase** before T001.
- **Phase 1** (T001–T004) blocks everything. T003 and T004 run in parallel with T001/T002, but T004 needs T002.
- **US1** (Phase 2) and **US2** (Phase 3) depend only on Phase 1 and touch different files, except two places:
  - T008 and T021 both edit `member-summaries.ts`, so run T008 first.
  - T009 and T021 meet in `memberships.service.ts` only if it calls `initialsFor`.
  - Otherwise US1 and US2 can run side by side.
- **US3** (Phase 4) depends on US1 (T009, the service it extends) and on T018/T019 (the shown name the anonymous row and `invitedBy` use).
- **Close-out** comes after all stories.

### Within each story

Tests first and failing → repository → service → `api:openapi` → web.

### Parallel examples

- Phase 1: T003 ‖ (T001 → T002 → T004)
- US1 tests: T005 ‖ T006 ‖ T007
- US2 tests: T011 ‖ T012 ‖ T013 ‖ T014 ‖ T016 ‖ T017, then T015 once T005 exists; implementation: T019 ‖ T020 ‖ T022, then T018 and T021, then T023
- US3 tests: (T024 → T025 → T026, one file) ‖ T027 ‖ T028 ‖ T029
- Close-out: T036 ‖ T037 ‖ T038 ‖ T039

## Implementation Strategy

- **MVP = Phase 1 + US1**: no address in any member answer. That alone closes the leak to readers. On its own it would hide the inviter's typed address (US3 restores it) and still show email-derived names (US2), so ship all three in one PR; this split only orders the work and the checkpoints.
- Then US2 (names), then US3 (inviter exception and "Invited by"), then close-out.

## Notes

- Log decisions the plan didn't make, and deviations, in `specs/051-member-email-privacy/implementation-notes.md`.
- Commit after each task or logical group (`feat(api): …`, `feat(db): …`, `test(api): …`).
- Repo is public: test data uses `example.test` addresses only.
