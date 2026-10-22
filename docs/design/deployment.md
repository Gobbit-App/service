# Deployment and request routing

_Overview: [architecture.md](../architecture.md). Decisions: [adr.md](../adr.md)._

Operational steps (Dokploy, backups, restore) are in [`infra/README.md`](../../infra/README.md).

## Deployment layout (D46)

Images come from GHCR (ADR-033); the database is a shared Postgres outside the Compose project (ADR-039); backups and restore are in `infra/README.md`. One origin `https://gobbit.niranhome.win`: Traefik routes `PathPrefix(/api)` to the API with a strip-prefix middleware (labels in `infra/docker-compose.yml`), so `API_URL=https://gobbit.niranhome.win/api`, `COOKIE_DOMAIN` unset, `CORS_ORIGINS=https://gobbit.niranhome.win`, `CLIENT_IP_HEADER=cf-connecting-ip`.

## Request routing

```
phone ─HTTPS─▶ Cloudflare ─tunnel─▶ cloudflared ─▶ Traefik ── Host(gobbit.niranhome.win) ──▶ web:80 (Caddy)
                                                                                              │
                     /api/*  (prefix stripped) ─────────────────────────────────────────────┼──▶ api:3000 ──▶ db
                     /s/*    (unchanged) ───────────────────────────────────────────────────┤
                     /assets/*, /icons/*, /og/*, /sw.js, /version.json, index.html ◀────────┘ files in /srv
```

- `apps/web/Caddyfile` owns the routing and the response headers (D51, D54). Upstream `{$API_UPSTREAM:api:3000}`. Unknown paths fall back to `index.html`.
- Cache headers: `/assets/*` immutable for a year (hashed names); `/icons/*`, `/og/*`, `/favicon.svg` one day; everything else (HTML, `sw.js`, the manifest, `version.json`) `no-cache`. Responses are `zstd`/`gzip` encoded.
- The API has no Traefik labels and is not on `dokploy-network`; only `web` is.
- `/version.json` (`{ "commit" }`) is written at image build time from `GIT_SHA`. Smoke waits for it as it does for `/health`.
- Locally, `pnpm dev` runs Vite on 5173 and proxies `/api` (strip) and `/s` to `localhost:3000`, so magic links, cookies and the API share one origin in every setup (D64). `pnpm compose:up` serves the built image on `127.0.0.1:8080`.

## CI and deploy (Phase 3 deviations)

- **CI `deploy` job**: the Dokploy webhook runs once after the `image` matrix (api, web) finishes, not inside it. Dokploy rejects the webhook with 400 unless the Compose service has Autodeploy enabled; the step prints Dokploy's response body on failure (`curl --fail-with-body`). The POST carries a GitHub-push-shaped body (`X-GitHub-Event: push`, `head_commit.{id,message}` = short SHA and `<commit subject> — <sha7>`, or `Manual redeploy (<actor>)` on dispatch) so Dokploy's Deployments list shows what each deploy released; the Compose source is `raw`, so Dokploy does no branch matching and the body never changes what deploys. The same info goes to the job summary.
- **Manual deploy**: `ci.yml` also runs on `workflow_dispatch`. On `main` it builds and deploys exactly like a push (tests still gate it, and `smoke.yml` follows through `workflow_run`); on other branches it only runs the tests.
- **Docs-only gate**: `ci.yml` starts with a `changes` job (`dorny/paths-filter`, `predicate-quantifier: every`); `test` runs only if some changed file is outside `*.md`, `docs/**`, `LICENSE` and `apps/api/api.http`, and `image`/`deploy` follow `test`. The gate is job-level, not trigger-level `paths-ignore`, so a required check reports "skipped" (passing) instead of staying pending. Pushes to `main` diff against the head of the last successful non-PR CI run on `main` (`gh run list`), not `github.event.before`, because `cancel-in-progress` can cancel a code run and a following docs-only push must still deploy it. Manual dispatches, a missing previous run, or a skipped filter all run everything. `smoke.yml` first checks that the triggering run's `deploy` job succeeded, so it doesn't wait for a commit that was never deployed.
