---

description: "Task list template for feature implementation"
---

# Tasks: [FEATURE NAME]

**Input**: Design documents from `/specs/[###-feature-name]/`

**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: REQUIRED. Constitution principle V: every task that adds logic has a matching test task at the
right tier (unit / int / search / e2e), and every row of the plan's traceability table maps to a test task.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] [Tier?] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- **[Tier]**: For test tasks: `[unit]` `*.test.ts` next to code, `[int]` `*.int.test.ts` in `apps/api/test/` or `packages/db/test/` (Docker),
  `[search]` `*.search.test.ts`, `[e2e:smoke]` Playwright `@smoke` journey in `e2e/tests/smoke/`,
  `[e2e:full]` Playwright `@full` spec in `e2e/tests/full/` (tier from the plan's "E2E tier" line, constitution V)
- Include exact file paths in descriptions

## Path Conventions

- API: `apps/api/src/{routes,services,repositories,jobs}/` + feature folders; integration tests in `apps/api/test/`
- Web: `apps/web/src/routes/` (file routes) + feature folders (`cards/`, `search/`, …), shared UI in `ui/`
- DTOs: `packages/shared/src/`; schema and migrations: `packages/db/src/schema/`, `packages/db/migrations/` (+ `down/`)
- E2E: `e2e/tests/smoke/` (journeys) and `e2e/tests/full/` (nightly)

<!--
  ============================================================================
  IMPORTANT: The tasks below are SAMPLE TASKS for illustration purposes only.

  The /speckit-tasks command MUST replace these with actual tasks based on:
  - User stories from spec.md (with their priorities P1, P2, P3...)
  - Feature requirements and the traceability table from plan.md
  - Entities from data-model.md
  - Endpoints from contracts/

  Tasks MUST be organized by user story so each story can be:
  - Implemented independently
  - Tested independently
  - Delivered as an MVP increment

  DO NOT keep these sample tasks in the generated tasks.md file.
  ============================================================================
-->

## Phase 1: Foundational (Blocking Prerequisites)

**Purpose**: Schema, shared schemas and plumbing that MUST be complete before ANY user story

- [ ] T001 Drizzle schema change in packages/db/src/schema/[table].ts
- [ ] T002 `pnpm db:generate` → packages/db/migrations/00NN_[name].sql + hand-written packages/db/migrations/down/00NN_[name].down.sql
- [ ] T003 [P] [int] Migration round-trip and new constraints/triggers in packages/db/test/[name].int.test.ts
- [ ] T004 [P] Zod DTOs in packages/shared/src/[area].ts (+ subpath export if the web imports values)
- [ ] T005 [P] [unit] Schema validation tests in packages/shared/src/[area].test.ts

**Checkpoint**: Foundation ready - user story implementation can now begin

---

## Phase 2: User Story 1 - [Title] (Priority: P1) 🎯 MVP

**Goal**: [Brief description of what this story delivers]

**Independent Test**: [How to verify this story works on its own]

### Tests for User Story 1

> Write these first and make sure they FAIL before implementation.

- [ ] T010 [P] [US1] [int] Access and visibility rules for [action] in apps/api/test/[area].int.test.ts
- [ ] T011 [P] [US1] [unit] Service rules for [behaviour] in apps/api/src/services/[service].test.ts
- [ ] T012 [P] [US1] [e2e:smoke] Happy and negative path for [journey] in e2e/tests/smoke/[name].spec.ts (or [e2e:full] in e2e/tests/full/[area].spec.ts)

### Implementation for User Story 1

- [ ] T013 [US1] Repository method in apps/api/src/repositories/[repo].ts
- [ ] T014 [US1] Service rule + `can()` check in apps/api/src/services/[service].ts
- [ ] T015 [US1] Route + OpenAPI definition in apps/api/src/routes/[route].ts
- [ ] T016 [US1] `pnpm api:openapi` (regenerate @gobbit/api-client)
- [ ] T017 [US1] Web screen/component in apps/web/src/routes/[route].tsx + apps/web/src/[feature]/

**Checkpoint**: User Story 1 is fully functional and testable on its own

---

[Add more user story phases as needed, following the same pattern]

---

## Phase N: Close-out

**Purpose**: Keep the repository's docs and gates true

- [ ] TXXX `pnpm lint && pnpm format:check && pnpm typecheck && pnpm test:unit && pnpm test:int` (+ `pnpm test:search` / `pnpm budget` if touched)
- [ ] TXXX e2e at the plan's tier: `@smoke` passes in CI's `e2e` job; `@full` specs pass with `pnpm test:e2e --grep @full` (until the nightly workflow exists)
- [ ] TXXX [P] docs/design/<area>.md (new or existing): feature detail and "Deviations from the plan" list (from implementation-notes.md)
- [ ] TXXX [P] docs/adr.md: new ADRs from plan decisions; docs/architecture.md: one index row per ADR and at most a line or two in the area summary (keep it < 250 lines)
- [ ] TXXX [P] README.md: env vars, commands, routes, setup steps
- [ ] TXXX [P] CLAUDE.md ground rules if a new convention was introduced
- [ ] TXXX PLAN.md: link this spec under its phase; tick demos only once run on the deployed instance
- [ ] TXXX Run quickstart.md validation
- [ ] TXXX `/speckit-converge` until it reports Converged

---

## Dependencies & Execution Order

- **Foundational (Phase 1)**: blocks all user stories
- **User Stories (Phase 2+)**: depend on Foundational; then in priority order (P1 → P2 → P3) or in parallel
- **Close-out**: after all desired stories

### Within Each User Story

- Tests written and FAILING before implementation
- Schema → repository → service → route → `api:openapi` → web
- Story complete before moving to the next priority

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Log decisions the plan did not make, and deviations from it, in implementation-notes.md as you go
- Commit after each task or logical group (conventional commits, e.g. `feat(api): …`)
- Avoid: vague tasks, same file conflicts, cross-story dependencies that break independence
