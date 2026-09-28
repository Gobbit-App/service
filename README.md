# Community Pocketbook

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
   Generate a DEV_API_TOKEN:
   ```bash
   openssl rand -hex 32
   ```
   Paste the output into `.env` as `DEV_API_TOKEN`.

3. **Start the database:**
   ```bash
   docker compose -f infra/docker-compose.yml up -d db
   ```

4. **Migrate and seed:**
   ```bash
   pnpm db:migrate
   pnpm db:seed
   ```

5. **Start the development server:**
   ```bash
   pnpm dev
   ```
   API listens on `http://localhost:3000`.

6. **Verify health:**
   ```bash
   curl http://localhost:3000/health
   ```

## Environment Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `DATABASE_URL` | `postgres://pb:pb@localhost:5432/pb` | PostgreSQL connection string |
| `PORT` | `3000` | API server port |
| `NODE_ENV` | `development` | Environment (development, test, production) |
| `DEV_AUTH_ENABLED` | `false` | Enable dev auth (Bearer token + X-Dev-User header) |
| `DEV_API_TOKEN` | — | Dev auth token (≥32 chars when enabled); generate with `openssl rand -hex 32` |
| `DEV_USER` | `dev@example.test` | Default dev user for e2e / smoke tests |
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
| `pnpm db:seed` | Populate dev data (pass `--allow-prod` for production) |
| `pnpm compose:up` | Bring up full stack via docker-compose |
| `pnpm compose:down` | Tear down docker-compose services |

## Running the Full Stack

To run the entire stack (database + API) with Docker Compose:

```bash
DEV_AUTH_ENABLED=true DEV_API_TOKEN=$(openssl rand -hex 32) pnpm compose:up
```

The API container automatically runs migrations on startup. Seed dev data:

```bash
DATABASE_URL=postgres://pb:pb@localhost:5432/pb pnpm db:seed
```

API is available at `http://localhost:3000`.

## Smoke Tests

### Locally

With the dev server running:

```bash
pnpm test:e2e
```

or just smoke tests:

```bash
pnpm test:e2e --grep @smoke
```

### Deployed

Set environment variables and run:

```bash
BASE_URL=https://api.example.com DEV_API_TOKEN=<token> DEV_USER=dev@example.test pnpm test:e2e
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
- `DEV_AUTH_ENABLED=false` (or `true` if you want a maintenance token)
- `DEV_API_TOKEN` – if enabled, a strong random token (≥32 chars)
- `PORT=3000` or as needed

### GitHub Actions

`.github/workflows/smoke.yml` runs:

```yaml
- name: Run e2e smoke tests
  env:
    BASE_URL: ${{ vars.API_BASE_URL }}
    DEV_API_TOKEN: ${{ secrets.DEV_API_TOKEN }}
    DEV_USER: ${{ secrets.DEV_USER }}
  run: pnpm test:e2e --grep @smoke
```

Required secrets: `DEV_API_TOKEN`, `DEV_USER`.  
Required variables: `API_BASE_URL`. Optional: `SMOKE_RUNNER` (defaults to `ubuntu-latest`; set to `self-hosted` if the API is only reachable privately).

CI (`ci.yml`) runs on GitHub-hosted `ubuntu-latest`, so pull requests from forks never execute on private machines.

**Note:** Database tunneling and backups (Phase 0 steps 5–7) are not yet implemented.

## API Overview

### Routes

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | System health & latest migration tag |
| **Pocketbooks** |
| `GET` | `/pocketbooks` | List user's pocketbooks |
| `POST` | `/pocketbooks` | Create pocketbook |
| `GET` | `/pocketbooks/{id}` | Get pocketbook (by id or slug) |
| `PATCH` | `/pocketbooks/{id}` | Update pocketbook |
| **Categories** |
| `GET` | `/pocketbooks/{id}/categories` | List categories |
| `POST` | `/pocketbooks/{id}/categories` | Create category |
| **Items** |
| `GET` | `/pocketbooks/{id}/items` | List items (with cursor pagination) |
| `POST` | `/pocketbooks/{id}/items` | Create item |
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

Dev auth (when `DEV_AUTH_ENABLED=true`):

```bash
curl -H 'Authorization: Bearer <DEV_API_TOKEN>' \
     -H 'X-Dev-User: dev@example.test' \
     http://localhost:3000/health
```

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
