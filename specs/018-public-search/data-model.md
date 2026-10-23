# Data Model: Search on public pages

## Migration (`00NN_public_search`, next free number)

| Change | Up | Down |
|--------|----|------|
| `search_queries_mode_chk` | `DROP CONSTRAINT`; `ADD CONSTRAINT … CHECK (mode IN ('search', 'ask', 'public'))` | `DELETE FROM search_queries WHERE mode = 'public'`; restore `IN ('search', 'ask')` |

No new tables or columns. `search_queries.user_id` and `llm_calls.user_id` are already nullable.

## Rows written

| Table | Row | Notes |
|-------|-----|-------|
| `search_queries` | `deck_id`, `user_id = NULL`, `mode = 'public'`, `q_normalized`, `result_count`, `top_why`, `latency_ms` | No IP |
| `llm_calls` | `purpose = 'embed_query'`, `user_id = NULL`, `deck_id` | Only on an embedding cache miss within budget |
| `rate_limit_counters` | keys `query-embed:anon:ip:<ip>` and `query-embed:anon:global` | Hourly windows; only on embedding cache misses |

## DTOs (`packages/shared/src/search/`)

### `PublicSearchQuery`

`{ q: string (1–SEARCH_QUERY_MAX chars, trimmed), limit?: 1–20 (default 10) }`

### `PublicSearchResponse`

| Field | Type | Notes |
|-------|------|-------|
| `data` | `{ item: PublicItem, why: SearchWhy, score: number }[]` | Best first |
| `semantic` | boolean | Whether the vector arm ran |

### `searchModes`

`['search', 'ask', 'public']`

## Constants (`packages/shared/src/limits.ts`)

| Name | Value | Use |
|------|-------|-----|
| `PUBLIC_SEARCH_PER_HOUR` | 120 | Search requests per IP per hour (in-process) |
| `PUBLIC_QUERY_EMBED_PER_HOUR` | 30 | New query embeddings per IP per hour (DB) |
| `PUBLIC_QUERY_EMBED_GLOBAL_PER_HOUR` | 300 | New anonymous query embeddings per hour, all IPs (DB) |

## Fixtures

| File | Addition |
|------|----------|
| `packages/db/test/fixtures/search-cards.ts` | An "AMKA" card (Latin title, English body) in a public category |
| `packages/db/test/fixtures/search-eval.json` | `אמקה` → AMKA (vector kind); `amka` → AMKA (text kind) |
| `packages/db/test/fixtures/search-embeddings.json` | Refreshed by `pnpm test:search:update` |
