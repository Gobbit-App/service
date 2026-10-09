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
   Runs the API on `http://localhost:3000` and the Reader PWA (Vite) on `http://localhost:5173`. Vite proxies `/api` (prefix stripped) and `/s` to the API, the same paths the web image's Caddyfile routes, so open the app at **http://localhost:5173** and everything — magic links, the session cookie, API calls — lives on that one origin (D64). `pnpm dev:api` / `pnpm dev:web` run one side only.

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
| `CLOUDINARY_URL` | — | The "API environment variable" URL from the Cloudinary console; **required in production**. Uploads generated share images; only the cloud name reaches clients (`GET /config`) |
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
| `pnpm dev` | API (tsx watch, :3000) and web (Vite, :5173) together |
| `pnpm dev:api` / `pnpm dev:web` | One of the two |
| `pnpm build:web` | Build the Reader PWA to `apps/web/dist` |
| `pnpm budget` | Check initial JS ≤ 150 KB gzip (after `build:web`) |
| `pnpm api:openapi` | Regenerate `packages/api-client` (OpenAPI document + types) after changing API routes |
| `pnpm og:static` | Re-render the private share image, PWA icons and favicon into `apps/web/public` (commit the result) |
| `pnpm lint` | Run ESLint |
| `pnpm format` | Format with Prettier |
| `pnpm format:check` | Check formatting |
| `pnpm typecheck` | TypeScript strict check (no emit) |
| `pnpm test` | Run all tests (Vitest) |
| `pnpm test:unit` | Unit tests only |
| `pnpm test:int` | Integration tests (requires Docker) |
| `pnpm test:coverage` | Coverage report (unit + api layers) |
| `pnpm test:e2e` | Playwright smoke tests |
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

`compose:up` layers `infra/docker-compose.local.yml` over the base file: it builds both images from source, publishes the DB, the API and the web image on `127.0.0.1` (web on **http://localhost:8080**, with `API_URL=http://localhost:8080/api`), runs the API with `NODE_ENV=development` (so `CLOUDINARY_URL` is optional) and relaxes the production defaults for plain HTTP (`COOKIE_SECURE=false`, console mailer allowed — sign-in links appear in `docker compose -f infra/docker-compose.yml logs api`). The base `infra/docker-compose.yml` is what the deployed host runs: no host ports, `COOKIE_SECURE=true` and no console mail by default, no database service (`DATABASE_URL` points at the shared database, D67). The local Postgres lives only in `docker-compose.local.yml`. The API container runs migrations on startup. Seed the owner user from the host (uses `.env`, `SEED_OWNER_EMAIL` required):

```bash
pnpm db:seed
```

The `web` service carries the Traefik labels for the deployed setup (router `gobbit`, ``Host(`${PUBLIC_HOST}`)`` → `web:80`) and joins `dokploy-network`; its Caddy routes `/api/*` (stripped) and `/s/*` to the API. The API is internal only.

The app is at `http://localhost:8080`; the API is also published directly at `http://localhost:3000`.

## Smoke Tests

### Locally

With the dev server running and the seed run with `SMOKE_SESSION_TOKEN` set:

```bash
SMOKE_SESSION_TOKEN=<token> pnpm test:e2e
```

Each spec creates its own `smoke-<id>` deck and removes it (and any memberships) afterwards. The members spec invites the one standing user `smoke-invitee@example.test`; its user row stays, only the membership is removed.

or just smoke tests:

```bash
pnpm test:e2e --grep @smoke
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
push to main → CI (tests, client drift, web build + budget)
             → image job (matrix api, web): build with GIT_SHA, push ghcr.io/gobbit-app/service/{api,web}:{latest,<sha>}
             → deploy job: POST $DOKPLOY_DEPLOY_WEBHOOK → Dokploy pulls both images, restarts the Compose project
             → smoke.yml waits until /api/health and /version.json report commit = <sha>, then runs the API and web-smoke projects
```

- **Images:** `ghcr.io/gobbit-app/service/api` and `ghcr.io/gobbit-app/service/web`, tagged `latest` and the full commit SHA. The base Compose file runs `${API_IMAGE_TAG:-latest}` / `${WEB_IMAGE_TAG:-latest}` with `pull_policy: always`. If the GHCR packages are private, give Dokploy registry credentials for `ghcr.io`.
- **Base images:** API `node:22-slim`; web built on `node:22-slim`, served by `caddy:2-alpine` (`apps/web/Caddyfile`: routing, cache headers, CSP). The web image serves `/version.json` with its commit.
- **Health check:** `GET /health` → `{ ok, db_ms, migration, commit }`; `commit` is the `GIT_SHA` build arg.
- **Database:** a shared Postgres outside the Compose project (see [Shared database](#shared-database-d67) below).
- **Migrations:** Automatic on container startup via `docker-entrypoint.sh`, against `DATABASE_URL`. The container exits if it's unset or the database is unreachable, and Docker restarts it.
- **Networking:** only `web` joins Dokploy's external `dokploy-network` (label `traefik.docker.network=dokploy-network`), where Traefik and the shared `cloudflared` Compose service run. The tunnel's public hostname `gobbit.niranhome.win` points at Traefik; Traefik sends the whole host to `web:80`, and Caddy forwards `/api` and `/s` to `api:3000` on the project network (D51).
- **No seed on the box:** the deployed database starts empty. Sign in by magic link as the owner (the first sign-in creates the user), then mint the smoke token (below).
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
- `CLOUDINARY_URL` – the API refuses to start in production without it

Optional overrides: `API_IMAGE_TAG`, `WEB_IMAGE_TAG`, `PUBLIC_HOST`, `TRAEFIK_ENTRYPOINT`.

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

Required secrets: `SMOKE_SESSION_TOKEN` (an owner bearer on the deployed instance — see "Smoke token" below). Optional: `DOKPLOY_DEPLOY_WEBHOOK` (the Compose service's deploy webhook URL; without it the image is pushed but Dokploy is not told).  
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
| `PATCH` | `/decks/{id}` | Update deck |
| `DELETE` | `/decks/{id}` | Soft-delete deck (owner) |
| **Members** |
| `GET` | `/decks/{id}/members` | List members (owner implicit first, pending included) |
| `POST` | `/decks/{id}/invites` | Invite by email with a role (201 new / 200 resend) |
| `DELETE` | `/decks/{id}/members/{userId}` | Remove a member |
| **Categories** |
| `GET` | `/decks/{id}/categories` | List categories |
| `POST` | `/decks/{id}/categories` | Create category |
| **Items** |
| `GET` | `/decks/{id}/items` | List items (with cursor pagination) |
| `POST` | `/decks/{id}/items` | Create item |
| `GET` | `/items/{id}` | Get item |
| `PATCH` | `/items/{id}` | Update item |
| `DELETE` | `/items/{id}` | Soft-delete item |
| `POST` | `/items/{id}/archive` | Archive item |
| **Favorites** |
| `POST` | `/items/{id}/favorite` | Add to favorites |
| `DELETE` | `/items/{id}/favorite` | Remove from favorites |

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

Access is per deck: the account owner is implicitly `owner` of its decks; invited members get `reader` (default), `editor`, `maintainer` or `owner` (co-admins, e.g. the Phase 8 communal deck; everything the account owner can do except delete the deck). Re-inviting a pending member replaces the invite: the new role applies and older links stop working. Decks a user cannot see return 404; forbidden actions return 403 `/problems/forbidden`. Categories marked `private` (and cards filed only under them) are hidden from readers and editors. See `docs/architecture.md` for details.

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
│   ├── api/          # Hono HTTP server, services, routes
│   └── web/          # Reader PWA (React + Vite) and its Caddy image
├── packages/
│   ├── api-client/   # Generated OpenAPI types + typed fetch/query client
│   ├── shared/       # Zod schemas, types, utilities
│   └── db/           # Drizzle ORM, migrations, seeding
├── e2e/              # Playwright smoke tests
├── infra/            # Docker Compose (deployed + local overlay), DB init, backups (README)
├── docs/             # Architecture & design decisions
├── .env.example      # Environment variable template
└── README.md         # This file
```

## Documentation

- **[Architecture & Decisions](./docs/architecture.md)** – System design, schema patterns, API conventions
- **[Roadmap](./PLAN.md)** – Phase demos and progress
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
| E2E / Smoke | Playwright | `e2e/tests/**/*.spec.ts` | Live API |

Run with `pnpm test`, `pnpm test:unit`, `pnpm test:int`, or `pnpm test:e2e`.

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
