# Implementation notes: 018-public-search

Plan: `specs/018-public-search/plan.md`, tasks: `tasks.md`. Branch `phase8-018-public-search`, stacked on 017 (`phase8-017-public-pages`).

Migration `0014_public_search` (widens `search_queries_mode_chk`; the down file deletes `public` rows first). No queue or env var. E2E tier: smoke (`e2e/tests/smoke/public.spec.ts`, the public page step).

## Decisions not specified by the plan

- **`services/query-budget.ts`**: `createQueryBudget(rateLimits, limits)` turns a `QueryBudgetKey` (`{ kind: 'user', userId }` or `{ kind: 'anon', ip }`) into rate-limit checks. The anonymous kind checks the per-IP key first and spends a global unit only if that passes, so one IP can't drain the global budget with refused calls. Limits are injectable through `SearchWiring.queryBudgetLimits` for tests.
- **`QueryEmbedContext`** carries `budgetKey` and `userId` separately: the budget key decides who pays, `userId` (null for strangers) goes to `llm_calls`.
- **`search.searchPublic(slug, query, ip)`** resolves the deck through `public-deck.service` (the 016 404) and calls `retrievePublic`; the page service resolves the deck itself and calls `retrievePublic` directly.
- **`searchLogModes`** (`search`, `ask`, `public`) is a new constant for the log column; `searchModes` stays the PWA's `?mode=` set (`search`, `ask`) so the web never offers a `public` mode.
- **Search form** on deck and category pages: a plain GET form (`role="search"`, `maxlength` = 200), no JavaScript.

## Deviations from the plan

- **Search bucket (T032)**: implemented as a second `AnonRateLimiter` instance mounted with `publicRateLimit` on `/public/:slug/search` and `/p/:slug/search` in `app.ts`, after the read bucket, instead of inside `middleware/public-rate-limit.ts` (a limiter's limit is fixed per instance). Searches therefore count in both buckets.
- **Over-long `q` on the page**: the 400 page, like a bad cursor (the plan only covered the JSON 400).
- **T003**: the migration round trip is covered by the existing `packages/db/test/migrations.int.test.ts`; the `'public'` row is asserted in `apps/api/test/public-search.int.test.ts` (log test) rather than in `search.int.test.ts`.
- **T012 (search eval) partly done**: the `amka` card is in `packages/db/test/fixtures/search-cards.ts`, with `amka` (substring, checked now by the text arm) and `אמקה` (cross-lingual) in `search-eval.json`. No embedding key was available to run `pnpm test:search:update`, so `search-embeddings.json` is unchanged; the committed cache already lacked vectors for the current model before this feature, so the hybrid recall check was already skipped in CI. To finish: run `pnpm test:search:update` with a key and commit the cache; if אמקה misses the top 5, add a Hebrew alias to the card body (plan risk table), not code.
- **T054–T056**: not run; the PLAN demo and quickstart need the deployed instance.
