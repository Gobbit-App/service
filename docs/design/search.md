# Search (Phase 4)

_Overview: [architecture.md](../architecture.md). Decisions: [adr.md](../adr.md)._

## Data (migration `0008_search`)

- Extensions `vector` (pgvector) and `pg_trgm`. Compose and Testcontainers use `pgvector/pgvector:pg17`.
- `items.search_text` is a generated, stored column built by `item_search_text(type, title, body, payload)`. It holds the title, body and type-specific payload text (URLs, table cells, calc labels, image alt; a link's stored `preview.publicId` is excluded since `0013`, 014), passed through `search_normalize()`. That function lowercases, folds Greek tonos, strips Hebrew points and combining marks, maps the maqaf to a space, and removes separators between digits (`054-771 2345` → `0547712345`). A GIN trigram index sits on it.
- `items.embedding vector(1536)` (HNSW, cosine, `m=16, ef_construction=64`), plus `embedding_model`, `embedded_hash` and `embedded_at`. An item is stale when `item_embedding_hash(search_text)` or the model differs from what is stored.
- `search_queries` gets one row per search or ask: deck, user, mode, normalized q, result count, top `why` and latency. A weekly job prunes rows older than 180 days.
- `llm_calls` gets one row per provider call: purpose (`embed_item`, `embed_query`, `ask`), provider, model, tokens, estimated `cost_usd`, latency and status. No prompt or answer text is stored.
- The `items_set_updated_at` trigger fires only `BEFORE UPDATE OF` user-facing columns, so writing the embedding columns leaves `updated_at` alone.

## Query path (`GET /decks/{id}/search?q=&limit=`)

```
route (Zod: q 1..200, limit ≤ 20) → searchService.search
  authorize(viewer) → normalize(q) (SQL search_normalize) → query vector (LRU cache, hourly budget; null without an embedding key)
  → searchRepo.hybrid: text arm  (word_similarity ≥ 0.4 on search_text, plus a substring arm; skipped below 3 chars)
                       vector arm (cosine distance ≤ 0.55, same model, hnsw.ef_search 100)
                       each ≤ 50 rows, published and not deleted, limited to the categories the role can see
  → fuseRrf (k = 60, substring hits get +1/60) → DTOs with why ∈ {text, semantic, both} → log search_queries
```

- The response is `{ data: [{ item, why, score }], semantic }`. `semantic` is false when the vector arm didn't run (no key, over budget, provider error).
- The web highlights matches client-side with `highlight()` from `@gobbit/shared/search`, which folds text the same way the SQL does.
- Without an embedding key (`OPENROUTER_API_KEY` or `OPENAI_API_KEY`, ADR-044), search runs text-only and nothing is enqueued.

## Public search (018, D182, D183)

- `search.retrievePublic(deck, q, limit, ip)` runs the same `runHybrid` as member search with
  `role = null` (public categories only), maps hits with `toPublicItems` and logs `mode = 'public'`
  with `user_id` null (migration `0014_public_search` widens `search_queries_mode_chk`).
- Query embeddings are budgeted by key (`services/query-budget.ts`): members `embed-query:user:<id>`,
  strangers `embed-query:anon:ip:<ip>` (30/hour) and then `embed-query:anon:global` (300/hour), all in
  the Postgres rate limiter. The global unit is spent only after the per-IP check passes. Over budget →
  text-only, `semantic: false`.
- The query-vector LRU is shared by members and strangers; a hit skips the budget. Anonymous
  `llm_calls` rows (`embed_query`) have no user.

## Ask (`POST /decks/{id}/ask`)

- Without an Ask key (`OPENROUTER_API_KEY` or `ANTHROPIC_API_KEY`) Ask answers 503. `/config` then reports `search.ask: false`, and the PWA hides the mode toggle.
- Next comes the per-user rate limit (30/hour, the Phase 2 Postgres limiter), checked before any retrieval.
- Retrieval reuses the search path. The top 8 hits go into a prompt (`ai/ask-prompt.ts`) that asks for a short answer in the question's script, citing card ids. `ai/ask-citations.ts` keeps only citations among the retrieved cards.
- The model is `ASK_MODEL` (default Claude Haiku 5.5: `anthropic/claude-haiku-5.5` on OpenRouter, `claude-haiku-5-5` on Anthropic) with a 20 s deadline. A timeout answers 504; a provider failure answers 503.
- No hits, an ungrounded answer or no valid citations → a localized "not found" answer with `grounded: false` and no citations.

## Embeddings worker (`apps/api/src/worker.ts`)

- The worker is a separate process from the same API image (`pnpm --filter @gobbit/api worker`; the `worker` service in Compose). It runs pg-boss 12 in the app database, schema `pgboss`.
- Queues:
  - `embed-item`: one item per job, a singleton per item id, 3 retries with backoff.
  - `embed-sweep`: every minute, queues up to 50 stale items.
  - `prune-search-queries`: weekly.
- After a create or update commits, the items service calls `embedQueue.enqueueIfStale()`. Enqueue failures are logged, never surfaced. The sweep catches anything missed: the worker was down, the model changed, or the item was written before Phase 4.
- `embed-item` loads the item's `search_text` and skips the item if the stored hash still matches. Otherwise it calls the embedder (`EMBEDDING_MODEL`, default `text-embedding-3-small`, 10 s timeout) and writes the vector, model and hash. Every call is logged in `llm_calls`.
- Logs (`jobs/embed-item-log.ts`): one line per job, `[worker] embed <itemId> → embedded|fresh|missing|superseded (Nms)`. A failure is logged before it propagates, so pg-boss retries show up in the log. Sweeps log `sweep queued N stale items` when N > 0.
- Health: the worker touches `/tmp/worker-heartbeat` every 30 s. The Compose healthcheck fails when the file is older than 90 s.
- `pnpm dev` runs the API server and the worker together (`dev:server`, `dev:worker`).

## Web (D79)

- `SearchBox` sits under the deck header on every deck route. It debounces by 250 ms and navigates to `/d/$slug/search?q=&mode=`, replacing the history entry when already on the search route.
- `routes/d.$slug.search.tsx` validates `q` and `mode` (`search/search-params.ts`). It shows one of:
  - `SearchResults`: tags for `why`, highlighted matches, and recent searches when `q` is empty.
  - The lazy `AskView` chunk, when Ask is enabled and selected.
- Search queries use `keepPreviousData` and are excluded from the persisted cache. Search needs the network, and the offline state says so.
- Recent searches (8 per deck) live in `localStorage`.
- Value imports come from `@gobbit/shared/search`, never the package root, which would pull `mathjs` into the initial chunk.

## Evaluation and demo data (D81, D82)

- `searchCards` in `@gobbit/db/test`: 40 cards in Hebrew, Greek and English, covering every card type.
- `search-eval.json`: 40 query → expected-key pairs. Kinds: substring, phone, typo, URL, no-result, cross-lingual and meaning.
- `pnpm test:search` (vitest project `search`, `*.search.test.ts`):
  - Loads the deck into a Testcontainers database.
  - Asserts recall@5 ≥ 0.9 for the text arm on the text-capable pairs.
  - Asserts the same for hybrid search on all pairs, when `search-embeddings.json` holds every vector it needs. Vectors are keyed by `sha256(model + text)`.
- `pnpm test:search:update` (needs `OPENROUTER_API_KEY` or `OPENAI_API_KEY`) fills missing cache entries. The file is committed, so CI makes no API calls.
- `pnpm search:load` creates a `search-demo` deck through the API and adds any missing fixture cards (idempotent by title).
- `pnpm search:query "<q>"` prints the hits.
- Both scripts take `--deck`, `--base-url` (or `BASE_URL`) and `--token` (or `SMOKE_SESSION_TOKEN`).

## Deviations from the Phase 4 plan

- **pgvector's built-in Drizzle `vector` type** instead of a custom type.
- **Broader normalization**: the plan asked for lowercase and digits. The SQL also folds the maqaf, Greek tonos and combining marks, so `highlight()` and the database agree.
- **`item_embedding_hash()` in SQL** decides staleness, so enqueue and sweep never compare text in TypeScript.
- **`itemColumns`**: item queries select an explicit column list, so `search_text` and `embedding` never reach DTOs or list queries.
- **`updated_at` trigger narrowed** to user-facing columns (see Data).
- **RRF fused in TypeScript** (`lib/rrf.ts`). SQL returns two ranked arms, which keeps the fusion unit-testable.
- **A heartbeat file for worker health** instead of an HTTP port.
- **`llm_calls.cost_usd` is an estimate** from a price table in code (`ai/llm-calls.ts`). The `claude-haiku-5-5` price is assumed.
- **The Ask rate limit runs before retrieval**, so a limited user costs no query embedding either.
- **Ask is button-triggered** in the PWA (a mutation), not fired while typing.
- **Tests use archived cards as the non-searchable case**, where the plan said draft. Only published cards are searchable.
- **`SEARCH_EVAL_UPDATE=1` / `pnpm test:search:update`** instead of an `--update` flag, which vitest already uses for snapshots.
- **The eval runs against the repository and RRF**, not over HTTP. It's the same ranking code without a server.
- **No embedding cache yet**: `search-embeddings.json` stays `{}` until someone with an embedding key runs `pnpm test:search:update`.
  - Until then the hybrid eval is skipped.
  - Only the text arm is asserted. Its recall is 1.0 on 26 pairs.
- **The search box isn't sticky**, which keeps the sticky chip-row offsets unchanged.
- **The e2e web search tests live in `web.spec.ts`**, because the `web-smoke` project matches only `web|share` specs. The API checks are in `search.spec.ts`.
- **`pnpm test` and `test:coverage` pin their projects** (unit, web, integration). The search project runs only through `test:search`.
- **Fixture cards go into the default category.**
- **`pnpm dev` for the API** runs `dev:server` and `dev:worker` through `pnpm run "/^dev:(server|worker)$/"`.
