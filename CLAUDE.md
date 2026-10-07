# Gobbit — Phase 2

A collaborative knowledge-card API for families/communities. Decks (personal/shared/communal) organize cards (text/link/image/table/calc) with categories, sources, favorites. Phase 1 delivered the core data model + typed REST API; Phase 2 adds magic-link sessions, memberships/roles and category visibility.

## Repo Layout

```
apps/api/        — Hono REST API (TypeScript strict)
apps/web/        — Placeholder (Phase 3)
packages/shared/ — Zod schemas, limits, utils (@pb/shared)
packages/db/     — Drizzle ORM, migrations, seed (@pb/db)
e2e/             — Playwright smoke tests
infra/           — Docker Compose (base = deployed, docker-compose.local.yml = local ports/dev defaults)
apps/api/Dockerfile — API image (also used by Compose)
docs/            — architecture.md (keep synced)
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
- **Deploy**: CI pushes `ghcr.io/gobbit-app/service/api` (built with `GIT_SHA`) and calls the Dokploy webhook; `/health` reports `commit`; smoke waits for it (ADR-033, `infra/README.md`)
- **Roles**: co-owners (owner memberships) can do everything except delete the deck; re-inviting a pending member replaces the invite (new role, older links expired)
- **Env**: `pnpm dev` and `pnpm db:*` load the repo-root `.env` if present (`tsx --env-file-if-exists`); real env vars win
- **Testing**: Unit `*.test.ts` next to code; Integration `*.int.test.ts` + Docker; E2E `@smoke` → each test creates and deletes its own `smoke-<id>` deck (D50)
- **Git hooks**: `.githooks/` via `prepare` — pre-commit = Prettier + ESLint on staged files (check only), pre-push = typecheck + unit
- **Docs**: Keep `docs/architecture.md` and `README.md` synced with code

## Key Commands

```
pnpm test:{unit,int,e2e}           # Test suites
pnpm typecheck / lint / format     # Code quality
pnpm db:{generate,migrate,rollback,seed}  # Database
pnpm dev                           # API dev mode (watch)
pnpm compose:{up,down}             # Docker (Postgres + API)
```

See `docs/architecture.md` and `README.md` for detailed setup.
