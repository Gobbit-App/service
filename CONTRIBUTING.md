# Contributing

Thanks for your interest in Gobbit (the `Gobbit-App/service` repository). Bug reports, ideas and pull requests are welcome.

## Before you start

- For anything bigger than a small fix, open an issue first so the approach can be agreed on. Features are then specified under [`specs/`](./specs/README.md) with spec-kit and must pass the [constitution](./.specify/memory/constitution.md).
- Check [PLAN.md](./PLAN.md) for the roadmap and [docs/architecture.md](./docs/architecture.md) for the system map (detail in `docs/design/`, decisions in `docs/adr.md`).
- Security problems: do **not** open a public issue — see [SECURITY.md](./SECURITY.md).

## Development setup

Requirements: Node ≥ 22, pnpm 11 (`corepack enable`), Docker. Full instructions are in the [README](./README.md).

```bash
pnpm install
cp .env.example .env
pnpm compose:up
```

## Ground rules

- **pnpm only** — do not commit `package-lock.json` or `yarn.lock`.
- TypeScript strict, ESM, no build step.
- Layering: routes (parse) → services (rules) → repositories (SQL).
- All request/response DTOs live in `@gobbit/shared` as Zod schemas.
- Schema changes need a generated migration (`pnpm db:generate`) **and** a hand-written down file in `packages/db/migrations/down/`.
- Errors are `application/problem+json` (RFC 7807) via the central handler.

## Tests

Every change with logic needs tests:

| Kind | Location | Command |
|------|----------|---------|
| Unit | `*.test.ts` next to the code | `pnpm test:unit` |
| Integration | `*.int.test.ts` (Docker required) | `pnpm test:int` |
| E2E smoke | `e2e/tests/**` tagged `@smoke` | `pnpm test:e2e` |

## Pull requests

1. Fork and branch from `main`.
2. Make sure these pass locally: `pnpm lint && pnpm format:check && pnpm typecheck && pnpm test:unit && pnpm test:int`.
3. Update `README.md` / `docs/design/` when behaviour, setup or architecture changes; keep `docs/architecture.md` a compact map (a line or two per feature).
4. Keep PRs focused; describe the *why* in the PR description.

By contributing you agree that your contributions are licensed under the project's [license](./LICENSE).

## Code of conduct

This project follows the [Code of Conduct](./CODE_OF_CONDUCT.md).
