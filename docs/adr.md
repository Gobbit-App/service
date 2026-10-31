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

## ADR-008: Payload validation in @gobbit/shared, re-validated on PATCH

**Decision**: `payloadSchemaFor(type)` lives in @gobbit/shared. Service re-validates payload on PATCH.

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

**Decision**: `POST /decks/:id/invites` creates the user (`register(email, 'deck_invite')` since ADR-061; originally `findOrCreateByEmail()`), so a pending membership always has a non-null `user_id`.

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

**Decision**: The seed creates only the owner (plus the optional smoke session); integration and smoke tests build their own data with `@gobbit/db/test` factories or per-test `smoke-<id>` decks.

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

**Rationale**: "Ensure" on every callback covers new users, invitees and accounts created before this phase without a data migration. It sits next to the user creation point (`register()` since ADR-061), so the registration gate covers it too. Running it in the callback transaction means no user reaches the app without a deck, and a failure leaves no session behind. Finding the deck by `is_default` rather than `kind` stays correct when other personal decks exist. A fixed alias keeps URLs stable across renames and asks the user for no slug.

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

**Decision**: `vite-plugin-pwa` switches from `generateSW` to `injectManifest` with `src/sw.ts`. The generated worker's rules are ported 1:1 (precache, navigation fallback and denylist, Cloudinary CacheFirst, `SKIP_WAITING`), and a `fetch` handler takes the manifest `share_target` POST to `/share`, stores it in IndexedDB and redirects to the confirm screen. The SW and the share chunk import `@gobbit/shared/ingest-constants` (zod-free).

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

## ADR-054: Asset registry with a database-driven orphan sweep (D156, D158)

**Decision**: Every image Gobbit stores in Cloudinary gets an `assets` row (deck, public id, source, dimensions, uploader). An editor upload is recorded through `POST /decks/{id}/media/assets`: the browser sends Cloudinary's signed upload answer, and the API checks it against the secret and the deck's folder. Ingest and server-side downloads record their rows directly. A card may only reference an image recorded for its deck (D160). A daily `media-sweep` job deletes images that are older than 7 days and that no item references, in any status, from Cloudinary and then from `assets`. Deleting a deck deletes its three Cloudinary folders.

**Rationale**: Without a registry, an upload whose card is never saved stays in Cloudinary forever, and a card could point at any public id, including another deck's. Driving the sweep from the database keeps it to one indexed query plus batched deletes. It never lists Cloudinary, so it doesn't use up Admin API quota and doesn't depend on tags being right. Recording dimensions at upload time gives 013 its aspect-ratio placeholders without a lookup. The 7-day grace covers drafts in progress, and deleted-in-window cards keep their images until the purge.

## ADR-055: Link snapshots and monthly link checks (D163, D164)

**Decision**: A link card's preview image is copied into Cloudinary by a `link-snapshot` job, enqueued after commit whenever a live link card has a remote `preview.image` and no stored copy (or no preview at all). The job fills an empty preview through `safe-fetch`, copies the image with `media.uploadFromUrl` (an `assets` row with source `link_snapshot`), and writes the server-owned `preview.publicId`/`width`/`height` only if the card's `updated_at` is unchanged. A daily `link-check-sweep` probes up to 100 published link cards whose check is due, about once every 30 days, one request per host at a time, through `safe-fetch` in `accept: 'any'` mode. State lives in a separate `link_checks` table: two consecutive definite failures (404, 410, DNS, refused, blocked) make a link `dead`, temporary errors never count, and a different page title makes it `changed`. Flags reach every member as `Item.linkHealth`; editors can check again or dismiss.

**Rationale**: Remote preview images leak readers' IPs to third parties, break with hotlink protection or redesigns, and don't work offline; a copy behind our CDN fixes all three, and copying it in a job keeps outbound I/O out of the request, the same way embeddings work. Copying through `uploadFromUrl` rather than Cloudinary's remote fetch keeps every outbound request behind the IP guard (ADR-048). Monthly, host-serialized checks keep traffic polite; two strikes avoid flagging a page for one bad night; title comparison catches "the domain now sells something else" without the false positives of content hashing. A separate table keeps check churn out of `items`, so `updated_at`, search text and embeddings never move because of a check. Details: [`docs/design/links.md`](design/links.md).

## ADR-056: A separate anonymous read surface for public decks (D174, D175)

**Decision**: Strangers read public decks only through `/public/{slug}` routes served by `public-deck.service`. A deck is public when it is live, `is_public` and not personal; anything else, including an unknown slug, gets the same 404 as the member routes. The service reads through the existing repositories with `role = null`, so `visibleCategoriesWhere(null)` keeps only `public` categories, and it always asks for published, live cards. Answers go through an allow-list DTO (`toPublicItem`: no author, favourite, status, deck id, link health or review/ingest fields; only public categories). The routes never read the caller's session: a member gets the stranger's answer, which keeps it cacheable (`Cache-Control: public, max-age=60`). A stale cookie is ignored on `/public/*`. Anonymous reads are limited by an in-process LRU of per-IP fixed one-hour windows (`PUBLIC_READ_PER_HOUR` = 600; 429 with `Retry-After`) that never touches the database; 017's pages and 018's search share it.

**Pages (017, D177–D181)**: Strangers and crawlers get server-rendered HTML at `/p/{slug}`, `/p/{slug}/c/{category}` and `/p/{slug}/i/{itemId}`, rendered by the API with `hono/html` (escaped by default; card markdown through `micromark` with raw HTML off), no JavaScript and outside OpenAPI. Caddy routes `/p/*`, `/sitemap.xml` and `/robots.txt` to the API. Pages read through `public-deck.service`, so they follow the same deck rule and allow-list as `/public/*`, and every "not public" case answers one identical 404 page. A signed-in member (any role on the deck) gets a 302 to the app route with `private, no-store`, unless they add `?view=public`; every page sends `Vary: Cookie`. Communal public decks are indexable and listed in `/sitemap.xml`; shared public decks are reachable but `noindex`. Anonymous pages are cached in-process (`public/page-cache.ts`, LRU 500 entries, 5 minutes) under a per-deck generation key that `purgeDeck(deckId)` bumps after every write that can change public content; HTTP caching is `public, max-age=300`. `/s/{id}` for a public card answers 302 to its `/p/` page; private shares are unchanged. Every public URL comes from `publicUrl()`. Pages share the anonymous limiter with `/public/*` and answer an HTML 429.

**Search (018, D182, D183)**: `GET /public/{slug}/search?q=&limit=` (≤ 20) and the `/p/{slug}/search?q=` page run `search.retrievePublic`, the same hybrid retrieval as member search with `role = null`, mapped through `toPublicItem`. There is no public Ask. Query embeddings for strangers are paid from anonymous budgets in the existing DB rate limiter (30/hour per IP, then 300/hour across all strangers); over either, search answers text-only (`semantic: false`). The query-embedding cache is shared, so a cached query costs nothing. Searches also count in their own in-process per-IP bucket (120/hour) on top of the read bucket. Queries are logged with `mode = 'public'` and no user. The search page is always `noindex`, `public, max-age=60` and never in the page cache; members get a 302 to `/d/{slug}/search?q=`.

**Rationale**: Reusing the member routes with an optional user would put a "no user" branch in every service method, and one mistake would expose member data. The `role = null` branch reuses the one tested visibility filter instead of a second public query, and an allow-list is the safe default for the first anonymous surface. The DB-backed limiter writes a row per counted request, which suits sign-in and paid calls but would turn every anonymous page view into a write. One API instance runs today, so an in-process counter is exact; the limit is per instance and Phase 11 revisits it with burst limits at the edge. Details: [`docs/design/public.md`](design/public.md).

## ADR-057: Item events written in the same transaction as the card (D186, D187)

**Decision**: Every user-made card change appends a line to `item_events` (deck, item, actor, `via` = `session` | `ingest`, `kind`, title snapshot, changed field names). Repository writes take the event inputs and insert them inside the card's own transaction, so a line exists exactly when the change committed. Services build the inputs from the `Actor`; updates name changed fields with `diffFields` and log nothing when nothing changed; system writes (link checks, snapshots, embeddings, sweeps) log nothing. `changes` holds field names, never values. The deck FK cascades; the item and actor FKs set null, so lines outlive purged cards and deleted accounts ("Former member"). Owners and maintainers read the log through `GET /decks/{id}/events` (`event.list`, keyset cursor, optional `itemId`, D188).

**Rationale**: A same-transaction insert gives "one line iff committed" without an outbox. A Postgres trigger can't see the actor or the client without per-connection session variables, which are fragile with pooling; fire-and-forget logging or a job loses lines on a crash, which is fine for analytics but not for an audit log. Field names are enough to investigate without copying private content into a second store. Details: [`docs/design/activity-log.md`](design/activity-log.md).


## ADR-058: Publishers' shares may skip review, per deck (D192, D193)

**Decision**: A deck has an owner-only switch, `auto_publish_shares` (default off; on for personal decks). When it is on, the worker tries to publish a share (channels `pwa`, `shortcut`, `paste`, `email`) right after the proposal and dedup steps, through the same `publishProposal()` routine that review uses. It publishes only when all of these hold, checked in order: the sharer's role **at processing time** has `item.publish`; the extraction chose at least one existing category (the default-category fallback and a suggested new category don't count); and the dedup verdict exists and says `new`. Otherwise the card stays in review and `ingest_jobs.auto_publish` records why (`held_not_publisher`, `held_needs_category`, `held_duplicate`, `held_duplicate_check_failed`, `held_publish_failed`); review shows that reason. The `published` event has the sharer as actor with `via: 'ingest'`. MCP and import channels never auto-publish. Constitution IV (1.2.0) names this as the one exception to "agents propose, people publish" (D96).

**Rationale**: For a household admin sharing into their own deck, review was a second step that only got in the way: in production a share "went to review" that the admin, who was its only reviewer, could not find. The gates are the reasons a reviewer would stop: rights, category and duplicate. One publish routine means nothing downstream can tell an auto-published card from a reviewed one, and a failed auto-publish falls back to review rather than failing the share. The AI still never publishes for someone who couldn't publish the card themselves. Trade-off: the worker can't purge the API's in-process public page cache (D180), so on a public deck a directly published card appears on `/p/` pages within the 5-minute cache TTL. Details: [`docs/design/ingestion.md`](design/ingestion.md#auto-publish-022-d192d193).

## ADR-059: One inline icon set and shared action primitives (D210–D212)

**Decision**: Every action in the web app is drawn from one hand-drawn inline SVG set. It uses a 24 × 24 grid, a 1.75 stroke and `currentColor` (`ui/icons/icon-paths.ts`). There is no icon library, sprite, icon font or Unicode glyph. Actions render only through the `ui/buttons/` primitives:
- `IconButton` and `IconLink`: 44 × 44 hit area, accessible name = label, `data-tip` tooltip;
- `Button` and `ButtonLink`: icon + label, with the label visually hidden below 480 px and the name unchanged.

Unavailable actions use `aria-disabled` with a reason in the tooltip, never a silent `disabled`. Tooltips are CSS on `[data-tip]`: hover on pointer devices, focus, and a 500 ms still press via `ui/tooltip-press.ts`. There are no `title` attributes. A card's own actions sit inside it (`CardActionBar` + `MoreMenu`). Selection controls (tabs, chips, toggles) keep their text.

**Rationale**: Path strings are the smallest form (the whole set is about 2 KB gzip) and need no request or build step. One renderer and one set of primitives make the stroke, the hit area, the names and the narrow-screen rule properties of a component, not of a hundred call sites, and unit tests cover them once. A CSS tooltip with one delegated touch listener needs no library and never blocks swipes. Details: [`docs/design/icons-and-actions.md`](design/icons-and-actions.md).

## ADR-060: Accountable by default — every decision is recorded and watchable (constitution VIII)

**Decision**: Every decision the service makes about a person, their content or their experience leaves a record that can be traced, reviewed, monitored and alerted on. Constitution v1.3.0 adds this as principle VIII.

- **Records**:
  - A **decision event** is one pino line with `event` (stable, dot-separated `<area>.<decision>`, e.g. `waitlist.join`, `auth.magic_link`, `rate_limit.refused`), `outcome` (a closed set per event, e.g. `accepted | refused | dropped`), `reason` (a closed set, e.g. `per_ip | per_email | honeypot`), `requestId` or `jobId`, and `actorId` when there is one.
  - A change to durable data also writes an **audit row** in the same transaction (the `item_events` pattern, ADR-057).
  - Operator and admin actions always carry who and when.
- **Privacy**: people appear only as ids or keyed hashes. A raw email, IP address, query text or card content never enters a record. This keeps principle IV.
- **Silent answers are still recorded**: answers kept identical for the client (no enumeration), honeypot drops, rate-limit refusals, AI-off fallbacks and handled errors log their real outcome.
- **Watchable three ways**: each plan lists its events, fields, levels and how each is watched:
  - per instance (alert on one occurrence);
  - aggregate (count per window, by outcome and reason);
  - rate or average (ratio to baseline, duration).

  The plan names the alert thresholds with their defaults. Because events are named and their values come from closed sets, log-based metrics and alerts can be built without parsing free text.
- **Operator control**: limits and thresholds that shape the user's experience are env-tunable with defaults in `@gobbit/shared`, and documented in a runbook.
- **Tests**: each event in a plan is asserted in a test.
- **Existing code**: code that predates the principle is brought into line when it is next changed, and through a retrofit feature tracked in `PLAN.md`. Today, rate-limit refusals, for example, appear only as a generic request line with status 429.

**Rationale**: A service that refuses, drops or changes things for people without a trace can't be debugged, defended or tuned. Several paths already answer clients identically on purpose (D22, the honeypot), so the client-facing answer can't be where accountability lives. Named events with closed-set fields are the cheapest form that serves all three uses: reading one occurrence, counting over a window and watching a rate. They are also enough for any log-based monitoring backend. Choosing that backend (collection, dashboards, alert routing) is a separate operational decision. Until then, records are JSON lines on stdout, readable with `jq` (`docs/design/api-conventions.md`). Details: [`docs/design/api-conventions.md#decision-events`](design/api-conventions.md#decision-events).

## ADR-061: Registration gate and waitlist (D217–D219, D222–D224, D240, D241)

**Decision**: Registration is closed by default; people ask for an invite through a double opt-in waitlist that never reveals whether an address is known.

- **One service**: `waitlist.service.join()` holds every rule; the JSON API, the landing form (030) and the sign-in gate (029) call it. Entries live in `waitlist_entries` (one live entry per email, status `pending | confirmed | invited | removed`, CHECKs tie timestamps to status).
- **No enumeration**: every well-formed request answers `202 { ok: true }`; the cases differ only in the mail (confirm, existing-user sign-in link, or none). A confirm link is a `GET` with an atomic `UPDATE`, single use, valid 7 days, stored as sha256.
- **Spam controls**: a honeypot field (silent drop), a per-IP in-memory bucket and a per-email Postgres counter checked before any lookup; both limits are env vars. No CAPTCHA.
- **Accountability (constitution VIII)**: each outcome is a named decision event with keyed hashes (`LOG_HASH_KEY`), and each state change writes a `waitlist_events` row in the same transaction; those rows outlive the weekly prune of unconfirmed and removed entries.
- **Registration gate**: `REGISTRATION_MODE` is `waitlist` (default) or `open`. The gate acts when a sign-in link is requested: with it closed, an unknown address is put on the waitlist (source `sign_in`) and gets the waitlist mail instead of a link, with the same answer as a known one. A stale sign-in link for an address without a user fails as `closed` and leaves nothing behind.
- **One creation point**: `users.service.register(email, reason)` is the only path to `createWithAccount`; `deck_invite` and `waitlist_invite` create in any mode, `open_sign_in` only when open. Every new user records `registered_via` and `registered_by`, and every gate decision is a named event (`auth.magic_link`, `auth.callback`, `users.register`, `registration.mode`).

**Rationale**: a closed door with a waitlist lets the owner pace growth without new admin tooling; gating at request time means no link is ever minted for a sign-up that would be refused, and one creation point keeps any future path behind the same rule. Double opt-in keeps invites to addresses someone controls and stops signing up other people; identical answers extend D22 so the waitlist is no "is this a Gobbit user?" oracle; one service keeps the API, the form and the gate identical. Details: [`docs/design/waitlist.md`](design/waitlist.md), [`docs/design/auth.md`](design/auth.md#registration-gate-d222d224-d241).

## ADR-062: Landing analytics: self-hosted, same-origin, landing only (D231–D232)

**Decision**: Landing-page visits are counted by a self-hosted Umami, loaded from the app's own origin, on the landing page only and only when configured.

- **Service**: an `umami` service in the deck's Compose project (official image, pinned), with its own `umami` database on the shared Postgres; its dashboard is on its own hostname behind Umami's login, never on the app origin.
- **Same origin**: Caddy proxies exactly `/stats/script.js` and `/stats/api/send` to Umami (prefix stripped); any other `/stats/*` is 404. The CSP stays `'self'`.
- **Landing only, off by default**: the public `layout()` renders the tracker only when the page head carries `analytics`, which only the landing renderer sets, and only when `ANALYTICS_SITE_ID` is set. Public deck pages, error pages and the SPA shell never carry it; tests assert each.
- **Checked, never the record (D243)**: the API logs `analytics.config` at start-up; Umami's visitors are compared with `landing.render` and sign-ups with `waitlist_summary`.

**Rationale**: a cookieless, MIT-licensed tool on infrastructure we already run gives a dashboard (visitors, referrers, UTM, funnels) without building one, a cookie banner or a third party in the visitor's browser. Same origin keeps the CSP unchanged and the tracker off most blocklists; an explicit opt-in per page keeps "landing only" reviewable. Hosted Plausible, self-hosted Plausible (ClickHouse), GoatCounter, Cloudflare Web Analytics and an own counter table were rejected (D231). Details: [`docs/design/waitlist.md`](design/waitlist.md#landing-analytics-031-d231d233-d243-adr-062), [`infra/README.md`](../infra/README.md#landing-analytics).

## ADR-063: Landing page at the root for cookieless requests (D226–D227)

**Decision**: The API renders the landing page at `/welcome` (no JavaScript, 017's layout and escaping), and the root URL shows it to anyone without a session cookie.

- **Routing at the edge**: Caddy rewrites `/` to `/welcome` (query kept, `X-Gobbit-Via: root`) only when the request has no `gobbit_session` cookie; with the cookie, `/` stays the SPA. `/welcome` and `/welcome/joined` always go to the API. Answers send `Vary: Cookie`; canonical and `og:url` are the root.
- **Signed-out app home**: the SPA sends a 401 on `/` to `/welcome?from=app` with a full page load, and the service worker never serves `/welcome` from the shell. Deep links keep `/sign-in?next=…`. A valid session on `/welcome` gets an "Open Gobbit" variant without the form.
- **Form**: post/redirect/get through `waitlist.join` only (ADR-061), so the page keeps the no-enumeration rule and the limits.

**Rationale**: link previews and first visits never carry a cookie, so they get real HTML with preview tags at the root, while members (who always have the cookie) keep the app at `/` with no change to `start_url`, bookmarks or the 401 logic. An installed app serves `/` from the service worker, so the SPA has to route its own signed-out users. Rendering in the API reuses the public-page code and lets the form reach the service that enforces the waitlist rules. Moving the app off `/`, a static page in the web image, a landing route inside the SPA and forward auth in Caddy were rejected (D226). Details: [`docs/design/waitlist.md`](design/waitlist.md#landing-page-030-d226d230-d242-adr-063).

## ADR-064: Platform admins from an env list (D234)

**Decision**: Operator-only surfaces live under `/admin/*` and are open only to platform admins, the emails listed in `PLATFORM_ADMINS` (comma-separated, trimmed, lower-cased, empty by default).

- **Guard**: one middleware on `/admin/*` (`access/platform-admin.ts`) runs after session auth and before request validation. Signed-out callers get the usual 401; everyone else gets `404 /problems/not-found` for every admin URL, valid or not, so the surface is invisible (ADR-004). Admin services accept only the branded `PlatformAdmin` it returns.
- **Accountability (constitution VIII)**: each refusal records `admin.denied` (`not_admin` with the actor id, or `signed_out`; the route label, never the path or body); start-up records `admin.config` with the number of admins, never the emails, at `warn` when production has none. Admin actions record their own events with the admin as actor (032: `waitlist.admin`, `waitlist.admin_list` and `waitlist_events` rows).
- **Clients**: `GET /me` carries `isPlatformAdmin`, so the PWA shows admin links only to admins; admin data is never persisted offline.

**Rationale**: one or two operators need no grant UI or migration, and an env list can't be widened by a compromised session or a stray DB write. A 404 doesn't advertise the surface. Phase 12 reuses the same guard for `/admin/domains`. Alternatives considered: a `users.is_platform_admin` column (needs a bootstrap path and widens what a DB write grants), owning a "system" deck (overloads deck roles), 403 (reveals the surface). Details: [`docs/design/auth.md`](design/auth.md#platform-admins-d234), [`docs/design/waitlist.md`](design/waitlist.md#admin-032-d234d238-adr-064).
