---

description: "Task list for 018-public-search"
---

# Tasks: Search on public pages

**Input**: Design documents from `/specs/018-public-search/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/public-search.md; `016-public-read-api` merged; `017-public-pages` merged for US1's page (the JSON route needs only 016)

**Tests**: REQUIRED (constitution V). Every row of the plan's traceability table maps to a test task below.

**Organization**: Tasks are grouped by user story.

## Format: `[ID] [P?] [Story] [Tier?] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: US1 stranger searches, US2 JSON, US3 caps
- **[Tier]**: `[unit]` `*.test.ts(x)` next to code, `[int]` `apps/api/test/*.int.test.ts` (Docker), `[search]` `*.search.test.ts`, `[e2e:smoke]` `e2e/tests/smoke/`, `[e2e:full]` `e2e/tests/full/` (tier rule: constitution V, ADR-053)

---

## Phase 1: Foundational (Blocking Prerequisites)

**Purpose**: Mode, schemas, retrieval core.

- [x] T001 `search_queries_mode_chk` + `'public'` in packages/db/src/schema/search-queries.ts; `pnpm db:generate` → packages/db/migrations/00NN_public_search.sql; hand-write packages/db/migrations/down/00NN_public_search.sql
- [x] T002 [P] `searchModes` + `'public'`; `publicSearchQuerySchema`, `publicSearchResponseSchema` in packages/shared/src/search/; limits in packages/shared/src/limits.ts
- [x] T003 [P] [int] Migration round trip; `'public'` row accepted, in apps/api/test/search.int.test.ts
- [x] T004 Extract `runHybrid` from `retrieve` in apps/api/src/services/search.service.ts (no behaviour change; existing tests green)
- [x] T005 `QueryEmbedder.embed(q, { budgetKey, userId, deckId })` in apps/api/src/ai/query-embedder.ts + [unit] test (budget key passed; cache hit skips the budget); member wiring `user:<id>` in apps/api/src/services/search-wiring.ts

**Checkpoint**: Member search unchanged; migration applies and rolls back

---

## Phase 2: User Story 1 — A stranger searches a public deck (Priority: P1) 🎯 MVP

**Goal**: Search form and result page on public pages; public cards only.

**Independent Test**: search אמקה on the public page → AMKA card in the top five.

### Tests for User Story 1

- [x] T010 [P] [US1] [int] Leaks: unique words of shared-only, private-only, proposed, archived cards → no results; result order equals member search on a deck whose cards are all public; log row `mode = 'public'`, `user_id` null, in apps/api/test/public-search.int.test.ts
- [x] T011 [P] [US1] [int] Page: results and form; escaped `q`; empty `q` → form only; member → 302 `/d/{slug}/search?q=`; `X-Robots-Tag: noindex`; not in the page cache, in apps/api/test/public-search.int.test.ts
- [ ] T012 [P] [US1] [search] AMKA card in packages/db/test/fixtures/search-cards.ts; pairs in packages/db/test/fixtures/search-eval.json; `pnpm test:search:update`; commit packages/db/test/fixtures/search-embeddings.json
- [x] T013 [P] [US1] [e2e:smoke] On the smoke public deck, search the shared card's unique word on the public page → no results; search the public card's word → it is listed, in e2e/tests/smoke/public.spec.ts

### Implementation for User Story 1

- [x] T014 [US1] `retrievePublic` (role null, `PublicItem` mapping, `mode = 'public'` log) in apps/api/src/services/search.service.ts
- [x] T015 [US1] `searchPage` and the search form in apps/api/src/public/pages.ts; `public-pages.service.searchPage` in apps/api/src/services/public-pages.service.ts
- [x] T016 [US1] `GET /p/{slug}/search` with member redirect in apps/api/src/routes/public-pages.ts

**Checkpoint**: Demo 4 works locally

---

## Phase 3: User Story 2 — JSON search (Priority: P2)

**Goal**: `GET /public/{slug}/search` for scripts and apps.

**Independent Test**: anonymous JSON search returns `PublicItem` results with `why` and `semantic`.

### Tests for User Story 2

- [x] T020 [P] [US2] [int] 200 shape; 400 for missing/long `q` and bad `limit`; non-public deck → 404 body identical to 016; `/public/{slug}/ask` → 404, in apps/api/test/public-search.int.test.ts

### Implementation for User Story 2

- [x] T021 [US2] Route in apps/api/src/routes/public.ts; `pnpm api:openapi`; example in api.http

**Checkpoint**: JSON search works

---

## Phase 4: User Story 3 — Caps and limits (Priority: P1)

**Goal**: Bounded anonymous embedding cost; per-IP search request limit.

**Independent Test**: per-IP embedding cap → `semantic: false`; request cap → 429.

### Tests for User Story 3

- [x] T030 [P] [US3] [int] Lowered caps: per-IP cap → `semantic: false`; global cap from two IPs → `semantic: false`; repeated query stays semantic (cache); no embedding key → text-only 200; request cap → 429 with `Retry-After` while page reads still pass, in apps/api/test/public-search.int.test.ts

### Implementation for User Story 3

- [x] T031 [US3] `rateKeys.queryEmbedAnon(ip)`, `rateKeys.queryEmbedAnonGlobal()` in apps/api/src/lib/rate-window.ts; anonymous budget (both keys) in apps/api/src/services/search-wiring.ts
- [x] T032 [US3] Search bucket (`PUBLIC_SEARCH_PER_HOUR`) in apps/api/src/middleware/public-rate-limit.ts for both search routes

**Checkpoint**: All three stories work independently

---

## Phase 5: Close-out

- [x] T050 `pnpm lint && pnpm format:check && pnpm typecheck && pnpm test:unit && pnpm test:int && pnpm test:search`
- [x] T051 [P] docs/adr.md: append D182 to **ADR-056**; docs/design/search.md: public search, budgets, `mode = 'public'`; docs/design/public.md: search page
- [x] T052 [P] README.md: public search route and caps
- [x] T053 [P] CLAUDE.md ground rules: public search goes through `retrievePublic`; anonymous embeddings use the anonymous budgets
- [ ] T054 PLAN.md: tick demo 4 only after quickstart section 4 has run on the deployed instance
- [ ] T055 Run quickstart.md validation
- [ ] T056 `/speckit-converge` until it reports Converged

---

## Dependencies & Execution Order

- **Foundational (Phase 1)**: blocks all stories
- **US1**: after Phase 1 and 017
- **US2**: after Phase 1 (only 016 needed)
- **US3**: after US1 or US2 (needs a route to limit)
- **Close-out**: after all stories

### Within Each User Story

- Tests written and FAILING before implementation
- shared → repo → service → route → `api:openapi`

---

## Notes

- [P] tasks = different files, no dependencies
- Log decisions the plan did not make, and deviations, in implementation-notes.md as you go
- Commit after each task or logical group (e.g. `feat(api): public search`)
- If the AMKA eval pair fails by meaning, log a deviation and fix the content, not the ranking
