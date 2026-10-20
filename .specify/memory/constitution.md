# Gobbit Constitution

Principles every spec, plan and task in this repository must satisfy. Each rule is already true of the
codebase (Phases 0–5) or was agreed in an ADR; the ADR in brackets holds the rationale. Operational
detail (commands, env vars, layout) lives in `CLAUDE.md`, `README.md` and `docs/architecture.md`.

## Core Principles

### I. Layered API

- Routes parse and validate input, services hold every business rule, repositories hold all SQL
  (Drizzle). A route never queries the database; a repository never decides access.
- Access control runs in services through `authorize()` + `can()` [ADR-017]; a deck the caller
  cannot see answers 404, not 403 [ADR-004].
- Rules that a second client will need (UI, MCP, agents) live in services so every client reuses
  them unchanged.
- Errors are `application/problem+json` (RFC 9457) produced by the central handler only [ADR-010,
  ADR-018].

### II. One source of truth for contracts

- Every request/response DTO is a Zod schema in `@pb/shared`; row types come from `@pb/db`.
- The web app uses the generated `@pb/api-client`; after any route change run `pnpm api:openapi`
  (CI fails on drift) [ADR-035].
- Payloads are validated in `@pb/shared` and re-validated on PATCH [ADR-008]; limits reject, they
  do not clamp [ADR-009].

### III. Invariants live in the database

- Card limits (body ≤ 600 Unicode code points, payload ≤ 8192 UTF-8 bytes), default categories,
  timestamps and other invariants are enforced by CHECK constraints and triggers, not only in code
  [ADR-007].
- Every schema change is a generated migration (`pnpm db:generate`) plus a hand-written down file in
  `packages/db/migrations/down/`, round-trip tested [ADR-011]. Merged migrations are never edited;
  a correction is a new migration.
- snake_case columns, camelCase in TypeScript, `timestamp({ withTimezone: true, precision: 3 })`
  [ADR-001]; soft deletes via `deleted_at` [ADR-005].

### IV. Private by default

- Every read path, search and Ask included, filters by deck membership, item status and
  `visibleCategoriesWhere()` [ADR-029, ADR-041].
- Sessions are opaque and server-side; scoped tokens (e.g. `ing_` ingest tokens) work only on their
  own endpoint [ADR-025, ADR-046].
- Outbound HTTP goes through `fetch/safe-fetch.ts` only [ADR-048].
- Agents and LLMs propose, people publish: no automated path publishes a card [D96].
- No personal data in fixtures, specs or docs: `example.test` emails, generic households
  [ADR-023].

### V. Tests at the right tier (NON-NEGOTIABLE)

- Every change with logic ships with tests in the same PR:
  - unit `*.test.ts` next to the code;
  - integration `*.int.test.ts` (Testcontainers) for SQL, migrations, triggers and access rules;
  - search eval `*.search.test.ts` for ranking changes (committed embedding cache) [ADR-043];
  - Playwright `@smoke` for new UI and API flows, happy and negative paths.
- Tests build their own data with factories; the seed creates only the owner [ADR-032]. Each smoke
  test creates and deletes its own `smoke-<id>` deck [D50].
- Each invariant named in a spec maps to at least one test (traceability table in the plan).

### VI. Lean, offline-first web

- React function components, plain CSS, no UI kit.
- API data is offline through the persisted query cache, never the service worker [ADR-036]; search
  results are not persisted.
- The initial bundle stays within the 150 KB gzip budget (`pnpm budget`); import values from
  `@pb/shared` subpaths, never the root.
- One origin everywhere: Caddy serves the PWA and proxies `/api` and `/s` (no CORS) [ADR-034].

### VII. Simple, optional, deployable

- pnpm only, Node ≥ 22, ESM, TypeScript strict, no build step (`.ts` exports, `tsc --noEmit`)
  [ADR-003].
- AI providers are optional: with no key, search falls back to text only and Ask turns off; never
  make a feature hard-require an AI key [ADR-044].
- Prefer an established library over custom code, and an existing dependency over a new one; add a
  new one only with a reason recorded in `research.md`.
- `main` is always deployable: CI builds the images, Dokploy deploys the image CI built, and smoke
  waits for `/health` to report the commit [ADR-033, ADR-038].

## Constraints

- Stack: Hono + Zod OpenAPI (API), pg-boss worker (separate process) [ADR-042], PostgreSQL 17 with
  pg_trgm and pgvector, Drizzle, React + Vite + TanStack Router/Query (web), Playwright, Vitest.
- Deployment: Docker Compose on Dokploy behind Traefik; shared Postgres outside the Compose project
  [ADR-039].
- The repository is public (MPL-2.0). Everything committed, specs included, is written for outside
  readers [ADR-023, ADR-049].

## Development Workflow

- New work goes through spec-kit: `/speckit-specify` → `/speckit-clarify` → `/speckit-plan` →
  `/speckit-tasks` → `/speckit-analyze` → `/speckit-implement` → `/speckit-converge`. Small fixes
  (one obvious change, no new behaviour) may skip the workflow.
- `PLAN.md` is the roadmap; each phase becomes one or more features under `specs/NNN-name/`.
- Decisions in `research.md` continue the project-wide `D` numbering; any that will outlive the
  feature become an ADR in `docs/architecture.md`.
- Before merge: `pnpm lint && pnpm format:check && pnpm typecheck && pnpm test:unit && pnpm test:int`
  pass; `docs/architecture.md` and `README.md` reflect the change, including a "Deviations" list
  when the code departs from the plan.

## Governance

- This constitution overrides conflicting guidance in templates and generated artifacts. Every
  plan's Constitution Check gates on it, and reviews check against it.
- A plan that must break a principle records it in the plan's Complexity Tracking table with the
  simpler alternative rejected; a recurring exception becomes an amendment instead.
- Amendments are PRs that edit this file and, if needed, the matching ADR. Versioning: MAJOR when a
  principle is removed or redefined, MINOR when one is added or materially expanded, PATCH for wording.

**Version**: 1.0.0 | **Ratified**: 2026-10-20 | **Last Amended**: 2026-10-20
