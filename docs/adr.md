# Architecture Decision Records

Full text of every ADR; the one-line index is in [architecture.md](architecture.md#decisions-adrs). New ADRs go at the end: **Decision** and **Rationale**, a few sentences each.

## ADR-001: Millisecond-precision timestamps for keyset cursors

**Decision**: All `timestamptz` columns use `precision: 3`.

**Rationale**: JavaScript `Date` is millisecond-based. Keyset pagination encodes `(createdAt, id)` in the cursor. If DB precision is microsecond but JS rounds to ms, the cursor may round-trip incorrectly, causing duplicates or gaps. Fixing precision at ms guarantees accurate serialization.

## ADR-002: Vitest test.projects instead of vitest.workspace

**Decision**: Root `vitest.config.ts` defines two test.projects (unit, integration) instead of separate workspace packages.

**Rationale**: 
- Simpler coverage thresholds (one config applies to all)
- Integration tests can safely use globalSetup (Testcontainers) without interfering with unit tests
- Single command `pnpm test` runs all; `pnpm test:unit` or `pnpm test:int` filters by project
- FileParallelism=false for integration tests (sequential DB access); unit tests run in parallel

## ADR-003: TypeScript source exports, no build step

**Decision**: Packages export `.ts` files directly from `src/`, evaluated at runtime via `tsx`.

**Rationale**:
- Faster iteration: change src, tests pick it up immediately
- Single source of truth: no divergence between src and build output
- Simpler tooling: no tsconfig build path mappings, no esbuild config
- Type checking: `tsc --noEmit` validates syntax; runtime safety from Zod at boundaries

**Trade-off**: Slightly slower runtime (tsx transpiles on-the-fly), acceptable for Phase 1 API server; Web frontend (Phase 3) will bundle.

## ADR-004: 404 for foreign decks, not 403

**Decision**: When a user accesses a deck they don't own, return 404 (not found), not 403 (forbidden).

**Rationale**:
- Doesn't leak information about which resources exist
- Consistent with "access control as query filter" pattern (repository only sees user's own data)
- Phase 2 can refine to shared/public decks; 404 still applies to truly private ones

**Implementation**: Phase 1 used `assertDeckAccess()`; since Phase 2 `authorize()` (`access/authorize.ts`) throws `notFound()` when the caller has no role on the deck (D35), and 403 only when a role lacks the permission.

## ADR-005: Soft deletes via `deleted_at` timestamp

**Decision**: Never physically remove rows; set `deleted_at = now()`.

**Rationale**:
- Audit trail: can query deleted items if needed
- Foreign key safety: references don't break if a category is deleted
- Reversible: undelete possible (though not exposed in Phase 1 API)
- Compliance: supports data retention policies

**Query pattern**: All reads include `WHERE deleted_at IS NULL`.

## ADR-006: Denormalized deck_id in item_categories

**Decision**: `item_categories` table includes `deck_id` even though it's redundant (reachable via itemId → items → deckId).

**Rationale**:
- Enables composite foreign key: `FK(itemId, deckId) → items(id, deckId)`
- Prevents a bug where an item_category references an item in a different deck
- Marginal storage cost, significant constraint benefit

## ADR-007: Default category auto-created and protected

**Decision**: Every deck gets an automatic 'general' category on insert. Cannot be deleted or modified to `is_default=false`.

**Rationale**:
- UX: users always have at least one category to tag items
- Safety: avoids "item with no categories and status=published" edge case
- Database enforces via trigger + unique index, not app logic

**Cascade exception**: When deck is deleted, the trigger cleanup is allowed (pg_trigger_depth > 1 check).

## ADR-008: Payload validation in @pb/shared, re-validated on PATCH

**Decision**: `payloadSchemaFor(type)` lives in @pb/shared. Service re-validates payload on PATCH.

**Rationale**:
- Schema is single source of truth for all consumers (API, tests, migrations)
- PATCH may not provide type (immutable), so service must know which schema applies
- Validation failure → 400, not 422 (matches Zod error convention)

## ADR-009: Limit >50 rejects, doesn't clamp

**Decision**: `limitSchema` rejects values >50 with a validation error, never silently reduces.

**Rationale**:
- Explicit: client knows the constraint
- Prevents accidental large result sets (DoS risk)
- Encourages clients to paginate properly

## ADR-010: RFC 9457 Problem+JSON for all errors

**Decision**: API always returns error responses as `application/problem+json` with type, status, title, detail, errors.

**Rationale**:
- Standardized: clients can parse error details uniformly
- OpenAPI: schema documented in /openapi.json
- Field errors: Zod validation failures list path + message for each field
- Type URL: clients can decide action (409 /conflict ≠ 422 /constraint-violation)

## ADR-011: Migration rollback via .down.sql

**Decision**: Each migration can be rolled back; down file executed in a transaction, then journal entry deleted.

**Rationale**:
- Not every migration is reversible (data loss possible), but metadata changes (add column) are
- Hand-written down files are explicit, not auto-generated (forces thinking)
- Single transaction: either fully rolls back or fails atomically
- Emergency recovery: can revert to prior schema without manual intervention

## ADR-012: Seed with uuid v5 namespace

**Decision**: Deterministic IDs via `v5(key, SEED_NAMESPACE)`.

**Rationale**:
- Reproducible: same seed produces same IDs every run
- Testable: suites assert on stable ids like `fixtureId('deck/family')` (since D49 these come from test factories, not the seed)
- No collisions: different keys hash to different IDs
- Never in production: seed only used in dev/test (guarded by env check)

## ADR-013: Pagination cursor encodes (createdAt, id)

**Decision**: Keyset cursor is base64url-encoded JSON: `{ c: isoString, i: uuid }`.

**Rationale**:
- Immutable sort: createdAt + id is unique, immutable per-row
- Doesn't count results: scales to large tables
- Works with DESC order: clients naturally iterate forwards in time
- Human-readable when decoded

**Alternative considered**: Offset pagination (simple, bad for large tables).

## ADR-014: Calc expression validation with mathjs walk, no evaluation

**Decision**: `validateCalcExpression()` parses expression tree, walks nodes to check allowed functions/symbols. Never evaluates.

**Rationale**:
- Safety: code evaluation is a security risk
- Deterministic: validation is stable (no random number gen affecting outcome)
- Error messages: can report specific disallowed functions
- Phase 2: server-side evaluation can safely use validated expressions

## ADR-015: Item type immutable, idempotent favorites

**Decision**: PATCH rejects if `'type' in patch` (400 bad-request). Favorite add/remove is idempotent.

**Rationale**:
- Type change would require payload migration (complex), so forbid it
- Idempotence: `POST /items/{id}/favorite` twice is safe (onConflictDoNothing), `DELETE` twice is safe (no error on missing)
- Phase 2: if client retries a request, idempotence prevents duplicates

## ADR-016: Dev auth middleware with constant-time comparison

**Status**: Superseded by ADR-025 and ADR-031 (Phase 2).

**Decision**: Dev token validated via `timingSafeEqual`, length checked first. Removed in Phase 2.

**Rationale**:
- Timing attack resistance: attacker can't infer token char-by-char from timing
- Phase 1 scaffold: simple bearer + header, no sessions, no magic links
- Secure default: even in dev, follow crypto best practices
- Bypass list: /health and /openapi.json for liveness/discovery

## ADR-017: Access control in service layer

**Decision**: access is checked in the service layer. Phase 1: `assertDeckAccess(user, deck, action)` (ownership). Phase 2: `authorize(user, deck, permission, memberships)` — `resolveRole()` + `can()` — called by every service method that touches a deck.

**Rationale**:
- Centralized: consistent policy across routes
- Fail-safe: throws 404 not found (doesn't expose existence)
- Extensible: Phase 2 added `can()` granularity via `authorize()` (see Authorization)

## ADR-018: Problem schema with optional field errors, pg error mapping

**Decision**: `Problem` includes optional `errors: ProblemFieldError[]`. `mapPgError()` detects constraint codes and returns mapped Problem.

**Rationale**:
- Field errors: Zod validation can report path + message per field
- Pg error mapping: 23505 (unique) → 409, 23514 (check) → 422, P0001 (custom) → varies
- No SQL leakage: error message sanitized, constraint name omitted from response

## ADR-019: Migration journal↔__drizzle_migrations sync

**Decision**: `migrations/meta/_journal.json` is the source of truth. `__drizzle_migrations` table is drizzle's internal state. `getLatestMigrationTag()` matches `when` (ms) between them.

**Rationale**:
- Drizzle creates __drizzle_migrations; we can't control its schema
- Journal is our integration point: stable, human-readable
- Matching on timestamp: every migration is timestamped, can find it in both places
- Rollback: deletes from __drizzle_migrations, doesn't touch journal (audit trail)

## ADR-020: Testcontainers PostgreSQL with template DB cloning

**Decision**: Global setup creates `template_pb` with all migrations. Each test clones it. Integration tests in isolation, fast.

**Rationale**:
- Parallelizable: tests can run independently (each has own DB)
- Fast: clone is faster than rerunning migrations per-test
- Reliable: clean slate per test (no test-to-test pollution)
- Scalable: CI can use `-j` to run tests in parallel

## ADR-021: Smoke tests with @smoke tag and health wait

**Decision**: E2E tests tagged `@smoke` each work in their own `smoke-<id>` deck (D50). Global setup waits for `/health` ok=true + migration tag match.

**Rationale**:
- Isolation: smoke tests use dedicated deck (don't interfere with other tests)
- Readiness: wait for health ensures DB migrations are done before tests start
- Reproducible: tag makes `pnpm test:e2e --grep @smoke` work

## ADR-022: Toolchain notes from the Phase 1 build

**Decisions**:
- **pnpm 11 build approval** uses the `allowBuilds:` map in `pnpm-workspace.yaml` (esbuild allowed; cpu-features, protobufjs, ssh2 denied). `onlyBuiltDependencies` is not honoured by pnpm 11.
- **Vitest `test.projects`** in the root `vitest.config.ts` replaces the deprecated `vitest.workspace` file.
- **Root devDeps for integration globalSetup**: `@testcontainers/postgresql`, `testcontainers`, `pg`, `drizzle-orm` are also declared at the root. Vitest resolves bare imports in a project's `globalSetup` from the workspace root, not the importing package.
- **`noUncheckedIndexedAccess` off**: it produced ~100 noise errors on array/row access across tests and repos. Row lookups rely on explicit guards (`if (!row) throw notFound()`).
- **HTTP error helpers return** an `HttpError` and callers `throw` them (`throw notFound()`), so control flow is visible to TypeScript.
- **pg pool `error` listener** in `createPool`: idle clients killed server-side (restart, `DROP DATABASE ... WITH (FORCE)`) would otherwise surface as an uncaught exception. `57P01` is ignored, everything else is logged.

## ADR-023: Open-source repository hygiene

**Decisions**:
- **Private notes stay local**: `plans/` (personal planning docs) and `docs/thrifty/` (AI build artifacts: prompts, per-sprint cost manifests) are gitignored. The public roadmap is the neutral `PLAN.md`. (Amended by ADR-049: from Phase 6, feature specs and plans are committed under `specs/`; `plans/` remains for private scratch.)
- **No personal data in fixtures**: seed data and tests use `example.test` emails and generic households only.
- **CI on GitHub-hosted runners**: `ci.yml` runs on `ubuntu-latest` so fork PRs never execute on a private machine. `smoke.yml` (main only, targets the deployed API) picks its runner from the `SMOKE_RUNNER` repo variable, defaulting to `ubuntu-latest`, and is skipped while `API_BASE_URL` is unset. Actions are pinned to their latest major tags (Node 24 runtime); pnpm comes from `packageManager`, Node from `.nvmrc`.
- **E2E env resolution** (`e2e/lib/env.ts`): GitHub passes unset vars/secrets as empty strings, so blank values are treated as unset; `BASE_URL` must be an http(s) URL, and a missing one fails fast under `CI`.
- **Standard community files**: `CONTRIBUTING.md`, `SECURITY.md` (GitHub private vulnerability reporting, no personal email), `CODE_OF_CONDUCT.md` (Contributor Covenant 2.1), issue templates. No PR template, so a new PR takes its title and body from the commit.
- **License: MPL-2.0** (file-level copyleft): changes to project files are shared back, while the code can still be combined with proprietary code. Root `LICENSE` holds the full text; every `package.json` declares `"license": "MPL-2.0"`.
- **`"private": true` stays** in every `package.json`: it only blocks accidental npm publishing of this app monorepo.

## ADR-024: Rename pocketbook → deck, rewrite migrations in place, owner-only seed (D48–D50)

**Decisions**:
- The domain noun is **deck** everywhere: tables (`decks`, `deck_id`, enum `deck_kind`), constraint names, schemas, routes (`/decks…`) and docs. The product is **Gobbit**; the repository name is unchanged.
- **Migrations were rewritten in place** (`0001_core`, `0002_invariants`, `0003_card_limits` and their `down/` files) with the same tags, rather than adding a rename migration. This was safe because no deployed database held user data at the time: Phase 1 only ever ran against disposable dev, CI and seeded smoke databases, all of which are recreated from scratch. Any existing local database must be dropped and re-migrated.
- **Seed reset**: the seed creates only the owner user (see Seeding). Fake users and sample cards moved to test fixtures, so the deployed database contains no fabricated people.
- **`DELETE /decks/:id`** (soft delete; the partial unique index frees the slug) was added so the smoke suite can create a `smoke-<runId>` deck per test and remove it afterwards, leaving the deployed database as found.

## ADR-025: Opaque server-side sessions over JWT (D22, D27)

**Decision**: Sessions are random 32-byte tokens; only their sha256 is stored. Cookie and bearer sessions are both rows in `sessions`.

**Rationale**: Logout and "log out everywhere" are one `UPDATE`; no signing-key rotation or token blacklist; a DB leak yields no usable tokens. The cost (one indexed lookup per request) is negligible at this scale.

## ADR-026: Atomic single-use magic links (D23)

**Decision**: Consumption is a single conditional `UPDATE … RETURNING`; the failure reason is computed only afterwards.

**Rationale**: Two concurrent clicks can't both succeed, and there is no read-then-write race window.

## ADR-027: An invite creates the user (D25, D37)

**Decision**: `POST /decks/:id/invites` calls `findOrCreateByEmail()`, so a pending membership always has a non-null `user_id`.

**Rationale**: One code path creates users (Phase 9 can gate registration there); memberships stay simple FKs; the invite link only has to accept.

## ADR-028: Implicit owner via the account (D33)

**Decision**: Users of a deck's `owner_account_id` are `owner` without a membership row; a trigger forbids giving them one.

**Rationale**: Personal decks need no membership bookkeeping, and there is exactly one source of truth per user–deck pair.

## ADR-029: DTO category filtering (D38)

**Decision**: The item DTO's `categoryIds` is filtered by the same visibility predicate as the queries.

**Rationale**: A card shared with a reader must not leak the ids of private categories it is also filed under.

## ADR-030: Postgres rate limiting (D39)

**Decision**: Fixed-window counters in `rate_limit_counters`, no Redis.

**Rationale**: One fewer service to run; the atomic upsert is correct under concurrency; volumes are tiny. pg-boss (Phase 4) can take over the cleanup.

## ADR-031: Dev auth deleted, not flagged off (D43)

**Decision**: The dev-token flag, token variable, user header and middleware are removed. The smoke suite authenticates with a real owner bearer session (`SMOKE_SESSION_TOKEN`): seeded locally, minted with `/auth/token-exchange` on the deployed instance.

**Rationale**: A dormant bypass is a latent vulnerability; the smoke suite now exercises the real session path end to end.

## ADR-032: Owner-only seed with test factories (D49)

**Decision**: The seed creates only the owner (plus the optional smoke session); integration and smoke tests build their own data with `@pb/db/test` factories or per-test `smoke-<id>` decks.

**Rationale**: The deployed database contains no fabricated people or cards, and tests don't depend on shared mutable state.

**Update (Oct 1)**: the seed is local-only and refuses production; the deployed database is never seeded.

## ADR-033: Deploy the CI-built image; `/health` reports the commit

**Decision**: CI builds the API image once (with `GIT_SHA`), pushes it to GHCR and calls the Dokploy deploy webhook; Dokploy runs that image (`infra/docker-compose.yml`, `pull_policy: always`) on Dokploy's `dokploy-network`, behind the shared `cloudflared` → Traefik route. `/health` returns `commit`, and the smoke workflow waits for the commit it was triggered by before testing.

**Rationale**: The image that passed CI is the one that runs (no second build on the box), the same pattern as the owner's other Dokploy apps, and smoke can't pass against the previous container.

## ADR-034: The web image owns static files and routing (D51, D54)

**Decision**: The PWA is built to static files in a `node:22-slim` stage and served by `caddy:2-alpine`. Its `Caddyfile` routes `/api/*` (stripped) and `/s/*` to `api:3000`, serves files with the cache headers and CSP from D54, and falls back to `index.html`.

**Rationale**: The API never serves UI, routing is versioned with the code, and Traefik needs one router. Caddy gives compression, headers and SPA fallback in a few lines.

## ADR-035: Generated API client from the OpenAPI document (D53)

**Decision**: `pnpm api:openapi` builds the app with stub dependencies, writes `packages/api-client/openapi.json` and generates `schema.d.ts` with `openapi-typescript`. The web app uses `openapi-fetch` and `openapi-react-query`. CI regenerates and fails on any diff.

**Rationale**: Types come from the contract the API actually serves, at a few KB of runtime, and a future native app can reuse the package.

## ADR-036: Offline through the query cache, not the service worker (D56)

**Decision**: The service worker precaches the shell and caches Cloudinary images only. API data persists through TanStack Query to IndexedDB (7 days, busted by commit) and is removed on sign-out.

**Rationale**: The query layer knows freshness and failures, so the offline banner is accurate. No cookie-scoped responses sit in a cache that outlives the session. This replaces the master plan's Workbox stale-while-revalidate for API `GET`s.

## ADR-037: Share previews: one URL, public or private, lazily rendered images (D58–D61)

**Decision**: `/s/:itemId` always returns 200. Public items (published, public deck, a public category) get real title, excerpt and image; anything else gets the same generic page. Card images are rendered on the first request (Satori + resvg), uploaded to Cloudinary under a content-hashed public id and recorded in `og_images`. The private image is static and committed.

**Rationale**: Existence never leaks (ADR-004). The content hash in the image URL busts WhatsApp and Telegram caches after an edit. One render per share needs no job queue before Phase 4.

## ADR-038: Minimal Dokploy configuration (D52)

**Decision**: Every non-secret deployed value is a default in `infra/docker-compose.yml`; `docker-compose.local.yml` overrides them for localhost. Dokploy holds only the Compose source, the secrets (`DATABASE_URL`, `RESEND_API_KEY`, `CLOUDINARY_URL`), the deploy webhook and backups. Traefik gets one router from labels on `web`.

**Rationale**: The repo decides what runs where. A redeploy can't drift from what's reviewed.

## ADR-039: Shared Postgres outside the Compose project (D67)

**Decision**: The deployed Compose project has no database. The API connects with `DATABASE_URL` (a Dokploy secret) to a shared pgvector Postgres used by several services, each with its own database and least-privilege owner role (`gobbit`). Today it is a Dokploy-managed database reached over the LAN on its external port. A later move to a cloud provider changes only the URL (`sslmode=verify-full` off the LAN). Extensions are created once by the instance's superuser; migration 0000's `CREATE EXTENSION IF NOT EXISTS` is then a no-op. `docker-compose.local.yml` adds a local `db` service for `pnpm compose:up`, and `docker-entrypoint.sh` refuses to start without `DATABASE_URL`. `api` stays off `dokploy-network`, where another project's `api` service could shadow Caddy's `api:3000` upstream.

**Rationale**: One instance for many small services saves memory and maintenance. Dokploy's database backups work on managed databases, not on Postgres inside a Compose project. A URL is also the portable boundary for moving to the cloud. The cost: Gobbit shares the instance's Postgres major version and its failures, so local and integration tests (pg17) should track the shared instance's major version.

## ADR-040: Personal deck ensured on every sign-in, addressed as `me` (Phase 3B)

**Decision**: Each account has exactly one personal deck, marked `decks.is_default` and protected by a partial unique index, a trigger and CHECKs. `usersService.ensurePersonalDeck()` runs inside the magic-link callback transaction on every sign-in and invite, before the session opens. Its public address is `me`: a reserved slug that the API resolves and the PWA shows as `/d/me`. The stored slug is `personal-<accountId>` and is never shown. There is no backfill migration.

**Rationale**: "Ensure" on every callback covers new users, invitees and accounts created before this phase without a data migration. It sits next to `findOrCreateByEmail()`, so the Phase 9 registration gate covers it too. Running it in the callback transaction means no user reaches the app without a deck, and a failure leaves no session behind. Finding the deck by `is_default` rather than `kind` stays correct when other personal decks exist. A fixed alias keeps URLs stable across renames and asks the user for no slug.

## ADR-041: Hybrid search in one repository call, fused in TypeScript (D68–D71)

**Decision**: Search uses Postgres only, with two arms on a generated `search_text` column:
- a trigram and substring arm;
- a pgvector cosine arm.

`searchRepo.hybrid()` runs both arms under the same deck, status and category-visibility filters. `lib/rrf.ts` fuses them with reciprocal rank fusion (k = 60).

**Rationale**: Family decks are small (hundreds of cards), so a separate search engine would add operations work without better results. The two arms cover each other's gaps:
- Trigrams catch phone numbers, typos and mixed scripts that embeddings miss.
- Vectors catch meaning and cross-lingual queries that trigrams miss.

Filtering inside each arm means a hidden category can never rank or leak. Fusing in TypeScript keeps the SQL simple and the ranking testable without a database.

## ADR-042: pg-boss worker as a separate process (D72, D73)

**Decision**: A worker process computes the embeddings. It runs from the same image with the `worker` entrypoint and uses pg-boss queues in the app database. Writes enqueue after commit, and a one-minute sweep re-queues anything stale. Both provider keys are optional:
- Without an embedding key (`OPENROUTER_API_KEY`/`OPENAI_API_KEY`), search is text-only.
- Without an Ask key (`OPENROUTER_API_KEY`/`ANTHROPIC_API_KEY`), Ask is off.

**Rationale**: Provider latency and outages must not affect card writes. pg-boss needs no new infrastructure (no Redis), and its singleton keys deduplicate bursts of edits. Because the sweep catches whatever enqueueing misses, a failed enqueue or a model change fixes itself. Optional keys keep local development, CI and forks working without provider accounts.

## ADR-043: Committed embedding cache for the search eval (D81)

**Decision**: The search eval reads vectors from `packages/db/test/fixtures/search-embeddings.json`, keyed by `sha256(model + text)`. Only `pnpm test:search:update` (with `OPENROUTER_API_KEY` or `OPENAI_API_KEY`) calls the API and rewrites the file. If the cache lacks any vector the eval needs, the hybrid assertion is skipped and only the text arm is gated.

**Rationale**: CI stays deterministic, free and keyless, while the eval still measures the real model. A change to a fixture, a query or the model shows up as missing cache entries, so results can't drift silently.

## ADR-044: OpenRouter as the preferred provider gateway

**Decision**: `ai/providers.ts` builds the embedder and the asker from env. `OPENROUTER_API_KEY` wins and serves both features through OpenRouter's OpenAI-compatible API (`https://openrouter.ai/api/v1`). `OPENAI_API_KEY` (embeddings) and `ANTHROPIC_API_KEY` (Ask) remain as direct fallbacks.
- Embeddings use the OpenAI SDK with a `baseURL`. The stored model stays the bare `EMBEDDING_MODEL` (`text-embedding-3-small`) and the wire model is `openai/<id>`. The vectors are identical, so switching provider re-embeds nothing and the eval cache keys stay valid.
- Ask over OpenRouter uses chat completions with a forced `answer` function call (`ai/openai-chat-asker.ts`). It shares the prompt, schema and citation checks with the Anthropic asker. `ASK_MODEL` is provider-specific; unset, it is `anthropic/claude-haiku-5.5` on OpenRouter or `claude-haiku-5-5` on Anthropic.
- Compose passes `ASK_MODEL` (api) and `EMBEDDING_MODEL` (api + worker) through, so models switch per environment without a code change. `llm_calls` prices by the id sent to the provider (`LLM_PRICES_PER_MTOK`); an unlisted model is logged at cost 0.

**Rationale**: One key and one bill cover both features, and the models can be changed without new provider accounts. The direct keys keep existing setups working.

## ADR-045: Share target in a hand-written service worker (D98)

**Decision**: `vite-plugin-pwa` switches from `generateSW` to `injectManifest` with `src/sw.ts`. The generated worker's rules are ported 1:1 (precache, navigation fallback and denylist, Cloudinary CacheFirst, `SKIP_WAITING`), and a `fetch` handler takes the manifest `share_target` POST to `/share`, stores it in IndexedDB and redirects to the confirm screen. The SW and the share chunk import `@pb/shared/ingest-constants` (zod-free).

**Rationale**: `generateSW` can't answer a POST. A server-side `action: /api/...` would skip the deck picker and the sign-in hand-off. One SW file keeps offline behaviour in one place.

## ADR-046: Ingest tokens separate from sessions (D99)

**Decision**: `ingest_tokens` hold sha256 hashes of `ing_` + 32 random bytes, shown once, at most 5 live per user, optionally bound to a deck. They are accepted only by `POST /ingest` (and as the email-in local part); every other route treats them as invalid credentials. Shares made with a token are always `channel = shortcut`. Every non-session token prefix is registered in `lib/token-prefixes.ts`; `session-auth` refuses such bearers off their routes without a database lookup.

**Rationale**: A token lives in a Shortcut or an email address book, so it leaks more easily than a session. Least privilege limits a leak to adding proposals that a publisher still has to approve. `deck_id` lets Phase 12's deck-scoped hosts mint deck-bound tokens.

## ADR-047: Entities as a column in the search text (D97)

**Decision**: `items.entities jsonb` holds cross-type facts (phones, addresses, hours, prices, dates, people, urls), validated by `entitiesSchema` and capped at 2 KB. `item_search_text()` takes them as a fifth argument; the generated column and its GIN index were rebuilt, and every item re-embedded through the sweep.

**Rationale**: `payload` is strict and per type; entities apply to any card and are what people search for ("plumber phone"). A separate column keeps payload validation unchanged.

## ADR-048: SSRF-guarded fetching at connect time (D102)

**Decision**: The worker fetches shared URLs through an undici `Agent` whose `connect.lookup` resolves the host and rejects private, loopback, link-local, CGNAT, multicast and metadata addresses (`ipaddr.js`, IPv4-mapped IPv6 included). Only http(s) on 80/443, ≤ 3 redirects (each re-checked), 10 s, 3 MB, HTML only.

**Rationale**: This is the first outbound fetch, from a process on the same network as Postgres and the API. Checking at connect time, not before the request, closes DNS rebinding; checking each redirect closes open-redirect hops.

## ADR-049: Spec-driven development with spec-kit, specs committed

**Decisions**:
- **spec-kit 1.2.2** (Claude integration, `sh` scripts) drives planning and implementation from Phase 6 on: `/speckit-specify` → `clarify` → `plan` → `tasks` → `analyze` → `implement` → `converge`. Pinned in `.specify/init-options.json`; run with `uvx --from specify-cli==<version> specify …`, upgrades are deliberate PRs.
- **Constitution** (`.specify/memory/constitution.md`): the existing ground rules and ADRs as seven principles, so every plan's Constitution Check gates on rules that are already true. Versioned (semver); amendments are PRs.
- **Project templates in `.specify/templates/overrides/`** (plan, tasks): the real monorepo layout, a decisions table continuing the `D` series, invariant → test traceability, rollout, risks and a close-out phase (docs, `PLAN.md`, converge). Core templates stay untouched so `specify` upgrades apply cleanly.
- **Specs are committed and public** under `specs/NNN-name/`, numbered sequentially from `006`; `specs/005-phases-0-5` records that Phases 0–5 predate spec-kit. A feature folder is a working contract until its PR merges, then a historical record; durable truth stays in this document, `README.md` and the constitution.
- **`PLAN.md` stays the roadmap**; a phase can span several features. Decisions continue the `D` series (Phase 6 reserves D129–D147); durable ones become the next ADR. Deviations are logged in the feature's `implementation-notes.md` and summarised here at close-out, as before.
- **No spec-kit git extension**: branches and worktrees stay as they are; the active feature is the local `.specify/feature.json`.

**Rationale**: The private phase plans worked, but reviewers could not see them and nothing checked the code against them. Committed specs travel with the PR, and `analyze` and `converge` check them against the code. Building the constitution only from existing rules keeps the gates meaningful rather than aspirational.

## ADR-050: Lifecycle rules in services, called with an actor (D130)

**Decision**: Archive, restore, delete and undelete live only in `items.service`. Each method takes `actor: { user, via }` as its first argument; HTTP routes build it with `getActor(c)` (`via: 'session'`, whether the session came from the cookie or a bearer). Routes only parse and map; transition rules, permissions and problem types are decided once, in the service.

**Rationale**: Phase 8 records history in `item_events` from these same methods, storing `actor.user` and `actor.via`. Phase 13's MCP server calls them with `via: 'mcp'` plus the connection id. Every client gets the same rules and the same audit trail, without duplicating checks per transport.

## ADR-051: Signed direct uploads from the browser (D133)

**Decision**: The editor uploads photos straight from the browser to Cloudinary with a short-lived signature from `POST /decks/{id}/media/sign`. The API signs only for members who may create cards in that deck, and the signature fixes the folder (`gobbit/items/<deckId>`), the tags (`editor`, `deck:<deckId>`) and the allowed formats. The card stores `{ publicId, alt }`. No unsigned preset and no proxying through the API.

**Rationale**: Photos from a phone are several MB; proxying them would tie up the API and its memory for no benefit, and an unsigned preset would let anyone with the cloud name upload. Signing keeps the secret on the server and scopes every upload to a deck, so Phase 7's `assets` table and orphan sweep can find uploads by tag without a schema change now. The size cap is checked in the browser, with Cloudinary's account limit as the backstop; a signed preset can add a server-side cap later without changing the client.

## ADR-052: Browse: native scroll-snap + use-gesture (D139, D140, D144)

**Decision**: Browse pages cards with native CSS scroll-snap and one IntersectionObserver. `@use-gesture/react` (`useDrag`) is used only for horizontal swipes on the header and footer bands, with `touch-action: pan-y` and a 24 px edge guard. Only the current card ±1 is mounted. The gesture library lives only in the lazy Browse route chunk, and `pnpm budget` enforces that.

**Rationale**:
- Native snapping keeps vertical paging on the compositor, with platform physics and no JS per frame, and it works with keyboard and assistive tech.
- A small drag library for the two bands covers what CSS can't do (tap filtering, axis locking) without a carousel framework.
- The edge guard leaves the OS back gestures alone.
- Mounting ±1 bounds the DOM and image decoding regardless of category size.
- The cost is about 8.5 KB gzip, and only for readers who open Browse.

## ADR-053: Two e2e tiers; smoke tests are journeys (D148, D149, D155)

**Decision**: Playwright tests carry one tier tag. `@smoke` holds a few critical journeys (a member's task through the UI, nothing inside Gobbit faked, only third-party hosts replaced at the network edge) and runs on every PR and after every deploy within 5 minutes. `@full` holds everything else that needs a browser or a running stack and runs nightly within 30 minutes. Every plan and PR records its tier (smoke / full / none, with a reason) by the rule in constitution V, and a bug that reached production gets its regression test at the tier that would have caught it. CI retries once; a test flaky twice in a week is fixed or tagged `@quarantine` within a week; no fixed sleeps.

**Rationale**: The feature-level smoke checks stubbed the API's own `media/sign` and passed while every production photo upload failed. Journeys can't stub inside the product, and a separate nightly tier keeps breadth without slowing the PR gate. Details and rejected alternatives: [`specs/010-e2e-journeys/research.md`](../specs/010-e2e-journeys/research.md).
