# Gobbit — Phase 5 (ingestion)

A collaborative knowledge-card API for families/communities. Decks (personal/shared/communal) organize cards (text/link/image/table/calc) with categories, sources, favorites. Phase 1 delivered the core data model + typed REST API; Phase 2 added magic-link sessions, memberships/roles and category visibility; Phase 3 added the Reader PWA (offline reading, favorites, share previews); Phase 3B adds a personal deck at `/d/me` (created on every sign-in) and a minimal card editor. Phase 4 adds hybrid search (pg_trgm + pgvector, RRF), an optional cited Ask answer and an embeddings worker. Phase 5 adds ingestion: shares (Android share target, iPhone Shortcut with ingest tokens, paste box, flagged email-in) become `ingest_jobs` that the worker fetches (SSRF-guarded), extracts with an LLM into a **proposed** card and dedups; publishers approve them in a review queue. From Phase 6 on, work is specified and planned with spec-kit under `specs/` (see Planning below).

## Repo Layout

```
apps/api/        — Hono REST API (TypeScript strict) + worker (`src/worker.ts`, pg-boss: embeddings, ingestion)
apps/web/        — Reader PWA (React, Vite, TanStack Router/Query) + Caddy image
packages/api-client/ — Generated OpenAPI types + typed client (@pb/api-client)
packages/shared/ — Zod schemas, limits, utils (@pb/shared)
packages/db/     — Drizzle ORM, migrations, seed (@pb/db)
e2e/             — Playwright smoke tests
infra/           — Docker Compose (base = deployed, docker-compose.local.yml = local ports/dev defaults)
apps/api/Dockerfile — API image (also used by Compose)
apps/web/Dockerfile + Caddyfile — web image (static PWA; routes /api and /s to the API)
docs/            — architecture.md (compact map), design/*.md (per-area detail), adr.md (full ADRs), shortcut/README.md (iPhone Shortcut + email-in)
specs/           — spec-kit features `NNN-name/` (spec, plan, tasks); README.md = conventions
.specify/        — spec-kit: constitution (`memory/constitution.md`), templates (+ `templates/overrides/`), scripts
```

## Ground Rules

- **pnpm only**, Node ≥22, ESM, TypeScript strict; no build step (export `.ts`, `tsc --noEmit` to check)
- **Architecture**: Routes (parse) → Services (rules) → Repositories (Drizzle SQL)
- **Schemas**: All DTOs in `@pb/shared` (Zod); row types from `@pb/db`
- **Database**: snake_case columns, camelCase in TS; `timestamp({ withTimezone: true, precision: 3, mode: 'date' })`
- **Card limits**: body ≤600 Unicode points; payload ≤8192 UTF-8 bytes (DB CHECK constraints)
- **Errors**: `application/problem+json` (RFC 9457) via central handler
- **Invariants**: Auto timestamps, default category creation & protection in migrations; hand-written down files in `packages/db/migrations/down/`
- **Auth**: magic links → server-side sessions (`gobbit_session` cookie or `Authorization: Bearer`); access via `authorize()` + `can()`, visibility via `visibleCategoriesWhere()`. Smoke/`api.http` use the seeded `SMOKE_SESSION_TOKEN`
- **Seed**: local development only (refuses production); creates only the owner account/user from `SEED_OWNER_EMAIL` (+ optional smoke session); no sample decks or cards — tests build data with factories/fixtures (D49)
- **Deploy**: CI builds `ghcr.io/gobbit-app/service/{api,web}` with `GIT_SHA`, then a `deploy` job calls the Dokploy webhook once; only `web` (Caddy) faces Traefik and proxies `/api` (stripped) and `/s` to the internal API; smoke waits for `/health` and `/version.json` to report the commit (ADR-033/034/038, `infra/README.md`)
- **Card lifecycle**: archive/restore/delete/undelete only through `items.service`, called with an `actor` (`getActor(c)`, ADR-050); undelete within 30 days, weekly `prune-deleted-items` hard-deletes after; web deck links via `deckHref(slug, path)` (D143)
- **Roles**: co-owners (owner memberships) can do everything except delete the deck; re-inviting a pending member replaces the invite (new role, older links expired)
- **Env**: `pnpm dev` and `pnpm db:*` load the repo-root `.env` if present (`tsx --env-file-if-exists`); real env vars win
- **Testing**: Unit `*.test.ts` next to code; Integration `*.int.test.ts` + Docker; Search eval `*.search.test.ts` (`pnpm test:search`, committed embedding cache); E2E `@smoke` → each test creates and deletes its own `smoke-<id>` deck (D50). Two e2e tiers (constitution V, ADR-053): `@smoke` = critical journeys (every PR + post-deploy, ≤5 min, nothing inside Gobbit faked) and `@full` = everything else (nightly, `e2e/tests/full/`); every plan and PR states "E2E tier: smoke | full | none — reason", and an escaped bug gets its regression test at the tier that would have caught it (plans: `specs/010-e2e-journeys`, `specs/011-e2e-nightly`)
- **Git hooks**: `.githooks/` via `prepare` — pre-commit = Prettier + ESLint on staged files (check only), pre-push = typecheck + unit
- **Search**: `searchRepo.hybrid()` filters both arms by deck, status and `visibleCategoriesWhere()`; fusion in `lib/rrf.ts`. `OPENROUTER_API_KEY` (preferred, both features) or `OPENAI_API_KEY`/`ANTHROPIC_API_KEY` are optional (text-only search / Ask off); providers resolved in `ai/providers.ts` (ADR-044); writes call `embedQueue.enqueueIfStale()` after commit, the worker sweep heals misses (ADR-041–043)
- **Ingestion**: `POST /ingest` → `ingest_jobs` → worker `jobs/ingest.ts` (fetch → normalize → extract → proposed item → dedup). The agent never publishes; proposals are visible only to publishers and their creator (D96); published items need ≥ 1 category (DB trigger, D95). `ing_` ingest tokens work only on `POST /ingest` (ADR-046); outbound fetches go through `fetch/safe-fetch.ts` only (ADR-048).
- **Media**: editor photo uploads go browser → Cloudinary with a per-deck signature from `POST /decks/{id}/media/sign` (`item.create`; folder `gobbit/items/<deckId>`, tags `editor`,`deck:<deckId>`; secret never leaves the API, ADR-051); `POST /decks/{id}/link-preview` fetches only via `safe-fetch` and answers `{ preview: null }` on any failure without the reason (D134). Tests never call Cloudinary or real sites Email-in (`/webhooks/resend/inbound`) is on only with `INGEST_EMAIL_DOMAIN` + `RESEND_WEBHOOK_SECRET` + `RESEND_API_KEY`
- **Media**: every stored image has an `assets` row; image cards may only reference an asset recorded for their deck (D160, dimensions come from the asset); browser uploads are recorded via `POST /decks/{id}/media/assets`; outbound image downloads go only through `createSafeImageFetch` (`media.uploadFromUrl`); `media-sweep` deletes unreferenced images after 7 days (ADR-054)
- **Links**: link preview images render from the stored snapshot (`link-snapshot` job, server-owned `preview.publicId`/`width`/`height`), the remote image only as a fallback; link checks (`link-check-sweep`, `POST /items/{id}/link-check`) fetch only through `safe-fetch` and keep their state in `link_checks`, never on `items` (ADR-055)
- **Web**: plain CSS, no UI kit; stored images render only through `cards/CloudImage` (measured `sizes`, box from payload dimensions, D161); API data offline via persisted query cache, never the service worker (search queries are not persisted); value imports from `@pb/shared` subpaths (`/search`, `/calc`, …), never the root (bundle budget); same origin everywhere (no CORS); gestures live only in `browse/` (`@use-gesture/react` stays out of initial chunks, `pnpm budget` checks)
- **Editor**: editor validation is zod-free; the server is authoritative; value imports via `@pb/shared/card-limits` and `/calc` (calc loaded on demand); drafts live in IndexedDB and are cleared on save and sign-out (D145)
- **Docs**: Keep `README.md` and `docs/` synced with code. `docs/architecture.md` stays a compact map (< 250 lines): a feature adds at most a line or two and one ADR index row there; its detail and "Deviations" list go in `docs/design/<area>.md`, full ADRs in `docs/adr.md`. Never paste route tables, step lists, bundle numbers or deviation lists into `architecture.md`

## Planning (spec-kit)

- **Flow**: `/speckit-specify` → `/speckit-clarify` → `/speckit-plan` → `/speckit-tasks` → `/speckit-analyze` → `/speckit-implement` → `/speckit-converge` (repeat implement/converge until Converged). Use these instead of the personal `plan-feature` skill in this repo. Small fixes with no new behaviour skip it
- **Constitution**: `.specify/memory/constitution.md` holds the principles every plan gates on; amend it (versioned) rather than working around it. Customise templates only in `.specify/templates/overrides/` (survives `specify` upgrades)
- **Numbering**: sequential from `006` (Phases 0–5 are recorded in `specs/005-phases-0-5`); a phase may span several features; `PLAN.md` stays the roadmap and links each feature
- **Decisions**: `research.md` continues the `D` series (next free number across `docs/` and `specs/*/research.md`; Phase 6 reserves D129–D147); durable ones become the next ADR in `docs/adr.md` plus a one-line row in the `docs/architecture.md` index
- **E2E tier**: decide it in `/speckit-plan` (Technical Context "E2E tier" line) and tag tasks `[e2e:smoke]` / `[e2e:full]`; small fixes state it in the PR template
- **Implementing**: log decisions the plan didn't make and deviations in `specs/NNN-*/implementation-notes.md` (committed with the feature); at close-out copy deviations into the "Deviations" list of the matching `docs/design/<area>.md`
- **Public repo**: specs are committed and public — no personal data, private notes, costs or secrets (ADR-023, ADR-049). Private scratch still goes in gitignored `plans/`
- **spec-kit version**: pinned 1.2.2 (`uvx --from specify-cli==1.2.2 specify …`); upgrade deliberately and review the diff

## Key Commands

```
pnpm test:{unit,int,e2e,search}    # Test suites (test:search:update refreshes the embedding cache)
pnpm typecheck / lint / format     # Code quality
pnpm db:{generate,migrate,rollback,seed}  # Database
pnpm dev                           # API :3000 + worker + web :5173 (Vite proxies /api, /s)
pnpm search:{load,query}           # Fixture deck into a running API / query it
pnpm api:openapi                   # Regenerate api-client after route changes (CI checks drift)
pnpm build:web / budget / og:static # Web build, 150 KB gzip budget, static OG/icons
pnpm compose:{up,down}             # Docker (Postgres + API + worker + web on 127.0.0.1:8080)
```

See `README.md` for setup, `docs/architecture.md` for the system map (links to `docs/design/` and `docs/adr.md`).
