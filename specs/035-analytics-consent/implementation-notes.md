# Implementation notes: 035-analytics-consent

Plan: `specs/035-analytics-consent/plan.md`, tasks: `tasks.md`. Branch `035-analytics-consent`. Covered: consent columns and the audit table (migration `0020`), `GET /me` / `PUT /me/analytics-consent`, the shared `analyticsAllowed` rule, SPA gating, the member prompt, Settings → Privacy, the consent-aware `page.js` loader with the server-rendered banner, the copy and the docs (ADR-068). E2E tier: smoke + full. Smoke checks the new landing head on every PR. The prompt, banner and decline flows need analytics on and a stubbed tracker, so they run nightly.

## Decisions not specified by the plan

- **Banner markup** lives in `apps/api/src/public/consent-banner.ts` (`consentBanner`, `consentOpenButton`, `CONSENT_CSS`). The "current choice" copy rides as `data-allowed`/`data-declined` attributes, so `page.js` holds no copy.
- **Down file name** follows the repo convention: `down/0020_analytics_consent.down.sql`, not `down/0020_analytics_consent.sql` as written in T004.
- **`page.js` lint globals**: only `document, window` go in its `/* global */` comment. ESLint already knows `localStorage` and `navigator` and flags redeclaring them.

## Deviations from the plan

- **The e2e member flows stub `/me`**: `analytics-consent.spec.ts` patches GET `/me` and answers PUT `/me/analytics-consent` inside the page. The smoke owner is shared by every spec running in parallel, and a real "declined" would silence `app-analytics.spec.ts`. The real PUT, the audit row and "same value writes nothing" are covered by `analytics-consent.int.test.ts`.
- **T028 scope, what is not in e2e**:
  - "DNT on still sends" and "a second device sees no prompt" were first covered only in unit tests and by a reload. Convergence (T031–T032) added both to e2e. The DNT test overrides `navigator.doNotTrack`/`globalPrivacyControl` via `addInitScript`. The second device is a separate context signed in with the fixture's new `signIn()` and sharing the stubbed stored answer.
  - "Settings re-enable → view": covered by `analytics.test.ts` (an allowed answer loads the tracker and sends the current view, with no reload) and `PrivacySection.test.tsx`.
  - "Visitor decline on landing → `/p` sends nothing": checked by reloading `/welcome`. `/p` uses the same `page.js` and the same `localStorage` key, and `page-script.test.ts` covers the declined hook.
- **Two latent 033 e2e bugs fixed on the way**:
  - `app-analytics.spec.ts` lost its record on every `page.goto`. The stub now keeps `__analyticsSent` in `sessionStorage` and waits for the search view before navigating away.
  - `smoke/public.spec.ts` asserted no `<script` at all, which fails whenever analytics is on. It now allows only the `page.js` loader.
- **Stale 033 unit assertion**: `share.service.test.ts` expected Umami's `data-before-send` on the share preview. It now expects only the `page.js` loader and no `/stats/script.js`.
- **`consent-banner.test.ts`** was added at close-out. The banner was first covered only through the landing, pages and integration tests.
- **Cross-check query**: `infra/README.md` counts `item_events` creations by members who haven't declined. It joins on `actor_user_id`.

## Known issue left open (not this feature)

- `e2e/tests/full/landing.spec.ts` (030) fails in the `api-smoke` project. `browser.newContext()` inherits the project's `extraHTTPHeaders` (the smoke bearer token), so its "strangers" are signed in. `analytics-consent.spec.ts` avoids this with `newContext({ extraHTTPHeaders: {} })`. The 030 spec needs the same fix in its own PR.

## Verification

- Migration `0020`: migrate → rollback → migrate round trip on a throwaway pgvector container, then seed.
- With `ANALYTICS_SITE_ID` set (API + Vite on :5173):
  - `full/analytics-consent.spec.ts` 3/3, `full/app-analytics.spec.ts` and `smoke/landing.spec.ts` pass.
  - The whole `@smoke` set passes except checks that need the Caddy image (`/version.json`, POST `/share` under Vite).
- `pnpm lint`, `pnpm typecheck`, `pnpm test:unit` (3224), `pnpm test:int` (671), `pnpm build:web` and `pnpm budget` (initial 124.4 KB gzip) all pass.
- `page.js` is 1839 B gzip (SC-007 < 2 KB).
- Convergence (T031–T033: two-device decline, DNT on, no cookies): `full/analytics-consent.spec.ts` 5/5, `full/app-analytics.spec.ts`, `smoke/landing.spec.ts` and `smoke/public.spec.ts` pass with Vite on :5173 (2 Caddy-only checks skipped).
