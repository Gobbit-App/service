# Implementation Plan: Landing page analytics

**Branch**: `031-landing-analytics` | **Date**: 2026-10-26 | **Spec**: [spec.md](./spec.md) | **Roadmap**: `PLAN.md` § Phase 9 (demo 4)

**Input**: Feature specification from `/specs/031-landing-analytics/spec.md`

Project override of the core template. Written for outside readers: the repository is public.

## Summary

**Service.** A self-hosted Umami container (`umami`) joins the deck's Compose project, with its own database on the shared Postgres (D231). It is reachable from the internet only through Caddy for two paths, `/stats/script.js` and `/stats/api/send`; its dashboard gets a separate hostname behind Umami's login (D232).

**Page.** The public `layout()` gains an `analytics` flag on `PageHead`. When the flag is set and `ANALYTICS_SITE_ID` is configured it renders one deferred, same-origin tracker tag. Only 030's landing renderer sets the flag. Every other page type is tested to render no tag.

**Conversion.** A Umami funnel from landing visits to `/welcome/joined`; `waitlist_summary` (028) stays the exact count (D233).

No migration, no new route in the API, no npm dependency.

## Starting point

- `main` with `030-landing-page` merged: landing renderer in `apps/api/src/public/` using `layout()`, served at `/welcome` (always) and at `/` without a `gobbit_session` cookie; PRG to `/welcome/joined`; confirm redirect to `/welcome?confirmed=1`.
- `apps/api/src/public/layout.ts`: `PageHead` type and `layout(head, main)` ("no script", D177).
- `apps/api/src/env.ts`: Zod env schema; production refinements (`superRefine`).
- `apps/web/Caddyfile`: `handle_path /api/*`, `handle /s/*`, `handle /p/*`, `@seo`, SPA `handle`; CSP header for all responses.
- `apps/web/src/sw.ts`: `NavigationRoute` denylist.
- `infra/docker-compose.yml` (deployed, raw YAML in Dokploy) and `infra/docker-compose.local.yml`; secrets only in Dokploy (D52).
- e2e: 030's smoke journey `e2e/tests/smoke/landing.spec.ts` (landing without a cookie, app with the smoke session).

## Technical Context

**Language/Version**: TypeScript (strict, ESM, no build step) on Node ≥ 22; Caddy 2

**Primary Dependencies**: Hono (`hono/html`); Umami (container image, PostgreSQL variant, pinned tag). No new npm dependency.

**Storage**: PostgreSQL 17 (shared). Umami's own database `umami`, migrated by Umami itself. No Gobbit migration.

**Testing**: Vitest unit (layout, env, landing renderer, Caddyfile routing table check); Playwright smoke (one assertion in 030's landing journey)

**E2E tier**: smoke — the change crosses a deployment boundary (a new Caddy proxy route and a script on a public page under the CSP). One assertion extends 030's landing smoke journey: with analytics configured the tracker tag is present and `/stats/script.js` answers 200 JavaScript from the same origin with no CSP violation; without it there is no tag. The browser's Umami opt-out is set before navigation so smoke never records a page view. No `@full` test: event counting is Umami's job and is checked by hand in the quickstart.

**Target Platform**: Docker Compose on Dokploy behind Traefik and Cloudflare; any browser for the landing page

**Project Type**: pnpm monorepo — API, PWA, shared packages, infra

**Performance Goals**: no measurable change to landing first render (deferred ~2 KB same-origin script)

**Constraints**: CSP stays `'self'` for scripts and connections; landing only; off when unconfigured; no IP, cookie or form value reaches analytics

**Scale/Scope**: one site, low thousands of visits per week

## Constitution Check

| Principle | How this plan complies |
|-----------|------------------------|
| I. Layered API | No route or service change; rendering stays in `public/` (layout + 030's landing renderer) |
| II. One source of truth | `ANALYTICS_SITE_ID` parsed once in `env.ts`; the `/stats` base path is one constant used by the layout and mirrored in the Caddyfile (checked by a unit test) |
| III. Invariants in the DB | Nothing stored by Gobbit; Umami's data lives in its own database |
| IV. Private by default | Landing only (FR-002), no cookies, no IP storage, Do Not Track honoured, no form values or tokens in tracked URLs; app, public decks and share previews never load the tracker (tested) |
| V. Tests at the right tier | Unit tests for every page type's tag/no-tag, env parsing and the Caddy route list; smoke assertion for the proxy + CSP boundary |
| VI. Lean, offline-first web | SPA untouched (no tag in `index.html`, bundle unchanged); SW denylist gains `/stats/`; one origin kept (ADR-034) |
| VII. Simple, optional, deployable | Optional: unset `ANALYTICS_SITE_ID` → off. New service justified in research (D231); no npm dependency |

One deliberate exception to D177 ("public pages carry no script"): the landing page carries one optional deferred script. Recorded in Complexity Tracking.

## Decisions this plan pins down

Full reasoning in [research.md](./research.md).

| ID | Decision | ADR? |
|----|----------|------|
| D231 | Self-hosted Umami (PostgreSQL image, pinned tag) in the deck's Compose project, own `umami` database on the shared Postgres; one website for the landing page | ADR-062 (with D232) |
| D232 | Same origin: Caddy proxies only `/stats/script.js` and `/stats/api/send`; tag rendered by `layout()` only for heads that carry `analytics` (set only when `ANALYTICS_SITE_ID` is configured); only the landing sets it; DNT on; dashboard on a separate host behind Umami's login | ADR-062 |
| D233 | Conversion = `/welcome/joined` views ÷ landing visitors (Umami funnel on paths); `waitlist_summary` is authoritative; smoke and operator opt out via Umami's `localStorage` switch | no |

## Project Structure

### Documentation (this feature)

```text
specs/031-landing-analytics/
├── spec.md
├── checklists/requirements.md
├── plan.md
├── research.md
├── data-model.md
├── contracts/analytics.md
├── quickstart.md
├── tasks.md
└── implementation-notes.md   # created during /speckit-implement
```

### Source Code (repository root)

```text
apps/api/src/
├── env.ts                                   # + ANALYTICS_SITE_ID (optional UUID)
├── env.test.ts                              # + unset / valid / invalid
├── public/analytics.ts                      # NEW: STATS_BASE_PATH, analyticsTag({ siteId, host })
├── public/analytics.test.ts                 # NEW
├── public/layout.ts                         # + PageHead.analytics?: { siteId, host } → tag in <head>
├── public/landing*.ts                       # (030) passes analytics when configured
└── public/pages.test.ts / seo.test.ts       # + public deck, item, category, error pages: no tag

apps/web/
├── Caddyfile                                # + @stats matcher → umami (two paths), 404 for the rest of /stats/*
├── src/sw.ts                                # + /^\/stats\// in the navigation denylist
└── scripts/caddy-routes.test.ts             # NEW: Caddyfile proxies exactly /stats/script.js and /stats/api/send; base path matches STATS_BASE_PATH

infra/
├── docker-compose.yml                       # + umami service (pinned image, env, Traefik router for STATS_HOST); ANALYTICS_SITE_ID in x-api-env
├── docker-compose.local.yml                 # + umami under profile `analytics`
└── README.md                                # + Umami: database, secrets, first login, website id, backup schedule

e2e/tests/smoke/landing.spec.ts              # (030) + analytics assertion (tag ⇔ configured; script 200; no CSP error; opt-out set)
```

**Structure Decision**: the tag lives in `public/analytics.ts` and is rendered by the shared layout, so "which pages are measured" is one flag per page head, visible in review. Infra changes stay in `infra/`; the dashboard is not part of the app.

## Invariant → test traceability

| Invariant / rule | Enforced in | Test (file, tier) |
|------------------|-------------|-------------------|
| FR-001 landing has the tag only when configured | `layout()` + landing renderer | `public/analytics.test.ts`, landing renderer test (unit: tag with site id; none when unset) |
| FR-002 no other page has the tag | `PageHead.analytics` opt-in | `public/pages.test.ts` (unit: public deck, category, item, error, sitemap: no `/stats/`); `apps/web` build test: `dist/index.html` has no `/stats/` (unit) |
| FR-003 same origin, CSP unchanged | `analyticsTag` relative `src`/`data-host-url`; Caddyfile | `analytics.test.ts` (unit: relative URLs only); `caddy-routes.test.ts` (unit: two proxied paths, CSP string unchanged); smoke: script 200, no CSP console error |
| FR-004 no cookies, DNT, no form values | tag attributes; landing URLs carry no personal data | `analytics.test.ts` (unit: `data-do-not-track="true"`); landing renderer test (unit: thanks/confirmed redirects carry only flag params) |
| FR-005 dashboard for last 7 days | Umami | quickstart §3 (manual, demo 4) |
| FR-006 works when blocked/down | `defer`; no-JS form (030) | 030's no-JS form tests; smoke runs with analytics off in PR CI |
| FR-007 optional | `env.ts` optional field | `env.test.ts` (unit: unset boots; non-UUID refuses) |
| Smoke never records views | opt-out in `addInitScript` | `landing.spec.ts` (e2e:smoke) |

## Rollout

- **Migrations**: none in Gobbit. Umami migrates its own database on first start.
- **Env / config**: API `ANALYTICS_SITE_ID` (optional, non-secret default empty in `x-api-env`); web image `ANALYTICS_UPSTREAM` (default `umami:3000`); Umami `UMAMI_DATABASE_URL`, `UMAMI_APP_SECRET` (Dokploy secrets), `STATS_HOST` (non-secret default).
- **Database**: create role and database `umami` on the shared Postgres (same steps as Gobbit's, no extensions); add a Dokploy backup schedule with prefix `umami/` (low priority, losing analytics history is acceptable).
- **Deploy order**: (1) create the database and secrets; (2) paste the new `docker-compose.yml` into Dokploy (raw source) and deploy with `ANALYTICS_SITE_ID` empty; (3) log in to the dashboard, change the admin password, add the website, copy its id; (4) set `ANALYTICS_SITE_ID` and redeploy. Until step 4 the landing page has no tag.
- **API client**: no change (no OpenAPI route).
- **Rollback**: unset `ANALYTICS_SITE_ID` (tag disappears at once); the service can stay or be removed.

## Risks

| Risk | Likelihood / impact | Mitigation |
|------|---------------------|------------|
| Tag leaks into app or public deck pages | L / H (privacy) | Opt-in flag per head; unit test per page type; `index.html` check |
| Umami dashboard exposed with default credentials | M / M | Separate host; password change is step 3 of rollout; owner chose the own-host option |
| Collect endpoint spammed to inflate numbers | L / L | No app data reachable; numbers cross-checked with `waitlist_summary`; Phase 11 abuse controls |
| Blockers undercount visits | M / L | Same-origin path; `waitlist_summary` is authoritative; `TRACKER_SCRIPT_NAME` can rename the script |
| Umami upgrade breaks the tracker contract | L / L | Pinned image tag; upgrade deliberately, re-run quickstart |
| Compose YAML not re-pasted into Dokploy | M / L | Rollout step 2; infra/README already warns about the raw source |

## Settle before starting

- [x] Dashboard exposure: own hostname behind Umami login (owner, 2026-10-26)
- [x] Thanks state on its own path `/welcome/joined` (030 contract updated; owner, 2026-10-26)

## Complexity Tracking

| Violation | Why needed | Simpler alternative rejected because |
|-----------|------------|--------------------------------------|
| A script on a public page (D177 says public pages carry none) | Demo 4 needs visit counts with referrers and de-duplication | A server-side counter table gives no dashboard and needs custom de-duplication (D231); the script is optional, deferred and same-origin, and nothing on the page depends on it |
| A new service in the deployment | Umami is the dashboard | Writing one ourselves (D231); hosted tools put a third party in the visitor's browser |
