---

description: "Task list for 019-deck-admin"
---

# Tasks: Deck admin screens

**Input**: Design documents from `/specs/019-deck-admin/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/deck-admin.md; `016-public-read-api` merged

**Tests**: REQUIRED (constitution V). Every row of the plan's traceability table maps to a test task below.

**Organization**: Tasks are grouped by user story.

## Format: `[ID] [P?] [Story] [Tier?] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: US1 deck and categories, US2 members
- **[Tier]**: `[unit]` `*.test.ts(x)` next to code, `[int]` `apps/api/test/*.int.test.ts` (Docker), `[e2e:smoke]` `e2e/tests/smoke/`, `[e2e:full]` `e2e/tests/full/` (tier rule: constitution V, ADR-053)

---

## Phase 1: Foundational (Blocking Prerequisites)

- [ ] T001 [P] `ROLE_LABELS`, `VISIBILITY_LABELS` in packages/shared/src/authz/labels.ts + [unit] test (every role and visibility labelled); `./authz` subpath export if missing
- [ ] T002 [P] `memberRolePatchSchema` in packages/shared/src/schemas/membership.ts
- [ ] T003 Lazy route apps/web/src/routes/d.$slug.settings.tsx + apps/web/src/deck-admin/DeckAdminScreen.tsx shell + deck-admin-queries.ts; "Deck settings" entry for owner/maintainer in the deck menu
- [ ] T004 [P] [unit] DeckAdminScreen.test.tsx: section and control set per role (owner, maintainer, editor, reader, personal deck)

**Checkpoint**: Empty settings screen reachable for admins; budget unchanged

---

## Phase 2: User Story 1 — Deck and categories (Priority: P1) 🎯 MVP

**Goal**: Rename, public switch, category visibility from the app.

**Independent Test**: owner makes a deck and a category public from the screen; the card is at the public address.

### Tests for User Story 1

- [ ] T010 [P] [US1] [unit] PublicSwitchDialog.test.tsx: lists public categories; "none public" warning; cancel sends nothing; confirm sends `{ isPublic: true }`
- [ ] T011 [P] [US1] [unit] DeckSection.test.tsx: rename; switch disabled for maintainer; public URL + copy when public; personal deck has no switch
- [ ] T012 [P] [US1] [unit] CategoriesSection.test.tsx: rename and visibility send the category PATCH; list refetches; offline → read-only

### Implementation for User Story 1

- [ ] T013 [US1] apps/web/src/deck-admin/DeckSection.tsx + PublicSwitchDialog.tsx
- [ ] T014 [US1] apps/web/src/deck-admin/CategoriesSection.tsx
- [ ] T015 [US1] Styles in apps/web/src/styles.css (plain CSS)

**Checkpoint**: Demo setup (public deck, three public categories) possible from the phone

---

## Phase 3: User Story 2 — Members (Priority: P1)

**Goal**: Invite with role (incl. co-owner), change role, remove/cancel.

**Independent Test**: invite a co-owner from the screen; after accepting they can change the public switch and can't delete the deck.

### Tests for User Story 2

- [ ] T020 [P] [US2] [int] Role PATCH matrix: owner ✓; co-owner ✓; maintainer/editor/reader 403; own role 409; implicit owner 409; pending 409; last owner 409; unknown user 404; role applies on next request, in apps/api/test/members.int.test.ts
- [ ] T021 [P] [US2] [unit] InviteForm.test.tsx: role options with labels; server errors under the field
- [ ] T022 [P] [US2] [unit] MembersSection.test.tsx: pending vs accepted rows; role select hidden for implicit owners and self; remove confirms then DELETEs; non-owners see a plain list
- [ ] T023 [P] [US2] [e2e:full] Owner makes a deck public with one public category, invites a co-owner who accepts and changes a category's visibility, in e2e/tests/full/deck-admin.spec.ts

### Implementation for User Story 2

- [ ] T024 [US2] `memberships.repo.updateRole`, `countOwners` (FOR UPDATE) in apps/api/src/repositories/memberships.repo.ts
- [ ] T025 [US2] `memberships.service.changeRole` in apps/api/src/services/memberships.service.ts; problems in apps/api/src/errors/http-errors.ts
- [ ] T026 [US2] `PATCH /decks/{id}/members/{userId}` in apps/api/src/routes/members.ts; `pnpm api:openapi`; example in api.http
- [ ] T027 [US2] apps/web/src/deck-admin/MembersSection.tsx + InviteForm.tsx

**Checkpoint**: Both stories work independently

---

## Phase 4: Close-out

- [ ] T050 `pnpm lint && pnpm format:check && pnpm typecheck && pnpm test:unit && pnpm test:int && pnpm build:web && pnpm budget`
- [ ] T051 [P] docs/design (web routes, member role change); docs/architecture.md map entry for `deck-admin/`
- [ ] T052 [P] README.md: making a deck public from the app
- [ ] T053 Run quickstart.md validation
- [ ] T054 `/speckit-converge` until it reports Converged

---

## Dependencies & Execution Order

- **Foundational (Phase 1)**: blocks both stories
- **US1** and **US2**: independent after Phase 1
- **Close-out**: after both

### Within Each User Story

- Tests written and FAILING before implementation
- shared → repo → service → route → `api:openapi` → web

---

## Notes

- [P] tasks = different files, no dependencies
- Log decisions the plan did not make, and deviations, in implementation-notes.md as you go
- Commit after each task or logical group (e.g. `feat(web): deck settings`)
