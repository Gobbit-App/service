# Implementation Plan: Analytics consent

**Branch**: `035-analytics-consent` | **Date**: 2026-11-03 | **Spec**: [spec.md](./spec.md) | **Roadmap**: `PLAN.md` § Phase 9

**Input**: Feature specification from `/specs/035-analytics-consent/spec.md`

Project override of the core template. Written for outside readers: the repository is public.

## Summary

**Members.** The account gets one analytics choice (`users.analytics_consent`: null = not answered, `allowed`, `declined`), changed only through `PUT /me/analytics-consent`, which writes an `analytics_consent_events` audit row in the same transaction (D259, D260). `GET /me` carries the choice, so every device learns it with the request it already makes. One pure rule (`analyticsAllowed`) decides whether anything is sent; Do Not Track is no longer consulted (D261). The SPA facade loads the tracker only while the rule says yes, its before-send hook cancels every payload otherwise, and a change in the `me` cache takes effect without a reload (D262). An in-flow prompt in the app shell asks once per app start until answered; Settings → Privacy shows a switch with the date (D263, D266).

**Visitors.** The landing page, public pages and share previews render only the first-party `/analytics/page.js` plus a hidden banner. The script reads the device choice from `localStorage`, shows the banner when not answered, and injects Umami's tracker unless declined; the choice never leaves the browser (D264).

**Records.** `analytics.consent` on every change, `analytics.config.consent = 'opt_out'` at start, counts by choice by SQL next to 033's cross-check (D265).

One migration, one new route, no npm dependency, no new service.

## Starting point

- `main` @ `d263946` (035 spec merged, #77); latest migration `0019_users_registered_via`.
- 033 delivered: `apps/web/src/analytics/{analytics,tracker,catalogue}.ts`, `@gobbit/shared/analytics` (sanitiser, screens, events, privacy note), `apps/web/public/analytics/page.js`, `apps/api/src/public/analytics.ts` (`analyticsTag`, `withPage`, `analyticsHead`, `recordAnalyticsConfig`), heads on landing, `/p/*` and `/s/*`.
- Every tracker tag carries `data-do-not-track="true"` (031/033). `e2e/tests/smoke/landing.spec.ts` and `apps/api/test/landing-analytics.int.test.ts` assert that exact tag.
- `RootLayout` (`apps/web/src/routes/__root.tsx`) renders `OfflineBanner`, the outlet, toasts and the SW update notice.
- Settings → Privacy (`SettingsScreen.tsx`) shows `ANALYTICS_PRIVACY_NOTE` when analytics is on.
- CSP `default-src 'self'` (no inline script); CSRF middleware covers every unsafe method.

## Technical Context

**Language/Version**: TypeScript (strict, ESM, no build step) on Node ≥ 22; one plain JS file served as a static asset (`page.js`)

**Primary Dependencies**: existing only: Hono + Zod OpenAPI, Drizzle, React, TanStack Router/Query, Umami tracker (existing `umami` service). No new npm dependency.

**Storage**: PostgreSQL: three columns on `users`, new `analytics_consent_events` table (migration 0020 + down file). Browser: one `localStorage` key for visitors.

**Testing**: Vitest unit (rule table, sanitiser context, facade gating, page.js consent loader in jsdom, tags/layout, service, route, prompt, settings), API integration (migration round trip, CHECK, `PUT` writes one audit row in the same transaction, `/me` shape, forged requests change only the caller), Playwright smoke and full.

**E2E tier**: smoke + full. **Smoke**: the prompt is part of the first screen after sign-in (a critical journey); every existing smoke journey must pass unchanged with analytics off (PR CI) — the prompt does not render without `config.analytics` — and `landing.spec.ts` is updated for the new head (post-deploy smoke runs with analytics on and the tracker disabled via `umami.disabled`, so the banner appears there and must not block joining). **Full** (`e2e/tests/full/analytics-consent.spec.ts`): with `/api/config` answering analytics on and `/stats/script.js` replaced by a recording stub — (1) DNT on, unanswered member → views sent with id (SC-001); (2) "No thanks" in the prompt → zero sends; a second browser context of the same member → no prompt, zero sends (SC-002); (3) Settings switch on → views resume without reload; (4) visitor on `/welcome` → "No thanks" → `/p/{slug}` sends nothing and shows no banner; "Analytics" reopens → OK → view sent; (5) no cookie set and no payload carries the choice (SC-006). Full rather than smoke for these: secondary flows that need a stubbed third-party script.

**Target Platform**: Docker Compose on Dokploy; PWA on Android Chrome; any browser for public pages

**Project Type**: pnpm monorepo — API, PWA, shared packages

**Performance Goals**: initial SPA bundle within budget (prompt + rule < 1.5 KB gzip in the main chunk); `page.js` grows by ≤ 2 KB gzip (SC-007, checked by a unit test on the file)

**Constraints**: same origin, CSP unchanged, no cookies, nothing sent or queued offline, 033 payload rules unchanged, off when unconfigured

**Scale/Scope**: tens of members, one Umami site

## Constitution Check

| Principle | How this plan complies |
|-----------|------------------------|
| I. Layered API | `PUT /me/analytics-consent` parses only; `analytics-consent.service` holds the rule (same value = no-op, own user only); `users.repo.setAnalyticsConsent` holds the SQL |
| II. One source of truth | `analyticsConsentSchema`, request schema, `meSchema.analyticsConsent`, the rule and all copy in `@gobbit/shared` (`/analytics` subpath for values); row types from `@gobbit/db`; `pnpm api:openapi` |
| III. Invariants in the database | Enums for value and source; CHECK all-null-or-all-set on `users`; audit row in the same transaction; migration 0020 + hand-written down file, round-trip tested |
| IV. Private by default | The member choice is read and written only for the session's own user; the visitor choice never leaves the browser; audit rows hold ids only; 033 payload rules unchanged |
| V. Tests at the right tier | Unit, int, smoke and full as above; traceability below |
| VI. Lean, offline-first web | Prompt in the main chunk is small; tracker still lazy; switch disabled offline, nothing queued; `pnpm budget` |
| VII. Simple, optional, deployable | Unconfigured → no prompt, banner or link; no new dependency or env var |
| VIII. Accountable by default | Audit table + `analytics.consent`; `analytics.config.consent`; counts query and alert note (Accountability table) |

**Owner-approved change of scope**: supersedes 031 FR-004 (DNT part) and 033 FR-008/FR-013 (DNT parts); ADR-067 records it and amends ADR-062/066's "Do Not Track honoured".

## Decisions this plan pins down

Full reasoning in [research.md](./research.md).

| ID | Decision | ADR? |
|----|----------|------|
| D259 | Choice on `users` (null = not answered) + `analytics_consent_events` audit row, same transaction, no-op not recorded | ADR-067 |
| D260 | `GET /me.analyticsConsent`; `PUT /me/analytics-consent` (own user only); `analytics-consent.service` | ADR-067 |
| D261 | One rule `analyticsAllowed(member, device)`; DNT/GPC not consulted; `umami.disabled` untouched | ADR-067 |
| D262 | SPA facade gates load and every payload on the rule; reacts to `me` cache changes without reload | no |
| D263 | Member prompt in-flow in `RootLayout`; never on sign-in/auth-error/editor/new/Browse; closed = this app start only | no |
| D264 | Anonymous pages: `page.js` reads `localStorage`, shows the server-rendered hidden banner, injects the tracker unless declined | ADR-067 |
| D265 | `analytics.consent` event, `analytics.config.consent`, counts by SQL beside 033's cross-check | no |
| D266 | All copy in `@gobbit/shared/analytics`; Settings switch with date; offline disabled | no |

## Project Structure

### Documentation (this feature)

```text
specs/035-analytics-consent/
├── spec.md
├── checklists/requirements.md
├── plan.md
├── research.md
├── data-model.md
├── contracts/consent.md
├── quickstart.md
├── tasks.md
└── implementation-notes.md   # during /speckit-implement
```

### Source Code (repository root)

```text
packages/db/
├── src/schema/common.ts                     # + analyticsConsentEnum, analyticsConsentSourceEnum
├── src/schema/users.ts                      # + analytics_consent, _at, _source + CHECK
├── src/schema/analytics-consent-events.ts   # NEW audit table
├── migrations/0020_analytics_consent.sql (+ down/)
packages/shared/src/
├── analytics/consent.ts (+ test)            # NEW values, analyticsAllowed, parseDeviceConsent, DEVICE_CONSENT_KEY
├── analytics/privacy.ts                     # rewritten notes + prompt/banner/settings copy
├── analytics/sanitize.ts (+ test)           # context.consented === false → null
├── schemas/auth.ts                          # meSchema.analyticsConsent
└── schemas/analytics-consent.ts             # NEW request/response schemas

apps/api/src/
├── repositories/users.repo.ts (+ int test)  # consent columns on read; setAnalyticsConsent (lock, update, audit)
├── services/analytics-consent.service.ts (+ test, + .events.ts)  # NEW
├── services/index.ts                        # wire it
├── routes/me.ts (+ test)                    # /me field; PUT /me/analytics-consent
├── public/analytics.ts (+ test)             # analyticsTag → page.js only, no DNT; consent field in analytics.config
├── public/consent-banner.ts (+ test)        # NEW hidden banner + "Analytics" button markup
├── public/layout.ts, landing.ts, landing-copy.ts, pages.ts   # banner after header; button in privacy note / footer
├── share/share-page.ts (+ test)             # same head
apps/api/test/analytics-consent.int.test.ts  # NEW
apps/api/test/landing-analytics.int.test.ts  # updated tags

apps/web/
├── public/analytics/page.js (+ src/analytics/page-script.test.ts)   # consent-aware loader
├── src/analytics/analytics.ts (+ test)      # gating, react to me changes, hook context
├── src/analytics/tracker.ts (+ test)        # no DNT attribute
├── src/analytics/device-consent.ts (+ test) # NEW localStorage read (shared parser)
├── src/analytics/ConsentPrompt.tsx (+ test) # NEW
├── src/analytics/prompt-routes.ts (+ test)  # NEW where the prompt may show
├── src/api/analytics-consent.ts (+ test)    # NEW mutation hook, updates me cache
├── src/routes/__root.tsx                    # render ConsentPrompt
├── src/settings/PrivacySection.tsx (+ test) # NEW switch + date + copy
└── src/settings/SettingsScreen.tsx          # use PrivacySection

e2e/tests/smoke/landing.spec.ts              # new head; banner does not block joining
e2e/tests/full/analytics-consent.spec.ts     # NEW
docs: design/web-pwa.md (analytics section), design/public.md, design/waitlist.md (landing note), adr.md (ADR-067), architecture.md (one line + ADR row), infra/README.md (counts query, alert), CHANGELOG.md, PLAN.md, specs/README.md
```

**Structure Decision**: the rule and copy live in shared pure modules so the SPA and tests use the same code; `page.js` mirrors the anonymous half of the rule and is tested against the same table. Server-side changes follow route → service → repository.

## Invariant → test traceability

| Invariant / rule | Enforced in | Test (file, tier) |
|------------------|-------------|-------------------|
| FR-001 DNT not consulted | tags without `data-do-not-track`; rule ignores DNT | `tracker.test.ts`, `analytics.test.ts` (API), `page-script.test.ts` (unit); full e2e scenario 1 |
| FR-002 three states, existing = not answered | nullable enum + CHECK | `analytics-consent.int.test.ts` (int: new user → unanswered; CHECK rejects partial) |
| FR-003 run unless declined; wait for `me` | `analyticsAllowed`; facade needs member id | `consent.test.ts` (table), `analytics.test.ts` (web: no load without `me`, declined → no load) |
| FR-004 prompt, reappears until answered | `ConsentPrompt` + in-memory close | `ConsentPrompt.test.tsx` (unit); full e2e |
| FR-005 settings switch, immediate | `PrivacySection` + cache update; facade reacts | `PrivacySection.test.tsx`, `analytics.test.ts` (unit: allow → load + view); full e2e scenario 3 |
| FR-006 audit row same step, no-op none | `users.repo.setAnalyticsConsent` tx; service | `analytics-consent.service.test.ts` (unit), int test (row fields, same value → 0 rows, rollback → 0 rows) |
| FR-007 counts by choice | SQL in runbook | int test runs the documented query |
| FR-008/009 banner, device-only, never sent | `consent-banner.ts`, `page.js` | `consent-banner.test.ts`, `page-script.test.ts` (no cookie, payload has no choice), full e2e scenario 4–5 |
| FR-010 device declined → silent until member answers | rule row 3 | `consent.test.ts`, `analytics.test.ts` |
| FR-011 non-blocking, not over main action, a11y | in-flow region; route exclusions | `prompt-routes.test.ts`, `ConsentPrompt.test.tsx` (role/label, no focus steal); smoke journeys unchanged |
| FR-012 copy | shared copy | `privacy.test.ts` (no "Do Not Track" off-switch wording), `landing.test.ts`, `PrivacySection.test.tsx` |
| FR-013 unconfigured → nothing | `config.analytics` null | `ConsentPrompt.test.tsx`, `PrivacySection.test.tsx`, int test (no banner/script/button) |
| FR-014 033 payload rules unchanged | sanitiser untouched except consent gate | existing sanitiser tests + `app-analytics.spec.ts` (full) |
| FR-015 announced + declined observable | `analytics.config.consent`; runbook | `analytics.test.ts` (API unit) |
| Forged request changes only own choice | route has no user id; service uses session user | int test (two users, one session) |

## Accountability

Constitution VIII, ADR-060.

| Decision | Event / record | Outcomes · reasons | Fields (ids/hashes only) | Level | Watched | Alert threshold (default) | Test |
|----------|----------------|--------------------|--------------------------|-------|---------|---------------------------|------|
| Member changes analytics choice | `analytics_consent_events` row (same tx) + `analytics.consent` | `changed` | `userId`, `from`, `value`, `source`, `requestId` | info | aggregate per day; rate of `value=declined` | `declined` changes > 5 in 24 h (worth a look at the prompt copy) | int + unit |
| Same value saved again | `analytics.consent` | `unchanged` | `userId`, `value`, `source`, `requestId` | debug | aggregate | — | unit |
| Invalid body / no session | central handler (`request.failed` / 401 as today) | `refused` · `validation` / `unauthorized` | `requestId` | as today | rate | as today | route unit |
| Analytics mode at start | `analytics.config` | `enabled` (+ `consent: 'opt_out'`), `disabled` | `host?`, `surfaces?`, `consent?`, `bootId` | info | per instance | `disabled` in production (033) | API unit |
| Visitor's choice | none: kept only in the browser and never sent (FR-009, spec clarification) | — | — | — | — | — | page-script unit |
| Member declined → nothing sent | none server-side: the browser decides from the account's value; the account change itself is the record above | — | — | — | — | — | web unit |
| Usage drop vs. declines | counts query (`infra/README.md`) read before 033's cross-check alert | — | — | — | aggregate per week | 033 thresholds, after subtracting declined members' share | quickstart §3 |

**Operator controls**: `ANALYTICS_SITE_ID` (unset → off, no prompt or banner); `localStorage['umami.disabled']` per browser (still wins); no new limit is introduced, so no new env var.

## Rollout

- **Migrations**: `0020_analytics_consent` (additive; nullable columns, new table). Down file drops them.
- **Env / config**: none. `CHANGELOG.md` entry: behaviour change (DNT no longer turns analytics off; prompt and banner ship), not a deploy blocker.
- **API client**: `pnpm api:openapi` (new route, `/me` field).
- **Deploy order**: normal CI → Dokploy; migration runs before the API starts (existing). Old SPA builds ignore the new `/me` field; the new SPA tolerates a missing field (treat as not answered) for the minutes between API and web rollout.
- **Rollback**: revert the image; the down migration is safe (no other feature reads the columns).

## Risks

| Risk | Likelihood / impact | Mitigation |
|------|---------------------|------------|
| A decline is not honoured on another device until refresh | M / L | Spec accepts at most one view; `/me` refetch on focus |
| Prompt shifts layout on screens tests click | L / M | In-flow at the top, not on editor/Browse; smoke journeys run unchanged in CI |
| `page.js` grows past 2 KB gzip | L / L | Unit test measures gzip size |
| Visitor clears site data → banner again | H / L | Expected (spec edge case) |
| Opt-out default questioned for wider launch | M / M | Phase 11 privacy review (spec assumption); ADR-067 notes it |

## Settle before starting

- [x] Owner decisions in spec clarifications (default on unless declined, banner on anonymous pages, storage per kind)
- [x] CSP blocks inline script → first-party `page.js` (checked `apps/web/Caddyfile`)

## Complexity Tracking

| Violation | Why needed | Simpler alternative rejected because |
|-----------|------------|--------------------------------------|
| More script on public pages (D177 "no JS") | FR-008 banner and tracker gating | A no-JS banner can't store a choice without a cookie (spec forbids cookies) |
