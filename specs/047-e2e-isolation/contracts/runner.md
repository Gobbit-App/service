# Contract: the e2e runner (`pnpm test:e2e`)

`e2e/run.ts`, started by the root script `pnpm test:e2e` (the `e2e` package script `test` keeps calling
Playwright directly for editor tooling that needs it with a stack already up; the documented command is the
runner).

## Command line

```text
pnpm test:e2e [--no-build] [--keep] [--clean] [-- <playwright args>]
```

| Argument | Meaning |
|----------|---------|
| `--no-build` | `up` without `--build` (reruns with images already built) |
| `--keep` | do not tear down (debugging); prints the project name and the `down` command; the next run's reaper will remove it after 2 hours |
| `--clean` | remove every `gobbit-e2e-*` project (and its volumes) and exit |
| anything else | passed to `playwright test` unchanged (`--grep @smoke`, `tests/full`, `--retries=1`, `--workers=4`) |

The runner takes no other input. It reads no variable of its own: the Docker CLI it spawns inherits the
shell as any child process does, which is not a read by e2e code.

## Sequence

1. Verify `docker compose version` ≥ 2.24; else exit 2 with "Docker Compose ≥ 2.24 is required".
2. Reap: projects named `gobbit-e2e-<ts>-…` older than `STALE_AFTER_MS` are removed (`down -v`).
3. Choose two free loopback ports; write `e2e/.stack/compose.env` (ports, `API_URL`, `APP_URL`,
   `CLOUDINARY_URL`, `PLATFORM_ADMINS`, `LOG_HASH_KEY`) from `stack-config.ts`.
4. `docker compose -p <project> -f infra/docker-compose.yml -f infra/docker-compose.local.yml -f infra/docker-compose.e2e.yml --env-file e2e/.stack/compose.env up -d --build --wait --wait-timeout 300`; on a port bind error, retry once with new ports.
5. Wait for `<webUrl>/api/health` (`ok`, `migration` equals the last tag in `packages/db/migrations/meta/_journal.json`) and `<webUrl>/version.json`.
6. Write `e2e/.stack/stack.json` ([stack-file.md](./stack-file.md)).
7. Spawn `playwright test --config playwright.isolated.config.ts` (later `playwright.config.ts`) with the
   extra arguments; stream its output.
8. `finally`, and on `SIGINT`/`SIGTERM`: on failure of the run or step 4–5, collect `docker compose logs --no-color api worker web mailpit` to `e2e/.stack/stack.log` (uploaded by CI), then
   `docker compose -p <project> down -v --remove-orphans`, delete `stack.json`, exit with Playwright's code.

## Exit codes

| Code | Meaning |
|------|---------|
| 0 | all tests passed |
| 1 | tests failed (Playwright's code) |
| 2 | prerequisite missing (Docker, Compose version) |
| 3 | stack failed to start or become healthy (logs saved) |

## Guarantees

- No container, volume or network of the project remains after exit 0, 1 or 3, or after Ctrl-C. After a
  hard kill, the next run's reaper removes it once it is two hours old.
- Two runs at once get different projects, ports and volumes.
- The runner never touches a project whose name does not start with `gobbit-e2e-`, nor the standing
  `docker-compose.local.yml` stack.
