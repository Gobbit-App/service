# Implementation notes: 031-landing-analytics

Plan: `specs/031-landing-analytics/plan.md`, tasks: `tasks.md`. Branch `feat/031-landing-analytics`, on `feat/030-landing-page`. The tracker tag and its opt-in in the public layout, the `/stats` proxy in Caddy, the `umami` Compose service and the docs. E2E tier: smoke — a new Caddy proxy route and a script under the CSP on a public page; without `ANALYTICS_SITE_ID` (PR CI) the smoke test asserts the tag is absent.

## Decisions not specified by the plan

- **`analytics.config` shares a start-up `bootId`** with `registration.mode`, generated once in `server.ts`.
- **The tag's host** comes from `APP_URL` (falling back to `API_URL`), so `data-domains` is the public host.
- **The smoke test opts out first** (`addInitScript` sets `umami.disabled`) and only runs the browser check behind Caddy; on the Vite dev server it skips.
- **The local `umami` service** runs only with `--profile analytics`, on `127.0.0.1:3001`, against an `umami` database on the local `db`.

## Deviations from the plan

- **Three Caddy `handle` blocks** (`/stats/script.js`, `/stats/api/send`, then `/stats/*` → 404) instead of one `@stats` matcher, so the one-day `Cache-Control` applies only to the script.
- **`ANALYTICS_UPSTREAM` defaults to `gobbit-umami:3000`** in Compose (a network alias on the `umami` service): `web` is also on `dokploy-network`, where another project's `umami` could answer the plain name.
- **Image `ghcr.io/umami-software/umami:3.4.1`**: v3 images are PostgreSQL-only and have no `postgresql-` tag prefix.
- **`STATS_HOST` defaults to `gobbit-stats.niranhome.win`**, a first-level subdomain covered by Cloudflare's universal certificate.
- **The shell check is `apps/web/scripts/shell-check.ts`**, called from `pnpm budget` on the built `index.html`, with a unit test on the source `index.html`.
- **"No tag elsewhere" is also an integration test** (`apps/api/test/landing-analytics.int.test.ts`) with `ANALYTICS_SITE_ID` set, over deck, category, item, 404, sitemap and robots.
- **T018** (manual `pnpm compose:up` check) and **T022/T023** (quickstart on a deployed instance, PLAN.md) wait for the deploy.
