# Implementation Plan: Search on public pages

**Branch**: `018-public-search` | **Date**: 2026-10-23 | **Spec**: [spec.md](./spec.md) | **Roadmap**: `PLAN.md` § Phase 8 (demo 4)

**Input**: Feature specification from `/specs/018-public-search/spec.md`

Project override of the core template. Written for outside readers: the repository is public.

## Summary

**Retrieval.** `search.service` gains `retrievePublic(deck, q, limit, budgetKey)`. It runs the same hybrid query with `role = null` (so `visibleCategoriesWhere(null)` and the published filter apply), the same RRF fusion, and maps hits to `PublicItem` (D182).

**Routes.** `GET /public/{slug}/search?q=&limit=` (JSON, `PublicSearchResponse`) and the page `GET /p/{slug}/search?q=` with a GET form on 017's deck and category pages. Members are redirected to `/d/{slug}/search?q=`. No Ask (D182).

**Cost and abuse.** The query embedder's budget key becomes generic. Anonymous searches use a DB-backed per-IP budget (30 new embeddings/hour) and a global anonymous budget (300/hour); either one exhausted → text-only, `semantic: false`. Search requests have their own in-process per-IP bucket (120/hour) on 016's limiter (D182).

**Logging.** Public queries are logged with `mode = 'public'` and `user_id = NULL`; a migration widens the `search_queries.mode` CHECK (D183).

**Demo data.** The search eval fixture gets an AMKA card and an אמקה query.

## Starting point

- `016-public-read-api` and `017-public-pages` merged (public deck rule, `PublicItem`, anonymous limiter, page templates, `public-pages.service`).
- `search.service.retrieve(user, idOrSlug, q, limit, mode)`: resolves and authorizes the deck, normalises the query, embeds it (`queryEmbedder.embed(q, { userId, deckId })`), runs `searchRepo.hybrid({ deckId, role, qNormalized, vector, model })`, fuses with `fuseRrf`, logs to `search_queries` (fire and forget).
- `query-embedder.ts`: LRU cache by `model + query`; `withinBudget(userId)` checked only on a cache miss; failures return `null` (text-only).
- `search-wiring.ts`: `withinBudget` = `rateLimits.check(rateKeys.queryEmbedUser(userId), QUERY_EMBEDDING_BUDGET_PER_HOUR)`.
- `search_queries`: `user_id` nullable, `mode text` with CHECK `IN ('search', 'ask')`; `@pb/shared` `searchModes = ['search', 'ask']`.
- `llm_calls`: `user_id` nullable.
- Search eval: `packages/db/test/fixtures/search-cards.ts`, `search-eval.json`, committed `search-embeddings.json`; `pnpm test:search` / `test:search:update`.
- PWA: `/d/$slug/search` reads `q` from the URL.

## Technical Context

**Language/Version**: TypeScript (strict, ESM, no build step) on Node ≥ 22

**Primary Dependencies**: existing (Hono, Drizzle, `lru-cache`, OpenAI embeddings when `OPENAI_API_KEY` is set). No new dependencies.

**Storage**: PostgreSQL 17 (pg_trgm, pgvector). Migration: `search_queries_mode_chk` adds `'public'`.

**Testing**: Vitest unit; integration with Testcontainers; search eval (`*.search.test.ts`); Playwright `@smoke`

**E2E tier**: smoke — anonymous search is a privacy boundary like the public read: one smoke step on the 016/017 smoke deck searches the public page and asserts the shared card's unique word returns nothing. Ranking quality (demo 4) is covered by the search eval, not e2e.

**Target Platform**: Docker Compose on Dokploy; one API instance

**Project Type**: pnpm monorepo — API, PWA, shared packages

**Performance Goals**: < 500 ms with the vector arm, < 200 ms text-only

**Constraints**: only public cards; bounded anonymous AI cost; no visitor identity stored; no Ask

**Scale/Scope**: low anonymous search volume; global cap sized for that

## Constitution Check

| Principle | How this plan complies |
|-----------|------------------------|
| I. Layered API | `routes/public.ts` / `routes/public-pages.ts` → `search.service.retrievePublic` → `search.repo` |
| II. One source of truth | `publicSearchQuerySchema`, `publicSearchResponseSchema`, `searchModes` in `@pb/shared`; OpenAPI regenerated |
| III. Invariants in the DB | Mode CHECK extended in the migration; visibility stays in SQL |
| IV. Private by default | `role = null`; `PublicItem` DTO; no user id or IP in the query log; the IP appears only in hourly rate-limit keys, as for magic links |
| V. Tests at the right tier | Unit (budget keys, fallback), int (leaks, caps, logging), search eval (AMKA), smoke (privacy step) |
| VI. Lean web | Plain GET form; no PWA change |
| VII. Simple, optional | Works without an AI key (text only); no new env var; caps are constants |

No violations.

## Decisions this plan pins down

Full reasoning in [research.md](./research.md).

| ID | Decision | ADR? |
|----|----------|------|
| D182 | Public search: `GET /public/{slug}/search` + page `/p/{slug}/search`; `search.service.retrievePublic` with `role = null` and the same hybrid + RRF; `PublicItem` results; no Ask; members → `/d/{slug}/search?q=`; vector arm only within a DB-backed per-IP budget (`PUBLIC_QUERY_EMBED_PER_HOUR = 30`, keyed like `magicLinkIp`) and a global anonymous budget (`PUBLIC_QUERY_EMBED_GLOBAL_PER_HOUR = 300`), else text-only; requests limited in-process to `PUBLIC_SEARCH_PER_HOUR = 120` per IP; result pages `noindex`, never in the page cache | yes → **ADR-056** |
| D183 | Public queries logged with `mode = 'public'`, `user_id = NULL`, no IP; migration widens `search_queries_mode_chk`; `searchModes` gains `'public'`; `llm_calls` rows for anonymous embeddings carry `user_id = NULL` | no |

## Project Structure

### Documentation (this feature)

```text
specs/018-public-search/
├── spec.md
├── checklists/requirements.md
├── plan.md
├── research.md
├── data-model.md
├── contracts/public-search.md
├── quickstart.md
├── tasks.md
└── implementation-notes.md   # created during /speckit-implement
```

### Source Code (repository root)

```text
packages/db/src/schema/search-queries.ts       # CHECK + 'public'
packages/db/migrations/00NN_public_search.sql  # NEW (next free number at implementation; 0014 if first)
packages/db/migrations/down/00NN_public_search.sql
packages/db/test/fixtures/search-cards.ts      # + AMKA card
packages/db/test/fixtures/search-eval.json     # + אמקה → AMKA (and an English pair)
packages/db/test/fixtures/search-embeddings.json  # refreshed by pnpm test:search:update
packages/shared/src/search/                    # searchModes + 'public'; publicSearchQuerySchema, publicSearchResponseSchema
packages/shared/src/limits.ts                  # PUBLIC_SEARCH_PER_HOUR, PUBLIC_QUERY_EMBED_PER_HOUR, PUBLIC_QUERY_EMBED_GLOBAL_PER_HOUR

apps/api/src/
├── ai/query-embedder.ts            # ctx { budgetKey, userId | null, deckId }; withinBudget(budgetKey)
├── lib/rate-window.ts              # rateKeys.queryEmbedAnon(ip), rateKeys.queryEmbedAnonGlobal()
├── services/search-wiring.ts       # budget by key kind (user / anon IP + global)
├── services/search.service.ts      # + retrievePublic; shared core extracted from retrieve
├── services/public-pages.service.ts# + searchPage
├── public/pages.ts                 # + searchPage, search form on deck/category pages
├── routes/public.ts                # + GET /public/{slug}/search
├── routes/public-pages.ts          # + GET /p/{slug}/search (member redirect)
└── middleware/public-rate-limit.ts # search bucket
apps/api/test/public-search.int.test.ts   # NEW
e2e/tests/smoke/public.spec.ts            # + privacy search step
```

**Structure Decision**:

- `retrievePublic` lives in `search.service` next to `retrieve`, sharing one private `runHybrid` core, so ranking can't drift between members and strangers.
- The embedder's budget becomes a key, not a user id, so the same LRU cache serves both audiences: a query a member already embedded costs strangers nothing.
- Anonymous embedding budgets are DB-backed (unlike 016's read limiter) because they guard a paid call and must survive restarts; they follow the existing `magicLinkIp` key style.

## Invariant → test traceability

| Invariant / rule | Enforced in | Test (file, tier) |
|------------------|-------------|-------------------|
| FR-001 anonymous search, JSON and page | routes | `public-search.int.test.ts` (int: 200 JSON; page has results and form) |
| FR-002 public cards only, same ranking | `retrievePublic` → `hybrid({ role: null })` | `public-search.int.test.ts` (int: shared-only, proposed, archived cards never returned for their unique words; same order as member search on public-only data) |
| FR-003 caps and fallback | `search-wiring` budgets | `query-embedder.test.ts` (unit: budget key passed; cache hit skips budget); `public-search.int.test.ts` (int: per-IP cap → `semantic: false`; global cap → `semantic: false`; no key → text-only) |
| FR-004 request limit | `public-rate-limit` search bucket | `public-search.int.test.ts` (int: lowered limit → 429; page reads unaffected) |
| FR-005 logging | `logQuery` | `public-search.int.test.ts` (int: row with `mode = 'public'`, `user_id` null); migration round trip in `search.int.test.ts` |
| FR-006 no Ask | no route | `public-search.int.test.ts` (int: `/public/{slug}/ask` → 404) |
| FR-007 noindex | `searchPage` headers | `public-search.int.test.ts` (int: `X-Robots-Tag: noindex`); robots.txt from 017 |
| FR-008 member redirect | `public-pages` route | `public-search.int.test.ts` (int: member → 302 `/d/{slug}/search?q=`) |
| SC-001 AMKA | ranking | `search-eval.search.test.ts` (search eval: אמקה → AMKA in top 5 with the hybrid run) |
| Privacy on every PR | — | `e2e/tests/smoke/public.spec.ts` (e2e:smoke) |

## Rollout

- **Migrations**: one, widening a CHECK (no rewrite). Down restores `('search', 'ask')` after deleting `'public'` rows.
- **Env / config**: none.
- **API client**: `pnpm api:openapi`.
- **Search eval**: `pnpm test:search:update` with a real key to add the AMKA embeddings; commit the cache.
- **Deploy order / flags**: migration runs before the API starts (existing Compose order).

## Risks

| Risk | Likelihood / impact | Mitigation |
|------|---------------------|------------|
| Cross-script query fails by meaning (אמקה vs AMKA) | M / M | Search eval pair asserts it; if recall fails, log a deviation and fix with content (a Hebrew alias in the card body), not code |
| Many IPs drain the global budget | L / L | Global cap bounds cost; search degrades to text-only, never fails |
| IPs stored in rate-limit keys | L / M | Same as magic-link limits today (only on embedding cache misses); Phase 11's retention work covers `rate_limit_counters` cleanup |
| Ranking drift between member and public search | L / M | Shared core; int test compares orders |

## Settle before starting

- [ ] Are 30/hour per IP and 300/hour global the right anonymous embedding caps?
- [ ] Confirm the deployed public deck will contain the AMKA card for demo 4 (content task, not code).

## Complexity Tracking

None.
