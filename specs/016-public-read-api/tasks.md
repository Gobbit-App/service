---

description: "Task list for 016-public-read-api"
---

# Tasks: Public read API for public decks

**Input**: Design documents from `/specs/016-public-read-api/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/public-api.md; PLAN.md Gate B confirmed

**Tests**: REQUIRED (constitution V). Every row of the plan's traceability table maps to a test task below.

**Organization**: Tasks are grouped by user story.

## Format: `[ID] [P?] [Story] [Tier?] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: US1 strangers read, US2 admins choose, US3 anonymous limit
- **[Tier]**: `[unit]` `*.test.ts(x)` next to code, `[int]` `apps/api/test/*.int.test.ts` (Docker), `[e2e:smoke]` `e2e/tests/smoke/`, `[e2e:full]` `e2e/tests/full/` (tier rule: constitution V, ADR-053)

---

## Phase 1: Foundational (Blocking Prerequisites)

**Purpose**: Shared contracts and repository widening.

- [ ] T001 [P] `publicDeckSchema`, `publicCategorySchema`, `publicItemSchema`, `publicItemPageSchema`, `publicItemListQuerySchema` in packages/shared/src/schemas/public.ts; export from packages/shared/src/index.ts
- [ ] T002 [P] `categoryPatchSchema` (strict, at least one field) in packages/shared/src/schemas/category.ts; `PUBLIC_READ_PER_HOUR`, `PUBLIC_PAGE_LIMIT_MAX` in packages/shared/src/limits.ts
- [ ] T003 [P] [unit] Schema tests (empty patch rejected, unknown keys rejected, limit bounds) in packages/shared/src/schemas/public.test.ts and packages/shared/src/schemas/category.test.ts
- [ ] T004 Widen `role` to `MemberRole | null` in apps/api/src/repositories/categories.repo.ts and apps/api/src/repositories/items.repo.ts (type-only; behaviour unchanged for members)
- [ ] T005 `categories.repo.countPublished(deckId, role)` and `categories.repo.update(id, patch)` in apps/api/src/repositories/categories.repo.ts

**Checkpoint**: `pnpm typecheck` passes; member suites unchanged

---

## Phase 2: User Story 1 — Strangers read a public deck (Priority: P1) 🎯 MVP

**Goal**: Anonymous summary, list and card for public decks, with nothing non-public visible.

**Independent Test**: Public deck with one public and one shared category → anonymous list shows only the public card.

### Tests for User Story 1

- [ ] T010 [P] [US1] [unit] `toPublicItem` output keys are exactly the allow-list; non-public categories dropped, in apps/api/src/services/public-dtos.test.ts
- [ ] T011 [P] [US1] [int] Access matrix: private, personal, deleted, unknown deck → identical 404 bodies; proposed, archived, deleted, shared-only, private-only cards absent from list and get; mixed card lists only the public category; deleted public category hides its cards; unknown or non-public `category` → 404; pagination; `Cache-Control`; owner cookie → identical JSON, in apps/api/test/public-read.int.test.ts
- [ ] T012 [P] [US1] [int] Invalid cookie on `/public/…` → 200, cookie not cleared, in apps/api/test/sessions.int.test.ts
- [ ] T013 [P] [US1] [e2e:smoke] Create a deck, one public and one shared category with a card each, make it public; `anon` reads summary, list and the public card; shared card id → 404; delete the deck, in e2e/tests/smoke/public.spec.ts

### Implementation for User Story 1

- [ ] T014 [US1] `toPublicItem` in apps/api/src/services/public-dtos.ts
- [ ] T015 [US1] `public-deck.service` (`resolvePublicDeck`, `summary`, `list`, `get`) in apps/api/src/services/public-deck.service.ts; wire in apps/api/src/services/index.ts
- [ ] T016 [US1] Three routes (`security: []`, `Cache-Control`) in apps/api/src/routes/public.ts; register in apps/api/src/app.ts
- [ ] T017 [US1] `/public/` in `LENIENT_PREFIXES` in apps/api/src/middleware/session-auth.ts
- [ ] T018 [US1] `pnpm api:openapi`; public requests in api.http

**Checkpoint**: Demo 1 steps 4–7 work locally

---

## Phase 3: User Story 2 — Admins choose what is public (Priority: P1)

**Goal**: Category rename/visibility PATCH; owner-only public switch.

**Independent Test**: Maintainer renames a category and makes it public; maintainer can't flip `isPublic`; owner can.

### Tests for User Story 2

- [ ] T020 [P] [US2] [int] `PATCH …/categories/{categoryId}`: owner and maintainer 200; editor and reader 403; non-member 404; empty body 400; slug unchanged on rename; default category keeps `isDefault`, in apps/api/test/categories.int.test.ts
- [ ] T021 [P] [US2] [int] `isPublic` change: owner and co-owner 200; maintainer 403 `owner-required`; maintainer name change still 200; personal deck 409, in apps/api/test/decks.int.test.ts

### Implementation for User Story 2

- [ ] T022 [US2] `ownerRequired()` problem in apps/api/src/errors/http-errors.ts
- [ ] T023 [US2] `categories.service.update` in apps/api/src/services/categories.service.ts; PATCH route in apps/api/src/routes/categories.ts
- [ ] T024 [US2] Owner check for `isPublic` in apps/api/src/services/decks.service.ts
- [ ] T025 [US2] `pnpm api:openapi`; PATCH examples in api.http

**Checkpoint**: Demo 1 steps 1–3 and 8 work locally

---

## Phase 4: User Story 3 — Anonymous reads are limited (Priority: P2)

**Goal**: Per-IP hourly ceiling on anonymous routes, no database writes.

**Independent Test**: With the limit lowered in test deps, request N+1 → 429 with `Retry-After`; a member route from the same IP → 200.

### Tests for User Story 3

- [ ] T030 [P] [US3] [unit] Limiter: counts per IP, window roll-over, `retryAfter`, LRU eviction, in apps/api/src/lib/anon-rate-limiter.test.ts
- [ ] T031 [P] [US3] [int] Lowered limit → 429 problem with `Retry-After`; `/decks` from the same IP → 200; two `CLIENT_IP_HEADER` values counted separately, in apps/api/test/public-read.int.test.ts

### Implementation for User Story 3

- [ ] T032 [US3] `createAnonRateLimiter({ limit, max })` in apps/api/src/lib/anon-rate-limiter.ts
- [ ] T033 [US3] `publicRateLimit` middleware in apps/api/src/middleware/public-rate-limit.ts; mount on `/public/*` in apps/api/src/app.ts; limiter instance in deps (overridable in tests)

**Checkpoint**: All three stories work independently

---

## Phase 5: Close-out

- [ ] T050 `pnpm lint && pnpm format:check && pnpm typecheck && pnpm test:unit && pnpm test:int`
- [ ] T051 [P] docs/adr.md: **ADR-056** (D174, D175; 017/018 append theirs); docs/architecture.md: ADR index row and a "Public" row in the areas table; NEW docs/design/public.md: deck rule, DTO allow-list, limiter, Deviations
- [ ] T052 [P] README.md: the public routes, the limit, how to make a deck public
- [ ] T053 [P] CLAUDE.md ground rules: anonymous reads go through `public-deck.service` with `role = null` and the allow-list DTO
- [ ] T054 PLAN.md: tick demo 1 only after quickstart section 2 step 10 has run on the deployed instance
- [ ] T055 Run quickstart.md validation
- [ ] T056 `/speckit-converge` until it reports Converged

---

## Dependencies & Execution Order

- **Foundational (Phase 1)**: blocks all stories
- **US1**: after Phase 1
- **US2**: independent of US1 after Phase 1; the smoke test (T013) uses US2's routes when they exist, otherwise sets visibility on create
- **US3**: after US1 (needs the routes)
- **Downstream**: 017 and 018 need US1 and US3; 019 needs US2
- **Close-out**: after all stories

### Within Each User Story

- Tests written and FAILING before implementation
- shared → repo → service → route → `api:openapi`

---

## Notes

- [P] tasks = different files, no dependencies
- Log decisions the plan did not make, and deviations, in implementation-notes.md as you go
- Commit after each task or logical group (e.g. `feat(api): public read routes`)
- Never read `c.var.user` in public routes; never add a field to `PublicItem` without updating the allow-list test
