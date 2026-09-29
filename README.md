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
   Set `SEED_OWNER_EMAIL` to your address. Local defaults use the console mailer (sign-in links are printed to the API log) and `COOKIE_SECURE=false`.

3. **Start the database:**
   ```bash
   docker compose -f infra/docker-compose.yml up -d db
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
   API listens on `http://localhost:3000`.

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
| `API_URL` | `http://localhost:${PORT}` | Public API address used in magic links (**required in production**) |
| `APP_URL` | — | Web app origin; sign-in/invite callbacks redirect here (falls back to `${API_URL}/me`) |
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
| `SEED_OWNER_EMAIL` / `SEED_OWNER_NAME` | — | Owner created by `pnpm db:seed` (email required) |
| `SMOKE_SESSION_TOKEN` | — | Optional ≥32-char owner bearer seeded for the smoke suite; generate with `openssl rand -base64 32` |
| `BASE_URL` | `http://localhost:3000` | API base URL for e2e tests |
| `DB_PORT` | `5432` | Mapped database port in Compose |
| `API_PORT` | `3000` | Mapped API port in Compose |

## Commands

| Command | Purpose |
|---------|---------|
| `pnpm dev` | Start API dev server (tsx watch) |
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
| `pnpm db:seed` | Upsert the owner account/user from `SEED_OWNER_EMAIL` (pass `--allow-prod` for production) |
| `pnpm compose:up` | Bring up full stack via docker-compose |
| `pnpm compose:down` | Tear down docker-compose services |

## Running the Full Stack

To run the entire stack (database + API) with Docker Compose:

```bash
pnpm compose:up
```

Compose reads `.env` (console mailer, `COOKIE_SECURE=false` by default). The API container automatically runs migrations on startup. Seed the owner user (`SEED_OWNER_EMAIL` required):

```bash
DATABASE_URL=postgres://pb:pb@localhost:5432/pb SEED_OWNER_EMAIL=you@example.test pnpm db:seed
```

The API service also carries Traefik labels (router `gobbit-api`, ``Host(`${PUBLIC_HOST}`) && PathPrefix(`/api`)``, `/api` stripped) for the deployed setup.

API is available at `http://localhost:3000`.

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

Tests poll `/health` on startup to verify migrations are complete.

## Deployment

### Container image (any Docker host, e.g. Dokploy)

- **Image:** `ghcr.io/<owner>/<repo>/api` (lowercased, e.g. `ghcr.io/gobbit-app/service/api`), tagged `latest` and the full commit SHA
- **Base image:** `node:22-slim`
- **Health check:** `GET /health` endpoint
- **Migrations:** Automatic on container startup via `docker-entrypoint.sh`

### Environment Variables (Production)

Set these in your deployment platform:

- `DATABASE_URL` – PostgreSQL connection string
- `NODE_ENV=production`
- `API_URL` – public API address (e.g. `https://gobbit.niranhome.win/api`)
- `APP_URL`, `COOKIE_DOMAIN`, `CORS_ORIGINS` – as needed for the web app
- `MAIL_PROVIDER=resend` with `RESEND_API_KEY` and `MAIL_FROM` (or `console` + `ALLOW_CONSOLE_MAIL=true`)
- `CLIENT_IP_HEADER=cf-connecting-ip` behind Cloudflare
- `SEED_OWNER_EMAIL` and, for smoke runs, `SMOKE_SESSION_TOKEN` (run `pnpm db:seed --allow-prod` once)
- `PORT=3000` or as needed

### GitHub Actions

`.github/workflows/smoke.yml` runs:

```yaml
- name: Run e2e smoke tests
  env:
    BASE_URL: ${{ vars.API_BASE_URL }}
    SMOKE_SESSION_TOKEN: ${{ secrets.SMOKE_SESSION_TOKEN }}
  run: pnpm test:e2e --grep @smoke
```

Required secrets: `SMOKE_SESSION_TOKEN` (the same value seeded on the deployed DB).  
Required variables: `API_BASE_URL` (`https://gobbit.niranhome.win/api`). Optional: `SMOKE_RUNNER` (defaults to `ubuntu-latest`; set to `self-hosted` if the API is only reachable privately).

The smoke job is **skipped until `API_BASE_URL` is set**, so the workflow stays green before a deployment exists. When run locally or in CI, a blank `BASE_URL` falls back to local defaults (`e2e/lib/env.ts`), except that CI fails fast if `BASE_URL` or `SMOKE_SESSION_TOKEN` is missing.

CI (`ci.yml`) runs on GitHub-hosted `ubuntu-latest`, so pull requests from forks never execute on private machines. Workflows take the pnpm version from `packageManager` in `package.json` and the Node version from `.nvmrc`.

**Note:** Database tunneling and backups (Phase 0 steps 5–7) are not yet implemented.

## API Overview

### Routes

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | System health & latest migration tag |
| **Auth** |
| `POST` | `/auth/magic-link` | Email a sign-in link (always `200 { ok: true }`; rate limited) |
| `GET` | `/auth/callback` | Consume a sign-in/invite link, set session cookie, redirect |
| `POST` | `/auth/token-exchange` | Exchange a one-time code for a bearer session |
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

Access is per deck: the account owner is implicitly `owner` of its decks; invited members get `reader`, `editor` or `maintainer`. Decks a user cannot see return 404; forbidden actions return 403 `/problems/forbidden`. Categories marked `private` (and cards filed only under them) are hidden from readers and editors. See `docs/architecture.md` for details.

## Project Structure

```
community-pocketbook/
├── apps/
│   ├── api/          # Hono HTTP server, services, routes
│   └── web/          # Frontend (Phase 3)
├── packages/
│   ├── shared/       # Zod schemas, types, utilities
│   └── db/           # Drizzle ORM, migrations, seeding
├── e2e/              # Playwright smoke tests
├── infra/            # Docker Compose, database initialization
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
