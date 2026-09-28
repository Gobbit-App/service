## What & why

<!-- What does this change and why is it needed? Link the issue: Closes #123 -->

## Checklist

- [ ] `pnpm lint && pnpm format:check && pnpm typecheck` pass
- [ ] `pnpm test:unit` and `pnpm test:int` pass
- [ ] Tests added/updated for new logic
- [ ] Schema change → migration generated **and** down file in `packages/db/migrations/down/`
- [ ] `docs/architecture.md` / `README.md` updated if behaviour or setup changed
