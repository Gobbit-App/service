# Tasks: App analytics

**Input**: Design documents from `/specs/033-app-analytics/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/analytics.md, quickstart.md; `031-landing-analytics` merged

**Tests**: included — every rule has a unit test; public tags have an integration test; the "off → no request" rule is `[e2e:smoke]`, the payload scan with a stubbed tracker is `[e2e:full]` (plan, E2E tier).

## Format: `[ID] [P?] [Story] [Tier?] Description`

- **[P]**: can run in parallel (different files, no dependency)
- **[Story]**: US1 operator sees usage, US2 joinable to Gobbit data, US3 nothing private leaves, US4 never in the way
- **[Tier]**: `[e2e:smoke]` / `[e2e:full]` when the task adds or changes an e2e test

## Phase 1: Setup

- [x] T001 Plan settled (2026-11-01): route catalogue keyed by route id, member id = user id, four content events, `/p` and `/s` through a first-party before-send script

## Phase 2: Foundational (shared rules)

- [x] T002 [P] [US3] Unit tests for `packages/shared/src/analytics/` (screens, events, sanitize, privacy): pattern/title rewrite, referrer origin, allow-listed event data (UUID ids, enum labels, positive count), cancel offline / unknown event / identify without member
- [x] T003 [US3] Create `@gobbit/shared/analytics` (`screens.ts`, `events.ts`, `sanitize.ts`, `privacy.ts`, `index.ts`) and the `./analytics` package export
- [x] T004 [US1] `appConfigSchema.analytics: { siteId, host } | null` in `packages/shared/src/schemas/config.ts` (+ `auth.test.ts` fixtures)
- [x] T005 [US1] `GET /config` returns `analytics` from `analyticsHead(env)` (`routes/config.ts`, unit + `config.int.test.ts`); `pnpm api:openapi`

**Checkpoint**: the rules exist and the app can learn whether analytics is on.

## Phase 3: US1 + US2 — the SPA sends screens and the member id (P1)

- [x] T006 [P] [US1] Unit tests `apps/web/src/analytics/catalogue.test.ts`: patterns only, untracked screens, unknown id → `/other`
- [x] T007 [US1] `analytics/catalogue.ts`: `Record<RouteId, Screen | null>` over the generated route ids
- [x] T008 [P] [US1] Unit tests `analytics/tracker.test.ts`: tag attributes, hook rewrites payload, cancels untracked screens, resolves on load / null on error
- [x] T009 [US1] `analytics/tracker.ts` (own chunk): installs `__gobbitAnalyticsBeforeSend`, appends `/stats/script.js`
- [x] T010 [P] [US2] Unit tests `analytics/analytics.test.ts`: no load without config or member, one view per pathname, identify on member change, `trackContent` no-op before load / offline / throwing tracker
- [x] T011 [US1] [US2] `analytics/analytics.ts` facade + `startAnalytics` in `main.tsx`
- [x] T012 [US1] `pnpm build:web && pnpm budget`: tracker not initial, index.html tracker-free

## Phase 4: US1 — content events (P1)

- [x] T013 [P] [US1] `card-created` / `card-edited` from `create-item.ts`, `update-item.ts` (not for proposals) with tests
- [x] T014 [P] [US1] `card-edited` (archive/restore/undelete) and `card-deleted` from `item-lifecycle.ts` with tests (no event on failure or rollback)
- [x] T015 [P] [US1] Review publish (create vs update), bulk publish (count) in `review.ts`; notes import (count) in `use-import-notes.ts`
- [x] T016 [P] [US1] `card-shared` from `ShareButton.tsx` (sheet / copied link, deck id and type from `CardBar`) and `useSubmitShare` (share target) with tests

## Phase 5: US1 + US3 — public pages and share previews (P1)

- [x] T017 [P] [US3] Unit tests `public/analytics.test.ts`: `withPage` renders `page.js` + tracker with pattern/screen; `analytics.config` lists `surfaces`
- [x] T018 [US1] `public/analytics.ts` page variant; public deck/category/card/search heads set it (`pages.ts`, `public-pages.service.ts`)
- [x] T019 [US1] Share previews (`share/wiring.ts`, `share.service.ts`, `share-page.ts`) carry the tags when configured, with tests
- [x] T020 [P] [US3] `apps/web/public/analytics/page.js` + `src/analytics/page-script.test.ts`: page views only, pattern, screen, referrer origin; cancels events, identify, offline
- [x] T021 [US3] `landing-analytics.int.test.ts`: deck, category, card, share preview carry pattern-only tags with no slug or id; 404, sitemap, robots never

## Phase 6: US3 + US4 — privacy notice, off means nothing (P1/P2)

- [x] T022 [P] [US3] Privacy note on the landing page (`landing-copy.ts`) and Settings → Privacy (`SettingsScreen.tsx`) with tests
- [x] T023 [US4] [e2e:smoke] `e2e/tests/smoke/web.spec.ts`: with `/config.analytics = null`, browsing a deck makes no `/stats/` request
- [x] T024 [US3] [e2e:full] `e2e/tests/full/app-analytics.spec.ts`: stubbed tracker runs the hook; browsing, a sentinel search and a created card leave only patterns, ids and labels; `card-created` data exact

## Phase 7: Polish

- [x] T025 Docs: ADR-065, `docs/architecture.md` row + index, `docs/design/web-pwa.md` and `public.md` sections, `waitlist.md` pointer, `infra/README.md`, `README.md`, `CHANGELOG.md` (**Action required**), `PLAN.md`, `CLAUDE.md`
- [x] T026 `implementation-notes.md`; deviations copied to `docs/design/web-pwa.md`
- [x] T027 `pnpm typecheck`, `lint`, `format:check`, `test:unit`, `test:int`
- [ ] T028 Quickstart §4 on the deployed instance (Umami views vs sessions, `card-created` vs `item_events`) and PLAN.md demo 7 — after deploy

## Dependencies

Phase 2 before everything; Phases 3–5 independent of each other once T005 exists; Phase 6 after 3 and 5; Polish last.
