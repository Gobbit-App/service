# Architecture — Gobbit (Community Pocketbook)

A one-page map of the system. Detail lives in [`design/`](design/) (one doc per area) and the full
decision records in [`adr.md`](adr.md). Commands, env vars and setup are in the root `README.md`.

> **Keeping this file compact.** Each area gets a short paragraph of the facts a contributor needs
> to find their way, plus a link. Route tables, field lists, step-by-step flows, bundle numbers and
> "Deviations from the plan" lists go in the area's design doc (or a new one), never here. A feature
> normally changes this file by one or two lines plus one ADR index row. Target: under 250 lines.

## Packages

| Package | Path | Role |
| --- | --- | --- |
| `@pb/shared` | `packages/shared` | Zod DTO schemas, enums, limits, authz matrix (`can()`), utils. Single source of truth for domain rules. Web code imports subpaths only (`/search`, `/calc`, `/card-limits`, …) |
| `@pb/db` | `packages/db` | Drizzle schema, migrations (+ hand-written `down/`), owner-only seed, test factories (`@pb/db/test`) |
| `@pb/api` | `apps/api` | Hono REST API (`@hono/zod-openapi`) and the pg-boss worker (`src/worker.ts`), same image |
| `@pb/api-client` | `packages/api-client` | `openapi.json` + generated types, `openapi-fetch` client; CI fails on drift (ADR-035) |
| `@pb/web` | `apps/web` | Reader PWA: React 19, Vite, TanStack Router/Query, `vite-plugin-pwa`; served by its own Caddy image |
| `e2e` | `e2e/` | Playwright, `@smoke` and `@full` tiers |

All ESM, strict TypeScript, no build step: packages export `.ts`, run with `tsx`, checked with
`tsc --noEmit` (ADR-003, ADR-022). TypeScript stays on 6.0 until typescript-eslint supports 6.1+.

## Runtime topology

```
phone ─▶ Cloudflare tunnel ─▶ Traefik ─▶ web (Caddy: static PWA)
                                           ├─ /api/* (stripped) ─▶ api :3000 ─┐
                                           └─ /s/*, /p/*, /sitemap.xml,       ├─▶ Postgres (shared instance,
                                              /robots.txt ─▶ api              │   pgvector + pg_trgm)
                                                       worker (pg-boss) ──────┘
api / worker ─▶ Cloudinary (images), OpenRouter / OpenAI / Anthropic (optional AI), Resend (mail)
```

One origin everywhere (no CORS in practice): Caddy owns routing, headers and CSP; only `web` faces
Traefik. CI runs `@smoke` against a Compose stack built from the commit (every PR), builds
`ghcr.io/gobbit-app/service/{api,web}` with `GIT_SHA`, a `deploy` job calls the Dokploy webhook,
and smoke waits for `/health` and `/version.json` to report the commit.
→ [design/deployment.md](design/deployment.md), [`infra/README.md`](../infra/README.md)
(ADR-033, 034, 038, 039).

## Data model

Core tables: `accounts` → `users`; `decks` (kind personal/shared/communal, owned by an account) →
`categories` (visibility private/shared/public, one protected default) and `items` (cards: type
text/link/image/table/calc, status proposed/published/archived, `payload` jsonb, `entities` jsonb,
generated `search_text`, `embedding vector(1536)`); `item_categories` (carries `deck_id` for a
composite FK); `favorites`; `memberships`; `sessions`; `magic_links`; `rate_limit_counters`;
`og_images`; `search_queries`; `llm_calls`; `ingest_jobs`; `ingest_tokens`; pg-boss in schema `pgboss`.

Conventions: snake_case columns / camelCase TS; `timestamptz(3)` everywhere (keyset cursors,
ADR-001); soft delete via `deleted_at` (ADR-005); `updated_at` and default-category creation and
protection are DB triggers; card limits (body ≤ 600 code points, payload ≤ 8192 bytes) are Zod rules
backed by DB CHECKs. Migrations are drizzle-kit generated plus hand-written SQL, each with a
hand-written `down/` file (ADR-011, ADR-019); latest is `0016_import_channel`.
→ [design/data-model.md](design/data-model.md) (ER diagram, invariants table, migration notes)

## API conventions

- **Layering**: route (Zod parse via OpenAPI route) → service (rules, `authorize()`) → repository
  (Drizzle, no logic) → mapper (row → DTO). Services take an `actor` for lifecycle actions (ADR-050).
- **Errors**: everything is `application/problem+json` (RFC 9457) from one handler; Zod, pg codes
  (23505 → 409, 23503/23514 → 422, P0001 → named problems) and `HttpError` are mapped there (ADR-010, 018).
- **Pagination**: keyset cursor over `(createdAt, id)`, base64url; limit default 20, > 50 rejected (ADR-009, 013).
- **Logging**: pino JSON lines to stdout with a `component` field; one request line per call, query
  strings never logged.

→ [design/api-conventions.md](design/api-conventions.md) (error table, route pattern, logging)

## Auth, access and visibility

Magic links (single-use, atomic consume) create server-side sessions: `gobbit_session` cookie or
`Authorization: Bearer` (bearer wins). Every sign-in ensures the account's personal deck, addressed
as `me`. Access is `authorize()` = `resolveRole()` + `can()`: no role → 404, role without the
permission → 403. Account owners are implicit `owner`; co-owner memberships can do everything but
delete the deck. Category visibility is one predicate, `visibleCategoriesWhere(role)`, applied to
every list, get, filter and DTO. Rate limits are Postgres fixed windows. `ing_` ingest tokens work
only on `POST /ingest`.
→ [design/auth.md](design/auth.md) (ADR-004, 017, 025–031, 040, 046)

## Feature areas

| Area | Summary | Detail |
| --- | --- | --- |
| Reader PWA | File routes, persisted TanStack Query cache for offline (never the SW for API data), share target in a hand-written SW, share previews at `/s/:id` with lazily rendered OG images, 150 KB gzip initial-JS budget | [web-pwa](design/web-pwa.md) · ADR-036, 037, 045 |
| Search & Ask | `searchRepo.hybrid()`: trigram + pgvector arms, both filtered by deck, status and visibility, fused with RRF (`lib/rrf.ts`). Optional cited Ask answer. Provider keys optional (text-only / Ask off) | [search](design/search.md) · ADR-041–044 |
| Worker | pg-boss: `embed-item` (+ minute sweep), `ingest`, `media-sweep` (daily orphan images), `link-snapshot`, `link-check-sweep` (daily), prune jobs. Writes enqueue after commit, sweeps heal misses. Heartbeat file for health | [search](design/search.md#embeddings-worker-appsapisrcworkerts), [ingestion](design/ingestion.md#worker-pipeline-jobsingestts) |
| Ingestion | Shares (Android, Shortcut, paste, email-in) and bulk imports (paste/file/CLI → `POST /decks/{id}/imports`, no LLM; bulk publish from review) → `ingest_jobs` → SSRF-guarded fetch → LLM extract → **proposed** card → dedup → publisher review queue. The agent never publishes, except a publisher's share on a deck that opted in (gated). Sharers follow their shares at `/d/$slug/shares` (state, failure reason, retry) | [ingestion](design/ingestion.md) · ADR-046–048, 058 |
| Card lifecycle | archive / restore / delete / undelete (30 days, weekly purge) in `items.service`, optimistic Undo in the web | [card-lifecycle](design/card-lifecycle.md) · ADR-050 |
| Card editor | All types, live preview through the list renderer, zod-free client checks, IndexedDB drafts, inline category create | [card-editor](design/card-editor.md) |
| Card media | Signed browser → Cloudinary uploads confirmed into the `assets` registry; cards reference only recorded assets; daily orphan sweep; every stored image renders through `CloudImage` (measured `sizes`, reserved box, blurred placeholder); link preview via `safe-fetch` | [card-media](design/card-media.md) · ADR-051, 054 |
| Links | Preview images copied to Cloudinary by a `link-snapshot` job; daily `link-check-sweep` flags dead or changed links (`Item.linkHealth`), editors check again or dismiss; locked social hosts use the shared caption and image | [links](design/links.md) · ADR-055 |
| Browse mode | One card per screen: native scroll-snap, `@use-gesture` only in the lazy chunk | [browse-mode](design/browse-mode.md) · ADR-052 |
| Public decks | Anonymous `/public/{slug}` reads through `public-deck.service` with `role = null` and an allow-list DTO; per-IP in-process limit; server-rendered `/p/` pages (members → app), sitemap for communal decks, page cache purged per deck; anonymous search with its own embedding budgets | [public](design/public.md) · ADR-056 |
| Deck admin | `/d/$slug/settings`: name, public switch, publish-shares-directly switch, category visibility, invites, member roles (`PATCH /decks/{id}/members/{userId}`, last-owner guard) | [web-pwa](design/web-pwa.md#deck-settings-phase-8-d184d185), [auth](design/auth.md#authorization-d33d35) |
| Activity log | Card writes append `item_events` lines (actor, client, kind, changed field names) in the same transaction; owners and maintainers read them per deck or per card | [activity-log](design/activity-log.md) · ADR-057 |

## Testing

| Tier | Files | Runs on |
| --- | --- | --- |
| Unit | `*.test.ts` next to code | Node, mocked deps |
| Integration | `*.int.test.ts` | Testcontainers Postgres, template DB cloned per file (ADR-020); data from `@pb/db/test` factories |
| Search eval | `*.search.test.ts` | recall@5 ≥ 0.9 against a committed embedding cache (ADR-043) |
| E2E | `e2e/tests/{smoke,full}` | `@smoke` journeys on every PR and deploy, `@full` nightly (ADR-053); each test owns a `smoke-<id>` deck |

The seed creates only the owner (local only); tests build their own data (ADR-032).
→ [design/testing.md](design/testing.md)

## Decisions (ADRs)

Full text in [adr.md](adr.md). Decisions in specs continue the `D` series; durable ones become the next ADR.

| ADR | Decision |
| --- | --- |
| [001](adr.md#adr-001-millisecond-precision-timestamps-for-keyset-cursors) | Millisecond timestamps for keyset cursors |
| [002](adr.md#adr-002-vitest-testprojects-instead-of-vitestworkspace) | Vitest `test.projects` |
| [003](adr.md#adr-003-typescript-source-exports-no-build-step) | TypeScript source exports, no build step |
| [004](adr.md#adr-004-404-for-foreign-decks-not-403) | 404 for decks you can't see, not 403 |
| [005](adr.md#adr-005-soft-deletes-via-deleted_at-timestamp) | Soft deletes via `deleted_at` |
| [006](adr.md#adr-006-denormalized-deck_id-in-item_categories) | `deck_id` in `item_categories` for a composite FK |
| [007](adr.md#adr-007-default-category-auto-created-and-protected) | Default category auto-created and protected |
| [008](adr.md#adr-008-payload-validation-in-pbshared-re-validated-on-patch) | Payload schemas in `@pb/shared`, re-validated on PATCH |
| [009](adr.md#adr-009-limit-50-rejects-doesnt-clamp) | Limit > 50 rejects |
| [010](adr.md#adr-010-rfc-9457-problemjson-for-all-errors) | RFC 9457 problem+json for all errors |
| [011](adr.md#adr-011-migration-rollback-via-downsql) | Rollback via hand-written `.down.sql` |
| [012](adr.md#adr-012-seed-with-uuid-v5-namespace) | Deterministic uuid v5 ids |
| [013](adr.md#adr-013-pagination-cursor-encodes-createdat-id) | Cursor encodes `(createdAt, id)` |
| [014](adr.md#adr-014-calc-expression-validation-with-mathjs-walk-no-evaluation) | Calc validated by mathjs AST walk, never evaluated server-side |
| [015](adr.md#adr-015-item-type-immutable-idempotent-favorites) | Item type immutable; idempotent favorites |
| [016](adr.md#adr-016-dev-auth-middleware-with-constant-time-comparison) | Dev auth (superseded by 025, 031) |
| [017](adr.md#adr-017-access-control-in-service-layer) | Access control in services |
| [018](adr.md#adr-018-problem-schema-with-optional-field-errors-pg-error-mapping) | Field errors + pg error mapping |
| [019](adr.md#adr-019-migration-journal__drizzle_migrations-sync) | Journal ↔ `__drizzle_migrations` sync |
| [020](adr.md#adr-020-testcontainers-postgresql-with-template-db-cloning) | Testcontainers with template DB cloning |
| [021](adr.md#adr-021-smoke-tests-with-smoke-tag-and-health-wait) | Smoke tests wait for `/health` |
| [022](adr.md#adr-022-toolchain-notes-from-the-phase-1-build) | Toolchain notes (pnpm 11 builds, `noUncheckedIndexedAccess` off, …) |
| [023](adr.md#adr-023-open-source-repository-hygiene) | Open-source hygiene, MPL-2.0 |
| [024](adr.md#adr-024-rename-pocketbook--deck-rewrite-migrations-in-place-owner-only-seed-d48d50) | Rename pocketbook → deck |
| [025](adr.md#adr-025-opaque-server-side-sessions-over-jwt-d22-d27) | Opaque server-side sessions, not JWT |
| [026](adr.md#adr-026-atomic-single-use-magic-links-d23) | Atomic single-use magic links |
| [027](adr.md#adr-027-an-invite-creates-the-user-d25-d37) | An invite creates the user |
| [028](adr.md#adr-028-implicit-owner-via-the-account-d33) | Implicit owner via the account |
| [029](adr.md#adr-029-dto-category-filtering-d38) | DTO `categoryIds` filtered by visibility |
| [030](adr.md#adr-030-postgres-rate-limiting-d39) | Postgres rate limiting, no Redis |
| [031](adr.md#adr-031-dev-auth-deleted-not-flagged-off-d43) | Dev auth deleted, not flagged off |
| [032](adr.md#adr-032-owner-only-seed-with-test-factories-d49) | Owner-only seed, test factories |
| [033](adr.md#adr-033-deploy-the-ci-built-image-health-reports-the-commit) | Deploy the CI-built image; `/health` reports the commit |
| [034](adr.md#adr-034-the-web-image-owns-static-files-and-routing-d51-d54) | Web (Caddy) image owns static files and routing |
| [035](adr.md#adr-035-generated-api-client-from-the-openapi-document-d53) | Generated API client from OpenAPI |
| [036](adr.md#adr-036-offline-through-the-query-cache-not-the-service-worker-d56) | Offline through the query cache, not the SW |
| [037](adr.md#adr-037-share-previews-one-url-public-or-private-lazily-rendered-images-d58d61) | Share previews: one URL, lazily rendered OG images |
| [038](adr.md#adr-038-minimal-dokploy-configuration-d52) | Minimal Dokploy configuration |
| [039](adr.md#adr-039-shared-postgres-outside-the-compose-project-d67) | Shared Postgres outside the Compose project |
| [040](adr.md#adr-040-personal-deck-ensured-on-every-sign-in-addressed-as-me-phase-3b) | Personal deck ensured on sign-in, addressed as `me` |
| [041](adr.md#adr-041-hybrid-search-in-one-repository-call-fused-in-typescript-d68d71) | Hybrid search, RRF fused in TypeScript |
| [042](adr.md#adr-042-pg-boss-worker-as-a-separate-process-d72-d73) | pg-boss worker as a separate process |
| [043](adr.md#adr-043-committed-embedding-cache-for-the-search-eval-d81) | Committed embedding cache for the search eval |
| [044](adr.md#adr-044-openrouter-as-the-preferred-provider-gateway) | OpenRouter as the preferred AI gateway |
| [045](adr.md#adr-045-share-target-in-a-hand-written-service-worker-d98) | Share target in a hand-written SW |
| [046](adr.md#adr-046-ingest-tokens-separate-from-sessions-d99) | Ingest tokens separate from sessions |
| [047](adr.md#adr-047-entities-as-a-column-in-the-search-text-d97) | Entities column in the search text |
| [048](adr.md#adr-048-ssrf-guarded-fetching-at-connect-time-d102) | SSRF guard at connect time |
| [049](adr.md#adr-049-spec-driven-development-with-spec-kit-specs-committed) | spec-kit, specs committed |
| [050](adr.md#adr-050-lifecycle-rules-in-services-called-with-an-actor-d130) | Lifecycle rules in services, called with an actor |
| [051](adr.md#adr-051-signed-direct-uploads-from-the-browser-d133) | Signed direct browser uploads |
| [052](adr.md#adr-052-browse-native-scroll-snap--use-gesture-d139-d140-d144) | Browse: native scroll-snap + use-gesture |
| [053](adr.md#adr-053-two-e2e-tiers-smoke-tests-are-journeys-d148-d149-d155) | Two e2e tiers; smoke tests are journeys |
| [054](adr.md#adr-054-asset-registry-with-a-database-driven-orphan-sweep-d156-d158) | Asset registry, database-driven orphan sweep |
| [055](adr.md#adr-055-link-snapshots-and-monthly-link-checks-d163-d164) | Link preview snapshots; monthly link checks in `link_checks` |
| [056](adr.md#adr-056-a-separate-anonymous-read-surface-for-public-decks-d174-d175) | Separate anonymous read surface for public decks, in-process limiter |
| [057](adr.md#adr-057-item-events-written-in-the-same-transaction-as-the-card-d186-d187) | Item events written in the card transaction |
| [058](adr.md#adr-058-publishers-shares-may-skip-review-per-deck-d192-d193) | Publishers' shares may skip review, per deck, behind owner opt-in and reviewer gates |
