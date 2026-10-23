# Research: Search on public pages

Decisions continue the project-wide D numbering. Phase 8 reserves D174–D191. This feature owns **D182–D183**; D182 is recorded in **ADR-056** with 016's and 017's public-surface decisions.

## What exists today

- **Hybrid search** (D73–D81): a trigram arm on `items.search_text` and a pgvector arm on item embeddings, each filtered by deck, status and `visibleCategoriesWhere(role)`, fused with reciprocal rank fusion. Without an embedding key the vector arm is skipped (`semantic: false`).
- **Query embeddings**: cached in an in-process LRU by model + normalised query; a per-user hourly budget (`QUERY_EMBEDDING_BUDGET_PER_HOUR`, DB-backed) is checked only on a cache miss.
- **Query log** (D80): `search_queries` rows (deck, user, mode, normalised query, result count, top reason, latency), written fire-and-forget.
- **Cross-script matching**: trigrams can't match אמקה to "AMKA"; only the vector arm (multilingual embeddings) can.

## D182 — Public search

- **Decision**:
  - `search.service` extracts its body into `runHybrid({ deck, role, q, limit, embedCtx })`. `retrieve` (members) and the new `retrievePublic(deck, q, limit, ip)` both call it; public uses `role = null`.
  - JSON: `GET /public/{slug}/search?q=&limit=` (limit 1–20, default 10) → `{ data: [{ item: PublicItem, why, score }], semantic }`.
  - Page: `GET /p/{slug}/search?q=` renders results with 017's templates. A search form (`<form method="get">`) sits on deck and category pages. Signed-in members → 302 `/d/{slug}/search?q=`.
  - Embedding budget: `QueryEmbedder.embed(q, { budgetKey, userId, deckId })`. Members: `budgetKey = user:<id>` (today's key). Strangers: allowed only if both `queryEmbedAnon(ip)` (30/hour) and `queryEmbedAnonGlobal()` (300/hour) are under budget. Otherwise `null` → text-only.
  - Request limit: a separate bucket on 016's in-process limiter, `PUBLIC_SEARCH_PER_HOUR = 120` per IP.
  - Result pages: `noindex`, `public, max-age=60`, not stored in 017's page cache (queries are unbounded).
  - No Ask for strangers: Ask's LLM cost and citation UI stay members-only.
- **Rationale**: one retrieval core keeps ranking identical and the visibility filter in one place. The embedding cache is shared, so popular public queries cost nothing after the first. DB-backed budgets for the paid call survive restarts and bound cost; the in-process request limiter keeps ordinary searches free of writes.
- **Alternatives considered**:
  - **Text-only public search**: no AI cost, but demo 4 (cross-script) can't pass.
  - **Pre-computed embeddings for popular queries**: needs a query list we don't have.
  - **Ask for strangers**: per-query LLM cost and abuse risk on an anonymous surface; revisit with Phase 11 limits.
  - **Client-side search over a downloaded index**: needs JavaScript and ships the whole deck.

## D183 — Public query logging

- **Decision**: public queries log with `mode = 'public'`, `user_id = NULL`, and no IP. A migration replaces `search_queries_mode_chk` with `IN ('search', 'ask', 'public')`; `searchModes` gains `'public'`. Anonymous embedding calls record `llm_calls` with `user_id = NULL` and the deck id.
- **Rationale**: the log is how the owner tunes search (D80). Public queries are a different audience and must be separable; storing no identity keeps the log private.
- **Alternatives considered**: no logging for strangers (loses the most useful tuning data for a community deck); a separate table (duplicates the reporting).
