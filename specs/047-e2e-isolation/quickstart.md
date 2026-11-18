# Quickstart: validating self-contained e2e

Prerequisite: Docker with Compose ≥ 2.24. Nothing else: no running stack, no seed, no exported variable.

## 1. One command, throwaway stack (US1, SC-001)

```bash
pnpm test:e2e                      # whole suite
pnpm test:e2e --grep @smoke        # smoke tier
pnpm test:e2e tests/full/profile.spec.ts
docker compose ls --all            # no gobbit-e2e-* project is left
docker volume ls | grep gobbit-e2e # nothing
```

Interrupt a run with Ctrl-C and re-check `docker compose ls --all`: the project is gone. Start a second
`pnpm test:e2e` in another terminal during a run: both pass.

## 2. A real user per test (US2, US3)

Run `tests/smoke/sign-in.spec.ts` (UI sign-in through the mailbox) and `tests/full/isolation.spec.ts`
(two users saving their profile in parallel; no 429, no cross-talk). Run the converted
`tests/full/profile.spec.ts`: the ten cases that used to skip run and assert.

```bash
pnpm test:e2e tests/full/profile.spec.ts --reporter=list | grep -ci skipped   # 0
```

## 3. No environment, no credential (US4, SC-002)

```bash
pnpm --filter e2e exec vitest run lib/no-env.test.ts     # repo-scan guard
env -i HOME="$HOME" PATH="$PATH" pnpm test:e2e --grep @smoke   # empty environment apart from tooling
```

## 4. Post-deploy probe (US5, SC-008)

```bash
pnpm post-deploy-check http://127.0.0.1:8080 --sha "$(git rev-parse HEAD)"   # against a stack built from HEAD
pnpm post-deploy-check http://127.0.0.1:8080 --sha 0000000 --timeout-minutes 1  # FAIL api-commit
```

## 5. Limits and mail (D433, D435)

```bash
pnpm --filter @gobbit/api test:unit smtp-mailer env auth.service
```

## 6. In CI

The `e2e` and `e2e-full` jobs contain only: checkout, pnpm install, `playwright install --with-deps
chromium`, `pnpm test:e2e [--grep @smoke | tests/full] --retries=1`, and the artifact upload. No seed,
no token, no `env:` block. `smoke.yml` runs `pnpm post-deploy-check` with no secret.
