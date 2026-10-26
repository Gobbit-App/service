# Tasks: Landing page analytics

**Input**: Design documents from `/specs/031-landing-analytics/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/analytics.md, quickstart.md; `030-landing-page` merged

**Tests**: included — every rule has a unit test; the proxy/CSP boundary has one `[e2e:smoke]` assertion (plan, E2E tier).

## Format: `[ID] [P?] [Story] [Tier?] Description`

- **[P]**: can run in parallel (different files, no dependency)
- **[Story]**: US1 operator dashboard, US2 landing only, US3 optional for self-hosters
- **[Tier]**: `[e2e:smoke]` when the task adds or changes an e2e test

## Phase 1: Setup

- [x] T001 Open questions settled (2026-10-26): dashboard on its own hostname behind Umami login; thanks state on its own path `/welcome/joined`

## Phase 2: Foundational

- [ ] T002 [P] Unit tests in `apps/api/src/env.test.ts`: `ANALYTICS_SITE_ID` unset → `undefined`; valid UUID accepted; non-UUID refuses to boot
- [ ] T003 Add `ANALYTICS_SITE_ID` (optional UUID) to `apps/api/src/env.ts`
- [ ] T004 [P] Unit tests in `apps/api/src/public/analytics.test.ts`: tag markup per contract §2 (defer, relative `src` and `data-host-url`, `data-do-not-track="true"`, `data-domains` = host, attribute values escaped)
- [ ] T005 Create `apps/api/src/public/analytics.ts`: `STATS_BASE_PATH = '/stats'`, `analyticsTag({ siteId, host })`, `analyticsHead(env)` returning `{ siteId, host }` or `undefined`

**Checkpoint**: env and tag helper exist; nothing renders them yet.

## Phase 3: US2 — no tracking outside the landing page (P1)

Built before US1 so the opt-in is guarded from the first commit.

- [ ] T006 [P] [US2] Unit tests in `apps/api/src/public/pages.test.ts` (and `seo.test.ts`): public deck, category, item, error and sitemap responses contain no `/stats/` with `ANALYTICS_SITE_ID` set
- [ ] T007 [P] [US2] Unit test in `apps/web`: built `index.html` contains no `/stats/` (extend the existing build/budget check)
- [ ] T008 [US2] Add `analytics?: { siteId; host }` to `PageHead` in `apps/api/src/public/layout.ts`; render `analyticsTag` in `<head>` only when set
- [ ] T009 [P] [US2] Add `/^\/stats\//` to the navigation denylist in `apps/web/src/sw.ts`

## Phase 4: US1 — operator sees visits and conversion (P1) 🎯 MVP

- [ ] T010 [P] [US1] Unit tests for 030's landing renderer: tag on `/welcome`, `/` (no session), `/welcome/joined`, `?confirmed=1`, error re-render when configured; none when unset; thanks/confirm redirects carry only flag params
- [ ] T011 [US1] Landing renderer passes `analytics: analyticsHead(env)`
- [ ] T012 [P] [US1] Unit test `apps/web/scripts/caddy-routes.test.ts`: Caddyfile proxies exactly `/stats/script.js` and `/stats/api/send`, 404s the rest of `/stats/*`, prefix equals `STATS_BASE_PATH`, CSP header string unchanged
- [ ] T013 [US1] Caddyfile: `@stats` matcher, `uri strip_prefix /stats`, `reverse_proxy {$ANALYTICS_UPSTREAM:umami:3000}`; `handle /stats/*` → 404 (contract §1)
- [ ] T014 [US1] `infra/docker-compose.yml`: `umami` service (official PostgreSQL image, pinned tag; `DATABASE_URL`, `APP_SECRET` from Dokploy; `CLIENT_IP_HEADER`, `DISABLE_TELEMETRY`, `DISABLE_UPDATES`; Traefik router for `STATS_HOST`; no published port); `ANALYTICS_SITE_ID` in `x-api-env`; `ANALYTICS_UPSTREAM` on `web`
- [ ] T015 [P] [US1] `infra/docker-compose.local.yml`: `umami` under profile `analytics`, dashboard on a `127.0.0.1` port, local database URL
- [ ] T016 [US1] [e2e:smoke] Extend `e2e/tests/smoke/landing.spec.ts`: `addInitScript` sets `umami.disabled`; if the tag is present, `/stats/script.js` is 200 JavaScript and no CSP console error; in PR CI (unset) assert no tag. Replace 030's "no `<script>`" assertion (T023) with "no `<script>` other than the analytics tag", otherwise post-deploy smoke fails once `ANALYTICS_SITE_ID` is set

**Checkpoint**: quickstart §2 passes locally.

## Phase 5: US3 — optional for self-hosters (P2)

- [ ] T017 [P] [US3] `.env.example` and README env table: `ANALYTICS_SITE_ID` (optional), note that analytics is off by default
- [ ] T018 [US3] Verify `pnpm compose:up` without the profile and with the variable unset: landing renders without a tag, `/stats/script.js` is never requested (quickstart §2 step 8)

## Phase 6: Polish and close-out

- [ ] T019 [P] `infra/README.md` and `docs/design/deployment.md`: Umami database and role, secrets, first login and password change, website id, backup schedule, re-paste raw YAML
- [ ] T020 [P] `docs/design/waitlist.md` (or the landing area doc from 030): analytics section, conversion definition (D233), "Deviations" from `implementation-notes.md`
- [ ] T021 `docs/adr.md`: ADR-060 from D231 + D232; `docs/architecture.md`: ≤ 2 lines plus the ADR index row (stay < 250 lines)
- [ ] T022 Run quickstart §1 and §2; deploy per plan Rollout and run §3 (demo 4)
- [ ] T023 Mark the feature done in `PLAN.md` § Phase 9 and `specs/README.md`

## Dependencies

- Phase 2 before everything. US2 (T006–T009) before US1's T011 so the per-page guard exists first.
- T013 and T014 can land together; T016 needs T011 and T013.
- US3 needs T003 only.
- Close-out after all stories.

## Notes

- PR states "E2E tier: smoke — new Caddy proxy route and a script under the CSP on a public page".
- No migration, no OpenAPI change (`pnpm api:openapi` shows no drift).
- Never put the Umami admin password, `APP_SECRET` or database URL in the repo; they live in Dokploy only.
