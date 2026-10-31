# Implementation Plan: App analytics

**Branch**: `033-app-analytics` (work branch `feat/033-app-analytics`) | **Date**: 2026-11-01 | **Spec**: [spec.md](./spec.md) | **Roadmap**: `PLAN.md` § Phase 9

**Input**: Feature specification from `/specs/033-app-analytics/spec.md`

Project override of the core template. Written for outside readers: the repository is public.

## Summary

**App.** `GET /config` tells the SPA whether analytics is on (`analytics: { siteId, host } | null`). Once a member is signed in and the app is idle, a lazy `analytics/tracker` chunk loads Umami's same-origin tracker with auto-tracking off and installs one before-send hook. Page views come from the router: route pattern and fixed screen name from a catalogue typed against the generated route ids (D244, D245). Every payload passes one pure sanitiser (`@gobbit/shared/analytics`), which sets the member's user id, reduces the referrer to its origin, filters event data to ids and fixed labels, and cancels everything while offline (D246, D247). Mutation success paths call `trackContent()` for the four content events (D248).

**Public pages and share previews.** `layout()`'s opt-in `analytics` head gains a `page` (pattern + screen). Public deck pages and `/s/…` render a small first-party `/analytics/page.js` before the tracker, so no real path leaves the page (D249).

**Records.** `analytics.config` announces the covered surfaces. The activity log stays the record for content counts. The privacy line on the landing page and in Settings says what is measured (D250).

No migration, no new API route (one new field on `/config`), no npm dependency, no new service.

## Starting point

- `main` @ `de90f06` (033 spec merged, #73); latest migration unchanged by this feature; deployed with 031's Umami (`ghcr.io/umami-software/umami:3.4.1`) and `ANALYTICS_SITE_ID` set in production.
- `apps/api/src/public/analytics.ts`: `STATS_BASE_PATH`, `analyticsTag`, `analyticsHead`, `recordAnalyticsConfig` (D232, D243). `layout.ts`: `PageHead.analytics` opt-in; only the landing sets it.
- `apps/api/src/routes/config.ts` + `packages/shared/src/schemas/config.ts`: public `GET /config` (D55), cached 5 min and persisted by the SPA.
- `apps/api/src/routes/public-pages.ts`: `/p/:slug`, `/p/:slug/c/:category`, `/p/:slug/i/:itemId`, `/p/:slug/search`; `apps/api/src/share/share-page.ts`: share preview with `meta refresh 0` to `/i/{id}`.
- Web: TanStack file routes (`routeTree.gen.ts`), `main.tsx` creates the router and query client; mutations in `api/create-item.ts`, `update-item.ts`, `item-lifecycle.ts`, `review.ts`, `ingest.ts`, `import/use-import-notes.ts`; share button in `ui/ShareButton.tsx` (`lib/share.ts`).
- `apps/web/scripts/shell-check.ts`: `index.html` must never reference `/stats/` (stays true).
- ADR-062 (Umami), ADR-060 (accountability), ADR-063 (landing).

## Technical Context

**Language/Version**: TypeScript (strict, ESM, no build step) on Node ≥ 22; one plain JS file served as a static asset

**Primary Dependencies**: existing only: Hono, React, TanStack Router/Query; Umami tracker (served by the existing `umami` service). No new npm dependency.

**Storage**: none in Gobbit. Umami's own database (031).

**Testing**: Vitest unit (sanitiser, catalogue, facade, tracker loader, page script, layout/share tags, config, env), API integration (public pages render the tag with patterns only when configured), Playwright smoke (no `/stats/` traffic with analytics off) and full (stubbed tracker records only patterns/ids with analytics on)

**E2E tier**: smoke + full. Smoke: one assertion in the existing deck journey that the app makes zero `/stats/` requests when `/config` says analytics is off (SC-005, PR CI runs unconfigured); the change crosses the CSP/proxy boundary only when on, already covered by 031's smoke. Full (`e2e/tests/full/app-analytics.spec.ts`): with `/config` answering analytics on (Playwright route on `/api/config`) and `/stats/script.js` replaced by a recording stub, browse a deck named with a sentinel word, search a sentinel term, create a card; every recorded payload holds only patterns, screen names, ids and fixed labels (SC-003), and one `card-created` event carries the new item's id. Full rather than smoke: secondary flow, needs a stubbed third-party script.

**Target Platform**: Docker Compose on Dokploy; PWA on Android Chrome; any browser for public pages

**Project Type**: pnpm monorepo — API, PWA, shared packages

**Performance Goals**: initial bundle unchanged within noise (facade < 1 KB gzip in the main chunk; tracker chunk lazy); no added work before interactive

**Constraints**: same origin, CSP unchanged, no cookies, DNT honoured, off when unconfigured, nothing sent or queued offline; route patterns, fixed screen names and ids only

**Scale/Scope**: one Umami site; tens of members, low thousands of page views per week

## Constitution Check

| Principle | How this plan complies |
|-----------|------------------------|
| I. Layered API | Only `buildAppConfig` (route) and the public renderers change; no service or repository change |
| II. One source of truth for contracts | `appConfigSchema.analytics` in `@gobbit/shared`; event names, channels, props allow-list and the sanitiser in `@gobbit/shared/analytics` (one subpath, used by web; the API uses the pattern constants); `pnpm api:openapi` regenerates the client |
| III. Invariants live in the database | Nothing stored; the activity log stays the record (D250) |
| IV. Private by default | Patterns, fixed names, ids only; one sanitiser on every payload incl. tracker-built ones (D246); sign-in/auth-error untracked; anonymous pages carry no id; tested per catalogue entry (SC-003) |
| V. Tests at the right tier | Unit for the sanitiser/catalogue/facade/tags, int for public pages, smoke for "off means silent", full for the end-to-end payload check; traceability below |
| VI. Lean, offline-first web | Tracker in a lazy chunk after idle; `index.html` untouched; offline cancels sends, nothing queued; `pnpm budget` unchanged |
| VII. Simple, optional, deployable | Optional (`ANALYTICS_SITE_ID` unset → `/config.analytics = null` → nothing loads); no new dependency or service |
| VIII. Accountable by default | No decision about a member is made from analytics (spec edge case: forged collects); `analytics.config` announces surfaces; Umami cross-checked against `item_events` and sessions (Accountability table) |

**Owner-approved change of scope**: 031's FR-002 ("landing only") is superseded by this spec; ADR-065 records it. Identified sessions without a consent banner are accepted for the invite-only phase with the privacy notice (FR-013); Phase 11 revisits.

## Decisions this plan pins down

Full reasoning in [research.md](./research.md).

| ID | Decision | ADR? |
|----|----------|------|
| D244 | Route pattern catalogue keyed by generated route ids (`Record<RouteId, Screen \| null>`); API renderers pass the public/share pattern; `/other` fallback | ADR-065 |
| D245 | `/config.analytics`; tracker loaded lazily after idle and only with a member; `data-auto-track="false"`; page views from router `onResolved`, one per pathname change | ADR-065 |
| D246 | One pure sanitiser on every payload via `data-before-send`; first-party `/analytics/page.js` for public pages; offline cancels | ADR-065 |
| D247 | Distinct id = Gobbit user id from the `me` cache at send time; `identify` on every member change clears Umami's session token | ADR-065 |
| D248 | Four content events from mutation success paths, props allow-list, bulk = count, undelete = edited, no queue | no (in ADR-065 summary) |
| D249 | Public pages and share previews: opt-in `analytics.page` on the head; share-preview view best effort (`keepalive` vs `meta refresh 0`) | no |
| D250 | `analytics.config.surfaces`; weekly cross-check with `item_events`; privacy line on landing and Settings | no |

## Project Structure

### Documentation (this feature)

```text
specs/033-app-analytics/
├── spec.md
├── checklists/requirements.md
├── plan.md
├── research.md
├── data-model.md
├── contracts/analytics.md
├── quickstart.md
├── tasks.md
└── implementation-notes.md   # during /speckit-implement
```

### Source Code (repository root)

```text
packages/shared/src/
├── analytics/index.ts                 # NEW subpath @gobbit/shared/analytics: names, channels, screens, sanitizePayload, PUBLIC_PATTERNS
├── analytics/index.test.ts            # NEW
├── schemas/config.ts                  # + analytics: { siteId, host } | null
└── package.json exports               # + ./analytics

apps/api/src/
├── routes/config.ts (+ config.test.ts)   # + analytics from analyticsHead(env)
├── public/analytics.ts (+ test)       # AnalyticsHead.page; analyticsTags() renders page.js + tracker; surfaces in analytics.config
├── public/layout.ts                   # unchanged contract (renders analyticsTags)
├── public/pages.ts / routes/public-pages.ts  # public deck/category/item/search heads set analytics.page when configured
├── share/share-page.ts, share.service.ts (+ tests)  # optional analytics tags for /s/:item
└── public/landing-copy.ts             # privacy line (FR-013)
apps/api/test/landing-analytics.int.test.ts → + public pages carry pattern-only tags when configured; errors/sitemap never

apps/web/
├── public/analytics/page.js (+ src/analytics/page-script.test.ts)  # NEW first-party before-send for public pages
├── src/analytics/catalogue.ts (+ test)   # NEW Record<RouteId, Screen | null>
├── src/analytics/analytics.ts (+ test)   # NEW facade: start(), pageView, trackContent, identity tracking; no-op until loaded
├── src/analytics/tracker.ts (+ test)     # NEW lazy chunk: installs hook, appends tag
├── src/main.tsx                          # startAnalytics({ router, queryClient })
├── src/api/create-item.ts, update-item.ts, item-lifecycle.ts, review.ts, ingest.ts   # trackContent on success
├── src/import/use-import-notes.ts, src/ui/ShareButton.tsx                            # trackContent on success
├── src/settings/SettingsScreen.tsx       # privacy note
└── scripts/initial-chunks.test.ts / budget  # tracker chunk not initial

e2e/tests/smoke/<deck journey>.spec.ts    # + no /stats/ request when off
e2e/tests/full/app-analytics.spec.ts      # NEW stubbed tracker payload check
docs/design/web-pwa.md (analytics section), docs/design/public.md, docs/adr.md (ADR-065), docs/architecture.md (one line + ADR row), CHANGELOG.md (no env change; note behaviour), PLAN.md, infra/README.md (Umami: nothing new)
```

**Structure Decision**: the privacy rules live in one shared pure module so both the SPA hook and the tests use the same code; the browser-only parts (loader, facade) live in `apps/web/src/analytics/`, with only the facade in the initial chunk. Public pages keep the 031 opt-in per head.

## Invariant → test traceability

| Invariant / rule | Enforced in | Test (file, tier) |
|------------------|-------------|-------------------|
| FR-001 app, `/p`, `/s` page views when configured | facade + router; `analyticsTags` on public heads | `analytics.test.ts` (web, unit: one view per pathname); `landing-analytics.int.test.ts` (int: public deck/category/item/search tags); `share-page.test.ts` (unit) |
| FR-002 sign-in, `/auth/error`, errors, emails untracked | catalogue `null`; loader waits for `me`; heads opt-in | `catalogue.test.ts` (unit); int test (404/sitemap/robots no tag); `analytics.test.ts` (no load without member) |
| FR-003/004 pattern, screen name, origin referrer | catalogue + `sanitizePayload` | `shared/analytics/index.test.ts` (unit: Smith family/allergy example, every catalogue entry has no `$`/real id); `page-script.test.ts` (unit); full e2e |
| FR-005 user id only, changes with member, none anonymous | `sanitizePayload(id)`, facade identity reset | `analytics.test.ts` (unit: A → sign-out → B identifies B, clears session); page script never sets id (unit) |
| FR-006 four events after success, ids only | `trackContent` in success paths; props allow-list | hook tests per mutation (unit: success → event, error → none); sanitiser drops unknown props (unit) |
| FR-007 no PII | allow-list + UUID/enum validation | sanitiser unit tests; full e2e sentinel scan (SC-003) |
| FR-008 no cookies, DNT, same origin, CSP unchanged | tag attributes; relative URLs | `tracker.test.ts`, `analytics.test.ts` (API, unit); `caddy-routes.test.ts` unchanged CSP (unit) |
| FR-009 never blocks, offline nothing sent/queued | facade no-op + try/catch; sanitiser offline → null | facade unit tests (throwing tracker, offline, before load) |
| FR-010 off/blocked → identical | `/config.analytics = null` → no load | `config.test.ts` (unit); smoke assertion (e2e:smoke) |
| FR-011 budget, after interactive | dynamic import on idle | `pnpm budget` + `initial-chunks.test.ts` (unit) |
| FR-012 surfaces announced | `recordAnalyticsConfig` | `analytics.test.ts` (API, unit: `surfaces`) |
| FR-013 privacy notice | landing copy + Settings | `landing.test.ts`, `SettingsScreen.test.tsx` (unit) |

## Accountability

Constitution VIII, ADR-060. Analytics makes no decision about a member; it is a measurement whose records are cross-checked.

| Decision | Event / record | Outcomes · reasons | Fields (ids/hashes only) | Level | Watched | Alert threshold (default) | Test |
|----------|----------------|--------------------|--------------------------|-------|---------|---------------------------|------|
| Analytics on/off and coverage | `analytics.config` (API start) | `enabled`, `disabled` | `host?`, `surfaces`, `bootId` | info | per instance | `disabled` in production | unit |
| Payload cancelled by the sanitiser (offline, identify without member, unknown event) | none: browser-side, nothing about the member is decided and nothing leaves the device | — | — | — | — | — | unit |
| Content events delivering | Umami `card-created` (editor+review) vs `item_events` member creations | — | — | — | aggregate per week | analytics > log, or < 50% of log two weeks running | quickstart §4 |
| App page views delivering | Umami app views vs `session` creations | — | — | — | aggregate per day | 0 views for 24 h while enabled and sessions > 0 | quickstart §4 |
| Collect endpoint health | Caddy access log `/stats/api/send` | status | — | — | rate | 5xx > 5% over 1 h (031) | — |

**Operator controls**: `ANALYTICS_SITE_ID` (unset → off everywhere at the next deploy); `localStorage['umami.disabled']` per browser; the `/stats/*` Caddy proxy (031).

## Rollout

- **Migrations**: none.
- **Env / config**: none new (`ANALYTICS_SITE_ID` from 031 now also turns on app/public tracking). `CHANGELOG.md` gets an **Action required** entry: privacy notice ships with it; operators running 031 get app tracking on deploy.
- **API client**: `pnpm api:openapi` (new `analytics` field on `/config`).
- **Deploy order**: normal CI → Dokploy. The SPA reads `/config` (cached 5 min), so tracking starts within minutes of the deploy.
- **Rollback**: unset `ANALYTICS_SITE_ID`.

## Risks

| Risk | Likelihood / impact | Mitigation |
|------|---------------------|------------|
| A path, slug or text leaks through a tracker-built payload | L / H | Before-send hook on every request; typed catalogue; sentinel e2e scan |
| Previous member's session carried after sign-out | M / M | `identify` on every change clears the session token (D247); unit test |
| Share preview views lost to the immediate redirect | H / L | Documented best effort (D249); `/p` and app views are counted |
| Umami tracker contract changes on upgrade | L / M | Image pinned; facade wraps every call; quickstart re-run on upgrade |
| Bundle budget creep | L / M | Facade only in the main chunk; `pnpm budget` in CI |
| Forged collect requests claim member ids | M / L | Numbers indicative only; never used for decisions (spec edge case) |

## Settle before starting

- [x] Owner decisions in spec clarifications (surfaces, user ids, events)
- [x] Umami tracker supports `data-before-send` and `identify` (v3 source checked)

## Complexity Tracking

| Violation | Why needed | Simpler alternative rejected because |
|-----------|------------|--------------------------------------|
| Script on public pages beyond the landing (D177) | FR-001 public pages are measured | Inline script needs a CSP change; one first-party file keeps `script-src 'self'` |
| A plain JS file outside the TS sources (`public/analytics/page.js`) | Public pages are API-rendered and load no app bundle | A second Vite entry with a fixed name adds build config for ~20 lines; the file is unit-tested in jsdom |
