# Community Pocketbook — Phase 1

A collaborative knowledge-card API for families/communities. Pocketbooks (personal/shared/communal) organize cards (text/link/image/table/calc) with categories, sources, favorites. Phase 1 delivers core data model + typed REST API.

## Repo Layout

```
apps/api/        — Hono REST API (TypeScript strict)
apps/web/        — Placeholder (Phase 3)
packages/shared/ — Zod schemas, limits, utils (@pb/shared)
packages/db/     — Drizzle ORM, migrations, seed (@pb/db)
e2e/             — Playwright smoke tests
infra/           — Docker Compose + Dockerfile
docs/            — architecture.md (keep synced)
```

## Ground Rules

- **pnpm only**, Node ≥22, ESM, TypeScript strict; no build step (export `.ts`, `tsc --noEmit` to check)
- **Architecture**: Routes (parse) → Services (rules) → Repositories (Drizzle SQL)
- **Schemas**: All DTOs in `@pb/shared` (Zod); row types from `@pb/db`
- **Database**: snake_case columns, camelCase in TS; `timestamp({ withTimezone: true, precision: 3, mode: 'date' })`
- **Card limits**: body ≤600 Unicode points; payload ≤8192 UTF-8 bytes (DB CHECK constraints)
- **Errors**: `application/problem+json` (RFC 7807) via central handler
- **Invariants**: Auto timestamps, default category creation & protection in migrations; hand-written down files in `packages/db/migrations/down/`
- **Dev Auth**: `DEV_API_TOKEN` (Bearer) + `X-Dev-User` header (Phase 2: real auth)
- **Testing**: Unit `*.test.ts` next to code; Integration `*.int.test.ts` + Docker; E2E `@smoke` → `smoke` pocketbook only
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
