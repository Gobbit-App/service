# Gobbit (Community Pocketbook)

A collaborative, categorizable knowledge repository supporting multiple item types (text, links, images, tables, calculations) with role-based access, soft deletion, and keyset pagination. Built with TypeScript, Hono, Drizzle ORM, and PostgreSQL.

## Prerequisites

- **Node.js** ≥ 22
- **pnpm** 11 (managed via Corepack; run `corepack enable` once)
- **Docker** (for Compose and integration tests)

## Quick Start

1. **Install dependencies:**
   ```bash
   pnpm install
   ```

2. **Set up environment:**
   ```bash
   cp .env.example .env
   ```
   Set `SEED_OWNER_EMAIL` to your address. Local defaults use the console mailer (sign-in links are printed to the API log) and `COOKIE_SECURE=false`. `pnpm dev` and the `pnpm db:*` scripts load this root `.env` automatically when it exists; variables already set in your shell win.

3. **Start the database:**
   ```bash
   docker compose -f infra/docker-compose.yml -f infra/docker-compose.local.yml up -d db
   ```

4. **Migrate and seed:**
   ```bash
   pnpm db:migrate
   pnpm db:seed
   ```
   The seed creates only the owner account and user from `SEED_OWNER_EMAIL` (no sample decks). If `SMOKE_SESSION_TOKEN` is set it also upserts a 365-day owner bearer session with that token (for the smoke suite and `api.http`).

5. **Start the development server:**
   ```bash
   pnpm dev
   ```
   Runs the API on `http://localhost:3000` and the Reader PWA (Vite) on `http://localhost:5173`. Vite proxies `/api` (prefix stripped) and `/s` to the API, the same paths the web image's Caddyfile routes, so open the app at **http://localhost:5173** and everything — magic links, the session cookie, API calls — lives on that one origin (D64). The API side also starts the worker (`dev:server` + `dev:worker`), which only embeds when `OPENROUTER_API_KEY` or `OPENAI_API_KEY` is set. Its retention jobs always run: `search_queries` and `ingest_jobs` pruning, and `prune-deleted-items` (Sundays 05:00 UTC, hard-deletes cards soft-deleted more than 30 days ago). With `CLOUDINARY_URL` set it also runs `media-sweep` (daily 06:00 UTC): stored images older than 7 days that no card references (never saved, or their card was purged) are deleted from Cloudinary and from the `assets` table, and it works `link-snapshot` (copies a link card's preview image into Cloudinary after each save). `link-check-sweep` (daily 06:30 UTC, always on) checks up to 100 published link cards whose monthly check is due and flags links that look dead (two failed checks in a row) or changed (different page title). `pnpm dev:api` / `pnpm dev:web` run one side only.

6. **Verify health:**
   ```bash
   curl http://localhost:3000/health
   ```

7. **Sign in:** see [Authentication](#authentication) below.

## Environment Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `DATABASE_URL` | `postgres://pb:pb@localhost:5432/pb` | PostgreSQL connection string |
| `PORT` | `3000` | API server port |
| `NODE_ENV` | `development` | Environment (development, test, production) |
| `API_URL` | `http://localhost:${PORT}` | Public API address used in magic links (**required in production**). Local `.env`: `http://localhost:5173/api` (through the Vite proxy) |
| `APP_URL` | — | Web app origin; sign-in/invite callbacks redirect here (falls back to `${API_URL}/me`) and share links/private OG image use it. Local `.env`: `http://localhost:5173` |
| `CLOUDINARY_URL` | — | The "API environment variable" URL from the Cloudinary console; **required in production**. Uploads generated share images and signs the card editor's direct photo uploads (`POST /decks/{id}/media/sign`; without it image cards are off in the editor); only the cloud name reaches clients (`GET /config`). No upload preset is needed: the API signs folder, tags and formats itself (an optional signed preset with a size cap is not used yet) |
| `LOG_LEVEL` | `info` | API + worker log level (`trace`, `debug`, `info`, `warn`, `error`, `fatal`, `silent`). Logs are JSON lines on stdout: `level`, ISO `time`, `component`, `msg`, extra fields and `err` (with stack) |
| `OPENROUTER_API_KEY` | — | Optional (API + worker), preferred. One key for embeddings and Ask through OpenRouter; wins over the two direct keys below (ADR-044) |
| `OPENAI_API_KEY` | — | Optional (API + worker). Direct OpenAI fallback: enables the semantic arm of search and the embeddings worker; without it search is text-only |
| `ANTHROPIC_API_KEY` | — | Optional (API). Direct Anthropic fallback: enables Ask (`POST /decks/{id}/ask`); without it Ask answers 503 and the PWA hides it |
| `EMBEDDING_MODEL` / `ASK_MODEL` | `text-embedding-3-small` / provider Haiku | Models. `EMBEDDING_MODEL` is the bare OpenAI id (sent to OpenRouter as `openai/<id>`; changing it re-embeds every item through the sweep). `ASK_MODEL` is provider-specific: default `anthropic/claude-haiku-5.5` (OpenRouter) or `claude-haiku-5-5` (Anthropic); any OpenRouter model with forced tool calls works, e.g. `qwen/qwen3.7-flash` (~4× cheaper, for local testing). Add a row to `LLM_PRICES_PER_MTOK` (`ai/llm-calls.ts`) when switching, or `llm_calls` logs cost 0. Both are passed through by Compose |
| `WORKER_CONCURRENCY` | `2` | Concurrent `embed-item` jobs per worker process |
| `EXTRACT_MODEL` / `EXTRACT_ESCALATION_MODEL` | provider Haiku / provider Sonnet | Ingestion models (API + worker). Ingestion is on when an extraction provider is set (`OPENROUTER_API_KEY` or `ANTHROPIC_API_KEY`); otherwise `POST /ingest` answers 503 and the PWA hides sharing. Low-confidence proposals are re-run once on the escalation model |
| `INGEST_DAILY_CAP` | `50` | Shares per user and channel per rolling 24 h (429 beyond; all channels together stop at 200) |
| `SHORTCUT_URL` | — | iCloud link of the published "Share to Gobbit" Shortcut; shown in Settings (`docs/shortcut/README.md`) |
| `INGEST_EMAIL_DOMAIN` / `RESEND_WEBHOOK_SECRET` | — | Email-in (D104, off by default). On only when both and `RESEND_API_KEY` are set: mail to `<token>@INGEST_EMAIL_DOMAIN` becomes a share via the Resend inbound webhook |
| `COOKIE_DOMAIN` | — (host-only) | Session cookie domain |
| `COOKIE_SECURE` | `true` | `Secure` cookie flag; set `false` on plain-HTTP local dev |
| `CORS_ORIGINS` | — | Comma-separated origins allowed for credentialed CORS and CSRF |
| `MAIL_PROVIDER` | `console` | `console` (links logged) or `resend` |
| `RESEND_API_KEY` / `MAIL_FROM` | — | Required when `MAIL_PROVIDER=resend` |
| `ALLOW_CONSOLE_MAIL` | `false` | Must be `true` to use the console mailer in production |
| `MAGIC_LINK_TTL_MINUTES` | `15` | Sign-in link lifetime |
| `INVITE_TTL_DAYS` | `7` | Invite link lifetime |
| `SESSION_TTL_DAYS` | `90` | Sliding session lifetime |
| `CLIENT_IP_HEADER` | — (socket address) | Header with the real client IP behind a proxy (e.g. `cf-connecting-ip`) |
| `SEED_OWNER_EMAIL` / `SEED_OWNER_NAME` | — | Owner created by `pnpm db:seed` (email required; local development only) |
| `GIT_SHA` | — | Commit the image was built from (set by the Docker build in CI); reported by `/health` as `commit` |
| `SMOKE_SESSION_TOKEN` | — | Local: optional ≥32-char owner bearer the seed creates (`openssl rand -base64 32`). Smoke suite: the bearer it authenticates with |
| `EXPECTED_SHA` | — | Smoke suite only: wait until `/health` reports this commit (CI sets it) |
| `BASE_URL` | `http://localhost:3000` | API base URL for e2e tests |
| `WEB_BASE_URL` | `BASE_URL` without `/api`, else `http://localhost:5173` | Web origin for the `web-smoke` e2e project |
| `DB_PORT` | `5432` | Mapped database port in Compose |
| `API_PORT` | `3000` | Mapped API port in Compose |
| `WEB_PORT` | `8080` | Mapped web port in Compose (local overlay) |
| `API_IMAGE_TAG` / `WEB_IMAGE_TAG` | `latest` | Deployed image tags (base Compose file) |

## Commands

| Command | Purpose |
|---------|---------|
| `pnpm dev` | API (tsx watch, :3000), embeddings worker and web (Vite, :5173) together |
| `pnpm dev:api` / `pnpm dev:web` | One of the two |
| `pnpm build:web` | Build the Reader PWA to `apps/web/dist` |
| `pnpm budget` | Check initial JS ≤ 150 KB gzip (after `build:web`) |
| `pnpm api:openapi` | Regenerate `packages/api-client` (OpenAPI document + types) after changing API routes |
| `pnpm og:static` | Re-render the private share image, PWA icons and favicon into `apps/web/public` (commit the result) |
| `pnpm lint` | Run ESLint |
| `pnpm format` | Format with Prettier |
| `pnpm format:check` | Check formatting |
| `pnpm typecheck` | TypeScript strict check (no emit) |
| `pnpm test` | Unit, web and integration tests (Vitest) |
| `pnpm test:unit` | Unit tests only |
| `pnpm test:int` | Integration tests (requires Docker) |
| `pnpm test:coverage` | Coverage report (unit + api layers) |
| `pnpm test:e2e` | Playwright smoke tests |
| `pnpm test:search` | Search recall eval over the fixture deck (requires Docker; hybrid part needs the committed embedding cache) |
| `pnpm test:search:update` | Same, filling missing vectors in `search-embeddings.json` with the real API (needs `OPENROUTER_API_KEY` or `OPENAI_API_KEY`; commit the file) |
| `pnpm media:reconcile` | List Cloudinary images tagged `editor`/`ingest` that have no `assets` row (dry run; `-- --delete` removes them). Needs `CLOUDINARY_URL` and `DATABASE_URL` |
| `pnpm job:run <queue>` | Enqueue one job on a named pg-boss queue (e.g. `media-sweep`, `link-check-sweep`) for the running worker |
| `pnpm links:snapshot-backfill` | Enqueue `link-snapshot` for existing link cards whose preview image isn't stored yet (run once after deploying 014; needs `DATABASE_URL`, the worker needs `CLOUDINARY_URL`) |
| `pnpm search:load` | Create/fill a `search-demo` deck with the fixture cards through the API (`--deck`, `--base-url`/`BASE_URL`, `--token`/`SMOKE_SESSION_TOKEN`) |
| `pnpm search:query "<q>"` | Print search hits (why, score) for a deck, same options |
| `pnpm db:generate` | Generate migrations with drizzle-kit |
| `pnpm db:migrate` | Run pending migrations |
| `pnpm db:rollback` | Rollback latest migration |
| `pnpm db:seed` | Upsert the owner account/user from `SEED_OWNER_EMAIL` (local development only; refuses `NODE_ENV=production`) |
| `pnpm compose:up` | Build and start the local stack (base + `docker-compose.local.yml`) |
| `pnpm compose:down` | Tear down docker-compose services |

## Running the Full Stack

To run the entire stack (database + API + web image) with Docker Compose:

```bash
pnpm compose:up
```

`compose:up` layers `infra/docker-compose.local.yml` over the base file: it builds both images from source, publishes the DB, the API and the web image on `127.0.0.1` (web on **http://localhost:8080**, with `API_URL=http://localhost:8080/api`), runs the API with `NODE_ENV=development` (so `CLOUDINARY_URL` is optional) and relaxes the production defaults for plain HTTP (`COOKIE_SECURE=false`, console mailer allowed — sign-in links appear in `docker compose -f infra/docker-compose.yml logs api`). The base `infra/docker-compose.yml` is what the deployed host runs: no host ports, `COOKIE_SECURE=true` and no console mail by default, no database service (`DATABASE_URL` points at the shared database, D67). The local Postgres lives only in `docker-compose.local.yml`. The API container runs migrations on startup; a `worker` service (same API image, `worker` entrypoint) starts after the API is healthy and embeds cards when `OPENROUTER_API_KEY` or `OPENAI_API_KEY` is set, with a heartbeat-file healthcheck. Seed the owner user from the host (uses `.env`, `SEED_OWNER_EMAIL` required):

```bash
pnpm db:seed
```

The `web` service carries the Traefik labels for the deployed setup (router `gobbit`, ``Host(`${PUBLIC_HOST}`)`` → `web:80`) and joins `dokploy-network`; its Caddy routes `/api/*` (stripped), `/s/*`, `/p/*`, `/sitemap.xml` and `/robots.txt` to the API. The API is internal only.

The app is at `http://localhost:8080`; the API is also published directly at `http://localhost:3000`.

## Smoke Tests

### On every PR (CI)

The `e2e` job in `ci.yml` builds both images from the PR and starts the local Compose stack (Postgres, API, worker, web on `:8080`). The API gets dummy Cloudinary credentials (the specs fake every Cloudinary host and sign the fake upload answer with that secret). It seeds the owner with a fresh `SMOKE_SESSION_TOKEN` and runs `playwright test --grep @smoke` against `http://localhost:8080/api`. It runs whenever `test` runs (docs-only changes skip both), and on `main` the image and deploy jobs wait for it. On failure the run uploads `e2e-report`: the Playwright report, traces and the `api`/`worker`/`web` logs.

To reproduce it locally (stop anything already on ports 5432/3000/8080 first):

```bash
CLOUDINARY_URL=cloudinary://e2e-key:e2e-secret@e2e-cloud pnpm compose:up
TOKEN=$(openssl rand -hex 32)
DATABASE_URL=postgres://pb:pb@localhost:5432/pb SEED_OWNER_EMAIL=owner@example.test SMOKE_SESSION_TOKEN=$TOKEN pnpm db:seed
BASE_URL=http://localhost:8080/api SMOKE_SESSION_TOKEN=$TOKEN CLOUDINARY_API_SECRET=e2e-secret pnpm test:e2e --grep @smoke
```

### Locally

With the dev server running and the seed run with `SMOKE_SESSION_TOKEN` set:

```bash
SMOKE_SESSION_TOKEN=<token> pnpm test:e2e
```

Each spec creates its own `smoke-<id>` deck and removes it (and any memberships) afterwards. The members spec invites the one standing user `smoke-invitee@example.test`; its user row stays, only the membership is removed.

or just one tier:

```bash
pnpm test:e2e --grep @smoke
pnpm test:e2e --grep @full   # nightly tier; run by hand until specs/011-e2e-nightly adds the workflow
```

### Deployed

Set environment variables and run:

```bash
BASE_URL=https://gobbit.niranhome.win/api SMOKE_SESSION_TOKEN=<token> pnpm test:e2e
```

Tests poll `/health` on startup to verify migrations are complete (and `/version.json` on the web origin when `EXPECTED_SHA` is set).

### Browser smoke (web-smoke)

`web.spec.ts` and `share.spec.ts` run in Chromium (Pixel 7 viewport) against `WEB_BASE_URL` — by default `BASE_URL` without its `/api` suffix, or `http://localhost:5173` locally. Install the browser once:

```bash
pnpm --filter e2e exec playwright install chromium
```

## Deployment

### How a push reaches the box

```
push to main → CI (tests, client drift, web build + budget; e2e: @smoke against the Compose stack built from the commit)
             → image job (matrix api, web): build with GIT_SHA, push ghcr.io/gobbit-app/service/{api,web}:{latest,<sha>}
             → deploy job: POST $DOKPLOY_DEPLOY_WEBHOOK (titled "<commit subject> — <sha7>") → Dokploy pulls both images, restarts the Compose project
             → smoke.yml waits until /api/health and /version.json report commit = <sha>, then runs the API and web-smoke projects
```

- **Manual deploy:** Actions → **CI** → **Run workflow** on `main` (or `gh workflow run ci.yml --ref main`). It runs the same pipeline for the current `main` head: tests, images, Dokploy webhook, then smoke. Run on any other branch, it only runs the tests.
- **Docs-only changes skip CI:** a `changes` job (`dorny/paths-filter`) runs first. If every changed file is `*.md`, under `docs/`, `LICENSE` or `apps/api/api.http`, then test, e2e, image and deploy are skipped (reported as skipped, which passes required checks), and smoke is skipped because nothing was deployed. PRs compare against their base; pushes to `main` compare against the last commit CI passed on `main`, so code from a cancelled or failed run still ships with the next push. Manual runs always do everything.

- **Images:** `ghcr.io/gobbit-app/service/api` and `ghcr.io/gobbit-app/service/web`, tagged `latest` and the full commit SHA. The base Compose file runs `${API_IMAGE_TAG:-latest}` / `${WEB_IMAGE_TAG:-latest}` with `pull_policy: always`. If the GHCR packages are private, give Dokploy registry credentials for `ghcr.io`.
- **Base images:** API `node:22-slim`; web built on `node:22-slim`, served by `caddy:2-alpine` (`apps/web/Caddyfile`: routing, cache headers, CSP). The web image serves `/version.json` with its commit.
- **Health check:** `GET /health` → `{ ok, db_ms, migration, commit }`; `commit` is the `GIT_SHA` build arg.
- **Database:** a shared Postgres outside the Compose project (see [Shared database](#shared-database-d67) below).
- **Migrations:** Automatic on container startup via `docker-entrypoint.sh`, against `DATABASE_URL`. The container exits if it's unset or the database is unreachable, and Docker restarts it.
- **Networking:** only `web` joins Dokploy's external `dokploy-network` (label `traefik.docker.network=dokploy-network`), where Traefik and the shared `cloudflared` Compose service run. The tunnel's public hostname `gobbit.niranhome.win` points at Traefik; Traefik sends the whole host to `web:80`, and Caddy forwards `/api`, `/s`, `/p`, `/sitemap.xml` and `/robots.txt` to `api:3000` on the project network (D51).
- **No seed on the box:** the deployed database starts empty. Sign in by magic link as the owner (the first sign-in creates the user), then mint the smoke token (below).
- **Logs:** the `api` container logs one line per request (`[api] GET /decks/… 200 12ms <requestId>`; no query strings, `/health` skipped). Embedding activity is in the separate `worker` container: `[worker] embed <itemId> → embedded (Nms)` per job, plus failures and sweep counts.
- **Backups:** see `infra/README.md`.

### Shared database (D67)

Postgres is not part of the Compose project. The API connects to a shared Postgres (with pgvector) that other services also use, each with its own database and role. Today that is a Dokploy-managed database reached over the home network; later it may be a cloud provider. Only `DATABASE_URL` changes.

One-time setup on the shared instance (Dokploy → **Create Service → Database → PostgreSQL**, image `pgvector/pgvector:pg18` or another pgvector tag). As its superuser:

```sql
CREATE ROLE gobbit LOGIN PASSWORD '<strong password>';
CREATE DATABASE gobbit OWNER gobbit;
REVOKE CONNECT ON DATABASE gobbit FROM PUBLIC;
\c gobbit
-- The app role can't create these (superuser only); migration 0000 then finds them and skips.
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
```

The `gobbit` role owns its database (and, on Postgres 15+, its `public` schema), so migrations can create tables and the `drizzle` schema. It cannot touch other services' databases.

**Reaching it:** give the Dokploy database an **External Port** (e.g. `5433`). Then set `DATABASE_URL=postgres://gobbit:<pw>@<box LAN IP>:5433/gobbit`. This works from the Gobbit containers on the same box and from any machine on the LAN. Don't port-forward it on the router. Docker-published ports bypass `ufw`, so the router (NAT) is what keeps it LAN-only.

**Leaving the LAN (cloud DB, or another site):** append `?sslmode=verify-full` (node-postgres also treats `require` as `verify-full`). This works as is with providers whose certificates chain to a public CA (Neon, Supabase, Crunchy, …). A provider with a private CA (e.g. RDS) also needs its CA bundle in the image and `sslrootcert=<path>`. For a self-hosted DB, prefer a private network (Tailscale/WireGuard) over a public port.

The API's `/health` reports `db_ms`, which is a quick way to see the network round-trip.

### Environment Variables (Production)

Every non-secret value (`API_URL`, `APP_URL`, `MAIL_PROVIDER=resend`, `MAIL_FROM`, `CLIENT_IP_HEADER=cf-connecting-ip`, `NODE_ENV=production`) is a default in `infra/docker-compose.yml` (D52). Dokploy holds only the secrets:

- `DATABASE_URL` – the `gobbit` database on the shared Postgres, e.g. `postgres://gobbit:<pw>@<box LAN IP>:5433/gobbit` (add `?sslmode=verify-full` off the LAN)
- `RESEND_API_KEY`
- `CLOUDINARY_URL` – the API refuses to start in production without it; it also signs the editor's photo uploads (browser → `api.cloudinary.com`, allowed by the web CSP)
- `OPENROUTER_API_KEY` (API + worker) – optional, preferred: enables embeddings, Ask and ingestion. Direct fallbacks: `OPENAI_API_KEY` (API + worker, embeddings) and `ANTHROPIC_API_KEY` (API + worker, Ask and ingestion). Without them search is text-only, Ask is off and sharing is hidden
- `RESEND_WEBHOOK_SECRET` – only for email-in, together with `INGEST_EMAIL_DOMAIN` (a plain value; see *Sharing into Gobbit*)

**Reading logs**: the API and the worker write one JSON object per line, so filter them with `jq`. For example `docker logs apps-gobbit-<id>-api-1 | jq 'select(.level=="error" or .level=="warn")'`, or `jq 'select(.component=="media")'` for photo uploads. At boot the API logs `cloudinary credentials ok`, or an error saying the credentials were rejected. A photo upload that Cloudinary refuses shows up as `browser upload to cloudinary failed`, with Cloudinary's status and message.

Optional overrides: `LOG_LEVEL`, `API_IMAGE_TAG`, `WEB_IMAGE_TAG`, `PUBLIC_HOST`, `TRAEFIK_ENTRYPOINT`, `EXTRACT_MODEL`, `EXTRACT_ESCALATION_MODEL`, `INGEST_DAILY_CAP`, `SHORTCUT_URL`, `INGEST_EMAIL_DOMAIN`.

### GitHub Actions

`.github/workflows/smoke.yml` runs:

```yaml
- name: Run e2e smoke tests
  env:
    BASE_URL: ${{ vars.API_BASE_URL }}
    WEB_BASE_URL: ${{ vars.WEB_BASE_URL }}
    SMOKE_SESSION_TOKEN: ${{ secrets.SMOKE_SESSION_TOKEN }}
  run: pnpm test:e2e --grep @smoke
```

Required secrets: `SMOKE_SESSION_TOKEN` (an owner bearer on the deployed instance — see "Smoke token" below). Optional: `CLOUDINARY_API_SECRET` (the API secret from the deployed `CLOUDINARY_URL`; the photo smoke signs its faked Cloudinary answer with it so the real API accepts the save — without it that step is skipped), `DOKPLOY_DEPLOY_WEBHOOK` (the Compose service's deploy webhook URL; without it the image is pushed but Dokploy is not told). The Dokploy Compose service must have **Autodeploy** enabled, otherwise the webhook answers 400 "Automatic deployments are disabled for this compose" and the deploy job fails.  
Required variables: `API_BASE_URL` (`https://gobbit.niranhome.win/api`). Optional: `WEB_BASE_URL` (defaults to `API_BASE_URL` without `/api`), `SMOKE_RUNNER` (defaults to `ubuntu-latest`; set to `self-hosted` if the API is only reachable privately).

The smoke job is **skipped until `API_BASE_URL` is set**, so the workflow stays green before a deployment exists. When run locally or in CI, a blank `BASE_URL` falls back to local defaults (`e2e/lib/env.ts`), except that CI fails fast if `BASE_URL` or `SMOKE_SESSION_TOKEN` is missing.

CI (`ci.yml`) runs on GitHub-hosted `ubuntu-latest`, so pull requests from forks never execute on private machines. Workflows take the pnpm version from `packageManager` in `package.json` and the Node version from `.nvmrc`.

**Note:** the shared database, the tunnel route, the Dokploy project and its backup schedule (Phase 0 steps 2, 5–7) are not set up yet; the repo side is ready.

## API Overview

### Routes

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | System health, latest migration tag and running commit |
| **Auth** |
| `POST` | `/auth/magic-link` | Email a sign-in link (always `200 { ok: true }`; rate limited) |
| `GET` | `/auth/callback` | Consume a sign-in/invite link, set session cookie, redirect |
| `POST` | `/auth/token-exchange` | From a cookie-authenticated request, mint a new bearer session (token shown once) |
| `POST` | `/auth/logout` | End the current session |
| `POST` | `/auth/logout-all` | End all of the user's sessions |
| `GET` | `/me` | Current user and their decks with roles |
| **Decks** |
| `GET` | `/decks` | List user's decks |
| `POST` | `/decks` | Create deck |
| `GET` | `/decks/{id}` | Get deck (by id or slug) |
| `PATCH` | `/decks/{id}` | Update deck (`isPublic` needs an owner; 403 `/problems/owner-required` for a maintainer) |
| `DELETE` | `/decks/{id}` | Soft-delete deck (owner) |
| **Members** |
| `GET` | `/decks/{id}/members` | List members (owner implicit first, pending included) |
| `POST` | `/decks/{id}/invites` | Invite by email with a role (201 new / 200 resend) |
| `DELETE` | `/decks/{id}/members/{userId}` | Remove a member |
| **Categories** |
| `GET` | `/decks/{id}/categories` | List categories |
| `POST` | `/decks/{id}/categories` | Create category |
| `PATCH` | `/decks/{id}/categories/{categoryId}` | Rename a category or change its visibility (owner/maintainer; the slug never changes) |
| **Items** |
| `GET` | `/decks/{id}/items` | List items (with cursor pagination); `?status=deleted` lists cards deleted in the last 30 days (owner/maintainer); `?flag=link` lists link cards flagged dead or changed (`item.update`) |
| `POST` | `/decks/{id}/items` | Create item |
| `GET` | `/items/{id}` | Get item |
| `PATCH` | `/items/{id}` | Update item |
| `DELETE` | `/items/{id}` | Soft-delete item (owner/maintainer; undo within 30 days) |
| `POST` | `/items/{id}/archive` | Archive item (owner/maintainer/editor; hidden from lists and search) |
| `POST` | `/items/{id}/restore` | Restore an archived item to published (keeps `verifiedAt`) |
| `POST` | `/items/{id}/undelete` | Undo a delete within 30 days (410 `/problems/undo-expired` after) |
| `POST` | `/items/{id}/link-check` | Check a link card now and return it (`item.update`; 10/hour per user; never marks a link dead on its own) |
| `DELETE` | `/items/{id}/link-check/flag` | Dismiss a link card's dead/changed note until its status changes (`item.update`; 404 without a flag) |
| **Search** |
| `GET` | `/decks/{id}/search?q=&limit=` | Hybrid search over visible, published cards (`why`: text / semantic / both) |
| `POST` | `/decks/{id}/ask` | Short answer citing the deck's cards (needs `OPENROUTER_API_KEY` or `ANTHROPIC_API_KEY`; 30/hour per user) |
| **Media** |
| `POST` | `/decks/{id}/media/sign` | Signed parameters for one direct browser → Cloudinary photo upload (`item.create`; folder `gobbit/items/<deckId>`; 60/hour per user; 503 without `CLOUDINARY_URL`) |
| `POST` | `/decks/{id}/media/assets` | Record a finished browser upload: Cloudinary's signed answer (`publicId`, `version`, `signature`, dimensions, bytes, format) is verified and the image is registered for the deck (`item.create`; 60/hour per user; 201 new, 200 repeat, 422 bad signature / wrong folder / other deck; 503 without `CLOUDINARY_URL`). Image cards may only reference recorded images |
| `POST` | `/decks/{id}/media/upload-failures` | The browser reports a refused Cloudinary upload (`status`, `message`, `fileType`, `fileBytes`); logged as a `warn` line, nothing stored (`item.create`; 30/hour per user; 204) |
| `POST` | `/decks/{id}/link-preview` | Title, description and image of a URL through the SSRF-guarded fetcher; `{ preview: null }` on any failure (`item.create`; 30/hour per user; cached 1 h) |
| **Ingestion** |
| `POST` | `/ingest` | Share a URL/text/≤ 3 images (JSON or multipart) into a deck; `202 { id, status }`. Session or `ing_` ingest token |
| `GET` | `/ingest/{id}` | Job status and debug view (sharer or deck publisher) |
| `GET` | `/me/ingest-tokens` | List your ingest tokens (prefix only) |
| `POST` | `/me/ingest-tokens` | Create an ingest token (shown once; max 5) |
| `DELETE` | `/me/ingest-tokens/{id}` | Revoke an ingest token |
| `GET` | `/decks/{id}/review` | Proposals awaiting review (needs `item.publish`) |
| `GET` | `/decks/{id}/review/count` | Number of proposals (header pill) |
| `POST` | `/items/{id}/publish` | Publish a proposal as new, or apply it as an update to its duplicate |
| `POST` | `/items/{id}/discard` | Discard a proposal |
| `POST` | `/webhooks/resend/inbound` | Resend inbound mail (Svix-signed; only when email-in is configured; not in OpenAPI) |
| **Public (no auth)** |
| `GET` | `/public/{slug}` | A public deck's name, kind and public categories with card counts |
| `GET` | `/public/{slug}/items?category=&cursor=&limit=` | Published cards in public categories, newest first (`limit` ≤ 50) |
| `GET` | `/public/{slug}/items/{itemId}` | One public card (allow-listed fields only) |
| **Favorites** |
| `POST` | `/items/{id}/favorite` | Add to favorites |
| `DELETE` | `/items/{id}/favorite` | Remove from favorites |

### Sharing into Gobbit (Phase 5)

Shares become **proposed** cards; a publisher approves them under **Review** in the deck. Ingestion needs an extraction provider key (see the env table) and the worker running.

- **Android**: install the PWA, then share from any app to *Gobbit*; pick the deck and send. The deck page's **Paste** button does the same for copied text or links.
- **iPhone**: create an ingest token in **Settings** (gear in the header), then add the *Share to Gobbit* Shortcut and paste the token when asked. Building and publishing the Shortcut (and setting `SHORTCUT_URL`): [`docs/shortcut/README.md`](./docs/shortcut/README.md).
- **Social posts**: Instagram, Facebook, Threads, TikTok, X and LinkedIn hide their pages from servers, so share the post's **caption and image** along with the link (the share sheet usually does). The card keeps them, shows the site's name, and is never link-checked. In the editor, **Add photo** puts your own picture on any link card.
- **Email (optional)**: each token also has an address `<token without ing_>@INGEST_EMAIL_DOMAIN`, shown once with the new token. Setup: Resend → *Receiving* (domain + MX records) → *Webhooks*: endpoint `https://<host>/api/webhooks/resend/inbound`, event `email.received`; set `INGEST_EMAIL_DOMAIN`, `RESEND_WEBHOOK_SECRET` (the `whsec_…` signing secret) and `RESEND_API_KEY`, then redeploy. Details in the same doc.

### Public decks (Phase 8)

A shared or communal deck can publish some of its categories to anyone, without signing in. An owner (or co-owner) sets `isPublic: true` on the deck (`PATCH /decks/{id}`), and an owner or maintainer sets `visibility: "public"` on each category to publish (`PATCH /decks/{id}/categories/{categoryId}`). Strangers then read only published cards in public categories under `/public/{slug}`. Personal decks can't be public, and a private, personal, deleted or unknown deck gets the same 404. Anonymous reads are limited to 600 per hour per IP (in-process, per API instance; 429 with `Retry-After`), and answers carry `Cache-Control: public, max-age=60`.

The same content is also server-rendered HTML for people and search engines, with no JavaScript: `/p/<slug>` (the deck), `/p/<slug>/c/<category>` and `/p/<slug>/i/<cardId>`. Signed-in members who open those links are redirected to the app; `?view=public` shows them the public page instead. A shared link (`/s/<cardId>`) to a public card leads to its `/p/` page. Communal public decks are indexable and listed in `/sitemap.xml` (`/robots.txt` points at it); shared public decks are reachable but `noindex`. Pages are cached for 5 minutes, and any edit, publish, archive, category or deck change shows on the next request. To get a communal deck into Google, add the site in Search Console (domain or URL-prefix property for the public host) and submit `https://<host>/sitemap.xml`.

### Writing cards (Phase 6)

Members who can edit (owner, maintainer, editor) get **Add card** in a deck (`/d/<slug>/new?type=text|link|table|calc|image`) and **Edit** on cards (`/i/<id>/edit`; "Edit fully" from the review queue). The editor shows a live preview with the same renderer as the list, checks limits as you type (the API stays authoritative) and can create a category inline. Unsaved changes are kept as a local draft in the browser (IndexedDB) and offered on reopen; drafts are deleted on save and on sign-out. Image cards take a photo or pick one (uploaded straight to Cloudinary; needs `CLOUDINARY_URL`), and link cards can **Fetch preview**.

### Browse mode (Phase 6)

**Browse** on a deck's All or category list opens `/d/<slug>/browse?c=<category>&i=<card>&pane=content|details|source`: one card per screen.

- **Swipes**: up/down for the next or previous card, across the header to change category, across the footer for the Details and Source panes.
- **Without gestures**: every action also has a button and a key (PageUp/PageDown, ArrowLeft/ArrowRight, Escape to close).
- **Offline**: Browse works for categories already cached.
- **Closing** returns to the list at the current card.

The gesture library (`@use-gesture/react`) loads only with this route; `pnpm budget` fails if it reaches the initial chunks.

### Interactive API

- **OpenAPI Schema:** `GET /openapi.json` (OpenAPI 3.1.0)
- **REST examples:** See `apps/api/api.http` for cURL examples

### Authentication

Passwordless magic links with server-side sessions. Browsers get an HttpOnly session cookie (unsafe methods require an allowed `Origin`, CSRF); scripts and native clients use `Authorization: Bearer <token>`.

```bash
# 1. request a link (with MAIL_PROVIDER=console it is printed to the API log)
curl -X POST http://localhost:3000/auth/magic-link \
     -H 'Content-Type: application/json' -d '{"email":"you@example.test"}'

# 2. open the logged link in a browser (sets the cookie), or use a seeded bearer:
curl -H "Authorization: Bearer $SMOKE_SESSION_TOKEN" http://localhost:3000/me
```

Every account has one personal deck, created on sign-in and addressed as `me` (`decks/me` in the API, `/d/me` in the PWA); it can't be deleted or shared. Access is per deck: the account owner is implicitly `owner` of its decks; invited members get `reader` (default), `editor`, `maintainer` or `owner` (co-admins, e.g. the Phase 8 communal deck; everything the account owner can do except delete the deck). Re-inviting a pending member replaces the invite: the new role applies and older links stop working. Decks a user cannot see return 404; forbidden actions return 403 `/problems/forbidden`. Categories marked `private` (and cards filed only under them) are hidden from readers and editors. See `docs/design/auth.md` for details.

### First run (empty instance)

1. Locally: `pnpm db:seed` creates only your owner user. Deployed: skip it — the first sign-in creates you.
2. `POST /auth/magic-link {"email":"<SEED_OWNER_EMAIL>"}` and open the link (console mailer: API log). You land on `/me` with `decks: []`.
3. `POST /decks {"name":"Family","slug":"family","kind":"shared"}` — the `general` category is created for you.
4. `POST /decks/family/invites {"email":"<second person>","role":"reader"}` — they open their link and see only Family.

Everything else (categories, cards) is created through the API; there is no sample data (D49).

### Smoke token: mint and rotate

- **Local:** `openssl rand -base64 32` → `SMOKE_SESSION_TOKEN` in `.env` → `pnpm db:seed` (re-running with a new value rotates it; the seeded session lasts 365 days).
- **Deployed:** there is no seed. Sign in as the owner in a browser, copy the `gobbit_session` cookie, then mint a bearer and store it as the `SMOKE_SESSION_TOKEN` GitHub secret:

  ```bash
  curl -s -X POST https://gobbit.niranhome.win/api/auth/token-exchange \
       -H 'Cookie: gobbit_session=<value>' | jq -r .token
  ```

  It is a 90-day sliding session, so smoke runs keep it alive; after 90 idle days mint a new one.

Either kind dies with `POST /auth/logout-all` (and with `POST /auth/logout` sent with that token, e.g. from `api.http`) — mint or seed again.

## Project Structure

```
community-pocketbook/
├── apps/
│   ├── api/          # Hono HTTP server, services, routes, worker (embeddings, ingestion)
│   └── web/          # Reader PWA (React + Vite) and its Caddy image
├── packages/
│   ├── api-client/   # Generated OpenAPI types + typed fetch/query client
│   ├── shared/       # Zod schemas, types, utilities
│   └── db/           # Drizzle ORM, migrations, seeding
├── e2e/              # Playwright smoke tests
├── infra/            # Docker Compose (deployed + local overlay), DB init, backups (README)
├── docs/             # Architecture & design decisions
├── specs/            # spec-kit feature specs, plans and tasks (Phase 6 on)
├── .specify/         # spec-kit constitution, templates and scripts
├── .env.example      # Environment variable template
└── README.md         # This file
```

## Documentation

- **[Architecture](./docs/architecture.md)** – Compact system map; per-area detail in [`docs/design/`](./docs/design/), decisions in [`docs/adr.md`](./docs/adr.md)
- **[Roadmap](./PLAN.md)** – Phase demos and progress
- **[Specs](./specs/README.md)** – Feature specs, plans and tasks (spec-kit) · **[Constitution](./.specify/memory/constitution.md)** – principles every plan is checked against
- **[iPhone Shortcut and email-in](./docs/shortcut/README.md)** – Building/publishing the Shortcut, inbound mail setup
- **[Contributing](./CONTRIBUTING.md)** · **[Security](./SECURITY.md)** · **[Code of Conduct](./CODE_OF_CONDUCT.md)**

## Development

### Workspace Structure

This is a **pnpm monorepo** with workspace `packages/` and `apps/`. Each package:

- TypeScript strict mode, no build step (runtime via `tsx`)
- ESM everywhere (`"type": "module"`)
- Named exports only
- Relative imports without extensions

### Git hooks

`pnpm install` points git at `.githooks/` (the `prepare` script). No extra dependencies:

- **pre-commit:** Prettier and ESLint on the staged files only, check mode (nothing is rewritten). Fix with `pnpm format` / `pnpm lint --fix` and stage again.
- **pre-push:** `pnpm typecheck && pnpm test:unit` (~10 s). Integration and smoke tests stay in CI.

Skip once with `--no-verify`.

### Planning (spec-kit)

From Phase 6 on, features are specified, planned and implemented with [spec-kit](https://github.com/github/spec-kit) 1.2.2 and Claude Code. Nothing to install beyond [uv](https://docs.astral.sh/uv/) (only needed to run the `specify` CLI); the agent skills are committed in `.claude/skills/speckit-*`.

1. In Claude Code, run `/speckit-specify <the outcome you want>`: this creates `specs/NNN-name/spec.md` (numbered from `006`).
2. `/speckit-clarify`, then `/speckit-plan`, `/speckit-tasks` and `/speckit-analyze`.
3. `/speckit-implement`, then `/speckit-converge`; repeat both until converge reports Converged.

Plans gate on [`.specify/memory/constitution.md`](./.specify/memory/constitution.md); project-specific templates live in `.specify/templates/overrides/`. Conventions (numbering, decision IDs, how specs age) are in [`specs/README.md`](./specs/README.md). To upgrade spec-kit, change the version in the command below, run it on a branch and review the diff:

```bash
uvx --from specify-cli==1.2.2 specify init --here --force --non-interactive --integration claude --script sh
```

### Database

- **Schema:** PostgreSQL 17 with pgvector + pg_trgm extensions
- **ORM:** Drizzle with snake_case columns, TypeScript camelCase
- **Migrations:** SQL files generated by drizzle-kit, custom up/down scripts
- **Constraints:** DB-enforced card limits (body length, payload size, type validation)
- **Triggers:** Auto `updated_at`, default category creation, default category protection

### Testing

| Layer | Tool | Scope | Environment |
|-------|------|-------|-------------|
| Unit | Vitest | `*.test.ts` next to code | Node |
| Integration | Vitest + Testcontainers | `*.int.test.ts` in `test/` | Docker (PostgreSQL) |
| Search eval | Vitest + Testcontainers | `*.search.test.ts` in `apps/api/test` | Docker (PostgreSQL) |
| E2E / Smoke | Playwright `@smoke` | `e2e/tests/smoke/` — critical journeys | Compose stack built from the PR (CI `e2e` job), then the live API post-deploy |
| E2E / Full | Playwright `@full` | `e2e/tests/full/` — everything else | Live API (nightly once 011 lands) |

Run with `pnpm test`, `pnpm test:unit`, `pnpm test:int`, `pnpm test:search`, or `pnpm test:e2e`.

**Which e2e tier?** Every feature or fix picks one and states it in its plan and PR (constitution V, ADR-053):

- **smoke**: it is on a critical journey (sign-in, reading a deck, creating or editing a card, photo upload, search, share/ingest submit, review publish), a regression would block core use, or it crosses a deployment boundary (proxy, CSP, env or secret, a third-party call);
- **full**: secondary paths, role variants, extra negatives, async or costly third-party work, cross-browser or offline variants;
- **none**: pure logic with no new UI or flow (unit/integration only).

A bug that reached production gets its regression test at the tier that would have caught it. Plans: [`specs/010-e2e-journeys`](./specs/010-e2e-journeys/plan.md) (smoke as real-usage journeys on every PR) and [`specs/011-e2e-nightly`](./specs/011-e2e-nightly/plan.md) (nightly full suite).

### Formatting & Linting

- **Prettier:** `singleQuote: true, printWidth: 100, trailingComma: 'all'`
- **ESLint:** `@eslint/js + typescript-eslint`

Run `pnpm lint && pnpm format` before committing.

### API Development

Request/response flow:

1. **Routes** (`src/routes/*.ts`) – Parse & validate input via `@hono/zod-openapi`, extract current user
2. **Services** (`src/services/*.ts`) – Business logic, authorization checks, Drizzle queries
3. **Repositories** (`src/repositories/*.ts`) – Direct database access via Drizzle ORM
4. **Mappers** (`src/lib/mappers.ts`) – Convert database rows to API DTOs

Error handling via custom `HttpError` class and Postgres constraint mapping.

## License

Licensed under the [Mozilla Public License 2.0](./LICENSE). You may use, modify and distribute this code, including in commercial and closed-source products; modifications to MPL-licensed files must be shared under the same license, and existing notices must be kept.

---

Questions, bugs and ideas: open a GitHub issue. Read [CONTRIBUTING.md](./CONTRIBUTING.md) before sending a pull request.
