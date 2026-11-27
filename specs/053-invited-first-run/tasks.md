---
description: "Task list for 053 first run for invited people"
---

# Tasks: First run for invited people

**Input**: Design documents from `/specs/053-invited-first-run/`

**Prerequisites**: plan.md, spec.md, research.md (D478–D486), data-model.md, contracts/welcome.md, quickstart.md

**Tests**: REQUIRED. Constitution principle V: every task that adds logic has a matching test task at the
right tier, and every row of the plan's traceability table maps to a test task.

**Organization**: Tasks are grouped by user story. Both stories are P1: US1 is the welcome itself (the MVP), and US2 keeps it out of everyone else's way.

## Format: `[ID] [P?] [Story] [Tier?] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: US1 or US2 (spec.md)
- **[Tier]**: test tasks only: `[unit]`, `[int]`, `[e2e:smoke]`, `[e2e:full]` (plan: E2E tier smoke, D486)
- **UI tasks** name the sibling from the plan's "UI reference" line and end with the screenshot requirement (constitution X)

## Phase 0: Before starting

- [X] T000 Rebase `053-invited-first-run` on `origin/main` (one commit behind, #193) and confirm `pnpm typecheck && pnpm test:unit` still pass; confirm the welcome copy (plan § Settle before starting) and record it in specs/053-invited-first-run/implementation-notes.md

---

## Phase 1: Foundational (Blocking Prerequisites)

**Purpose**: the column, its backfill and the shared DTOs that both stories need

- [X] T001 Add `welcomeDismissedAt` to `memberships` in packages/db/src/schema/memberships.ts: column `welcome_dismissed_at`, "timestamptz(3) NULL", `timestamp({ withTimezone: true, precision: 3, mode: 'date' })`, nullable, no default (data-model § memberships, D478)
- [X] T002 `pnpm db:generate` → packages/db/migrations/0031_membership_welcome.sql, then append the backfill verbatim: `UPDATE memberships SET welcome_dismissed_at = accepted_at WHERE accepted_at IS NOT NULL` (active and removed rows alike; pending rows stay null). Hand-write packages/db/migrations/down/0031_membership_welcome.down.sql dropping the column
- [X] T003 [int] In packages/db/test/migrations.int.test.ts: the migration round-trips (up → down → up), an accepted row gets `welcome_dismissed_at = accepted_at`, a pending row stays null (FR-003, D478)
- [X] T004 [P] In packages/shared/src/schemas/deck.ts add `deckWelcomeSchema = { membershipId: string, inviter: memberSummarySchema | null }` and `deckDetailSchema = deckSchema.extend({ welcome: deckWelcomeSchema.nullable() })`, plus `DeckWelcome`/`DeckDetail` types, reusing the existing member summary schema (no email field). `deckSchema` stays unchanged (D479)
- [X] T005 [P] [unit] In packages/shared/src/schemas/deck.test.ts: `deckDetailSchema` accepts `welcome: null` and a welcome with `inviter: null`, and strips/rejects an `email` key on the inviter

**Checkpoint**: column, backfill and DTOs in place

---

## Phase 2: User Story 1 - An invited person is welcomed on the deck (Priority: P1) 🎯 MVP

**Goal**: after accepting any invite (address, username, link), the deck shows a one-time welcome naming the deck, the inviter and the role, with Categories, Search and Start reading; closing it holds on every device, offline included.

**Independent Test**: accept an invite to a deck with a few categories; the welcome names the deck, the inviter's shown name and the role; each entry point opens what it names; after closing, a reload and a second browser show no welcome (quickstart steps 1–7).

### Tests for User Story 1

> Write these first and make sure they FAIL before implementation.

- [X] T006 [P] [US1] [int] In apps/api/test/decks.int.test.ts: `GET /decks/{id}` answers `welcome` with `membershipId` and the inviter's summary for a member accepted through `memberships.accept` (address/username invite) and through a link; `inviter: null` when `invited_by` is null or the inviter is deleted; no `email` key anywhere in `welcome` (FR-001, FR-005)
- [X] T007 [P] [US1] [int] In apps/api/test/decks.int.test.ts: `DELETE /decks/{id}/welcome` answers 204 and the next `GET` has `welcome: null`; a second DELETE answers 204 again; 401 without a session; 404 for a deck the caller can't read; a pending (not accepted) row is left untouched; a new membership after removal and re-invite starts with a welcome (FR-002, D480, spec edge case)
- [X] T008 [P] [US1] [int] In apps/api/test/invite-links.int.test.ts: accepting a link while holding a pending typed invite from another owner sets `invited_by` to the link's creator, and the welcome names that creator (D482)
- [X] T009 [P] [US1] [unit] In apps/api/src/services/decks.service.test.ts: `dismissWelcome` logs `deck.welcome_dismiss` with outcome `dismissed`, `already_dismissed` or `no_membership` and fields requestId, userId, deckId, membershipId (ids only); `get` skips the membership read for the owning account (plan § Accountability, constitution VIII)
- [X] T010 [P] [US1] [unit] apps/web/src/deck-header/welcome-store.test.ts: add/has/remove membership ids under `gobbit:welcome-dismissed:v1` via `defaultStore()`; a corrupt value reads as empty (D481)
- [X] T011 [P] [US1] [unit] apps/web/src/deck-header/DeckWelcome.test.tsx:
  - shows deck name, inviter line (name, else username, else "a member"; omitted when `inviter` is null) and the `ROLE_LABELS[role]` line;
  - names wrapped in `<bdi>` (FR-009);
  - labelled dialog, Escape and Start reading dismiss (FR-010);
  - Categories is left out when the categories query is empty (FR-008);
  - Categories makes two history pushes: Browse with `fromListState`, then the same location with `withLayer(state, 'categories')` (D484);
  - Search calls the header's `setSearchOpen(true)`;
  - dismiss sets `welcome: null` in the `deckQuery(slug)` cache, adds the id to the pending store and sends the DELETE;
  - offline: the id stays pending, and on `online` the DELETE is re-sent and the id cleared on 204 or 404 (FR-011)
- [X] T012 [US1] [e2e:smoke] Extend e2e/tests/smoke/invite-link.spec.ts: after the guest lands on `/d/<slug>`, the consent wall shows alone; after answering it, the welcome names the deck and the inviter's shown name; "Start reading" closes it; after a reload, no welcome (FR-001, FR-002, FR-004, D486)
- [X] T013 [US1] [e2e:full] e2e/tests/full/welcome.spec.ts (`@full`): a mailed invite to a deck with two categories shows the welcome; Categories opens Browse with the list on top, and system back closes only the list; Search opens the focused search box; signing in as the same person in a new browser context shows no welcome (FR-001, FR-002, FR-007)

### Implementation for User Story 1

- [X] T014 [US1] In apps/api/src/repositories/memberships.repo.ts add `dismissWelcome(id, now)`: `UPDATE … SET welcome_dismissed_at = now WHERE id = $1 AND accepted_at IS NOT NULL AND deleted_at IS NULL AND welcome_dismissed_at IS NULL`, returning whether a row changed
- [X] T015 [US1] In apps/api/src/repositories/invite-links.repo.ts, existing-pending branch of accept: `.set({ role: link.role, acceptedAt: v.now, invitedBy: link.createdBy })` (D482)
- [X] T016 [US1] In apps/api/src/services/decks.service.ts:
  - `get` returns a `DeckDetail`. `welcome` is non-null only when the caller is not on the owning account, has an active membership (`memberships.findActive`) with `acceptedAt` set, and `welcomeDismissedAt` is null.
  - The inviter comes from `createMemberSummaries().summaries([invitedBy])`, or null.
  - Add `dismissWelcome(actor, deckIdOrSlug)`: resolve the deck, `authorize(deck.read)` (404 when unreadable), call the repo, then log `deck.welcome_dismiss` with its outcome (D479, D480)
- [X] T017 [US1] In apps/api/src/routes/decks.ts: `GET /decks/{id}` response schema → `deckDetailSchema`; add `DELETE /decks/{id}/welcome` (session auth, no body, 204/401/404 per contracts/welcome.md) that only parses and calls the service
- [X] T018 [US1] `pnpm api:openapi` (regenerate packages/api-client)
- [X] T019 [US1] In apps/web/src/api/queries.ts: `deckQuery` returns `DeckDetail`; add the dismiss call (`api.DELETE('/decks/{id}/welcome')`) in a small module next to it, e.g. apps/web/src/api/deck-welcome.ts
- [X] T020 [P] [US1] apps/web/src/deck-header/welcome-store.ts: pending membership ids in `gobbit:welcome-dismissed:v1` through `defaultStore()` from `lib/last-deck`, following `browse/hint-store.ts`; kept across sign-out (data-model § Web-only state, D481)
- [X] T021 [US1] apps/web/src/deck-header/DeckWelcome.tsx + rules in apps/web/src/deck-header/deck-header.css:
  - a `ui/sheet/Sheet` with a `sheet__title` heading and an action row of `ui/buttons` `Button`s (Categories, Search, Start reading), per contracts/welcome.md § Web;
  - copy and tone follow `browse/FirstRunHint`, with tokens only;
  - the categories entry makes the two pushes from D484.
  - Sibling: `browse/CategoryList`.
  - Screenshots: phone 412 px + desktop 1280 px, light + dark, compared with `CategoryList`.
- [X] T022 [US1] In apps/web/src/deck-header/DeckHeader.tsx: mount `DeckWelcome` on the deck's list views when `deck.welcome` is set and its `membershipId` is not pending. Pass `setSearchOpen` for the Search entry. While ids are pending, re-send their DELETE on mount and on the `online` event (D481, D483). Extend apps/web/src/deck-header/DeckHeader.test.tsx: mounted on list views only. Screenshots: phone 412 px + desktop 1280 px, light + dark, of the deck list with the welcome open, compared with `CategoryList`.

**Checkpoint**: US1 works on its own: T006–T013 pass

---

## Phase 3: User Story 2 - The welcome never gets in the way of existing members (Priority: P1)

**Goal**: no welcome for members from before release, deck creators, the owning account or the personal deck; the consent wall always comes first; "How to browse" waits for Browse's layers; nightly specs with invited members keep working.

**Independent Test**: an existing member and the deck creator see no welcome; a fresh invited person sees the consent wall first and the welcome only after answering, even after reopening the app offline; picking a category from the welcome shows "How to browse" only after the list has closed (quickstart steps 4, 8).

### Tests for User Story 2

- [X] T023 [P] [US2] [int] In apps/api/test/decks.int.test.ts: `welcome` is null for the deck creator, for an owning-account user with and without a stray membership row, and on the personal deck (apps/api/test/personal-deck.int.test.ts if that is where personal-deck reads are tested) (FR-003)
- [X] T024 [P] [US2] [unit] In apps/web/src/deck-header/DeckWelcome.test.tsx (or DeckHeader.test.tsx, wherever the gate lives): no welcome while `me` or `config` is loading; no welcome while `config.analytics` is on and consent is `unanswered`, both online and offline; it shows once consent is answered or analytics is off (FR-004, D483)
- [ ] T025 [P] [US2] [unit] In apps/web/src/browse/BrowseScreen.test.tsx: `FirstRunHint` does not render while a layer (`categories` or `full`) is open and renders once `layer` is null (FR-004, US2 scenario 5, D485)

### Implementation for User Story 2

- [X] T026 [US2] Gate `DeckWelcome` in apps/web/src/deck-header/DeckHeader.tsx (or DeckWelcome.tsx): wait for loaded `me`/`config`, and hide while `config.analytics && me.analyticsConsent.value === 'unanswered'`, regardless of `useOnline()`. Leave apps/web/src/analytics/ConsentPrompt.tsx unchanged (D483)
- [X] T027 [US2] In apps/web/src/browse/BrowseScreen.tsx: render `FirstRunHint` only when `hint && layer === null` (D485). Screenshots: phone 412 px + desktop 1280 px, light + dark, of Browse with the category list open and with the hint after a pick, compared with `CategoryList` / `FirstRunHint` as today
- [X] T028 [US2] [e2e:full] In e2e/tests/full/welcome.spec.ts: after picking a category from the welcome's list, "How to browse" shows only once the list has closed (US2 scenario 5)
- [X] T029 [US2] In e2e/fixtures/identity.ts `createMember`: after `declineAnalytics(api)`, send `DELETE decks/${deck.id}/welcome` and expect 204, so `@full` specs using `member()` (`member-privacy`, `profile`, `members-roles`) never meet the sheet (FR-012, plan § Risks)

**Checkpoint**: US1 and US2 both work; existing invite/accept int tests and e2e specs stay green

---

## Phase 4: Close-out

**Purpose**: keep the repository's docs and gates true

- [ ] T030 `pnpm lint && pnpm format:check && pnpm typecheck && pnpm test:unit && pnpm test:int` and `pnpm budget` (the sheet sits in the deck header chunk)
- [ ] T031 e2e at the plan's tier: `@smoke` passes in CI's `e2e` job; `pnpm test:e2e --grep "welcome|member"` passes locally for the `@full` specs touched (T013, T028, T029)
- [ ] T032 [P] docs/design/profile.md: a short "Welcome" section (D478–D485) and its "Deviations from the plan" list from implementation-notes.md
- [ ] T033 [P] docs/adr.md: ADR-086 (welcome dismissal on the membership, welcome on the single-deck read, offline pending set: D478, D479, D481); docs/architecture.md: one ADR index row
- [ ] T034 [P] CLAUDE.md "Roles" ground rule: one short clause on the welcome (`memberships.welcome_dismissed_at`, `DELETE /decks/{id}/welcome`, gated behind consent)
- [ ] T035 PLAN.md Phase 16 item 4: mark the first slice built; community-go-list.md: tick H8a on merge and add a progress-log line with deviations
- [ ] T036 Run quickstart.md validation (steps 1–9)
- [ ] T037 `/speckit-converge` until it reports Converged, then `/ponytail:ponytail-review` before the PR

---

## Dependencies & Execution Order

- **Phase 0** before everything.
- **Foundational (T001–T005)** blocks both stories. T002 depends on T001, and T003 on T002. T004 and T005 can run alongside T001–T003.
- **US1**:
  - API: T014 and T015 → T016 → T017 → T018.
  - Web: T019 needs T018. Then T020 → T021 → T022.
- **US2**:
  - T023 needs T016.
  - T026 needs T022 (same component).
  - T027 is independent of US1 and can start after Phase 1.
  - T028 extends T013.
  - T029 needs T017.
- **Close-out** comes after both stories.

### Within each story

- Tests first, and they fail before implementation.
- The order is schema → repository → service → route → `api:openapi` → web.

## Parallel Opportunities

- **Phase 1**: T004 and T005 alongside T001–T003.
- **US1 tests**: T006 and T007 share `decks.int.test.ts`, so run them one after the other. T008, T009, T010 and T011 are in different files and can run in parallel.
- **US1 implementation**: T015 (invite-links.repo) alongside T014 (memberships.repo). T020 (welcome-store) alongside T016–T019.
- **US2**: T025 and T027 (Browse) can run in parallel with the whole of US1.
- **Close-out**: T032, T033 and T034 in parallel.

## Implementation Strategy

- **MVP = Phase 1 + US1.** The welcome shows, closes for good and works offline. Ship nothing before US2's consent gate (T026), though: without it a fresh joiner can see two modals.
- Then US2, which is mostly small gates plus the fixture. The two stories can merge as one PR, as the plan intends one feature PR.

## Notes

- [P] tasks touch different files and have no dependencies.
- Log decisions the plan did not make, and deviations from it, in specs/053-invited-first-run/implementation-notes.md as you go.
- Commit after each task or logical group (conventional commits, e.g. `feat(api): deck welcome`).
- Spec traceability:
  - FR-001: T006, T012, T013
  - FR-002: T007, T012, T013
  - FR-003: T003, T023
  - FR-004: T012, T024, T025, T028
  - FR-005: T006, T011
  - FR-006 and FR-007: T011, T013
  - FR-008 to FR-010: T011
  - FR-011: T010, T011
  - FR-012: T029, plus the existing suites in T030 and T031
  - D480: T007
  - D482: T008
  - Accountability: T009
