# Contract: post-deploy check (`pnpm post-deploy-check`)

`infra/post-deploy-check.ts`. Not part of the e2e suite; no Playwright, no browser, no identity, no writes.

```text
pnpm post-deploy-check <origin> --sha <commit> [--timeout-minutes 10]
```

`<origin>` is the public origin of the deployed web (for example `https://gobbit.niranhome.win`); the
workflow derives it from `vars.API_BASE_URL` by removing the `/api` suffix and passes `github.sha`.

## Checks, in order

| # | Name | Passes when |
|---|------|-------------|
| 1 | `api-commit` | `GET <origin>/api/health` answers 200 with `ok: true` and `commit` equal to `--sha` (polled every 2 s up to the timeout; covers the pull and restart) |
| 2 | `web-commit` | `GET <origin>/version.json` reports the same commit (same polling) |
| 3 | `landing` | `GET <origin>/welcome` answers 200 `text/html` containing the join form |
| 4 | `anonymous-refused` | `GET <origin>/api/decks` and `GET <origin>/api/me` answer 401 with `application/problem+json` |
| 5 | `public-health` | `GET <origin>/api/health` reports `migration` not null |

## Output and exit

One line per check: `ok <name>` or `FAIL <name>: <reason>`; first failure stops the run. Exit 0 if all
pass, 1 on a failed check, 2 on bad arguments.

## Guarantees

- Only `GET` requests, none with credentials; no account, session or content is created (SC-008).
- Runs in under 30 s once the commit is live.
- The origin and commit are arguments; the script reads no environment variable.
