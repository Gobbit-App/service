# Implementation notes: 033-app-analytics

Plan: `specs/033-app-analytics/plan.md`, tasks: `tasks.md`. Branch `feat/033-app-analytics`. The shared sanitiser (`@gobbit/shared/analytics`), `/config.analytics`, the SPA facade and lazy tracker, content events from mutation success paths, public-page and share-preview tags with the first-party `/analytics/page.js`, the privacy notes and the docs. E2E tier: smoke + full — smoke keeps the critical "off means no request" rule on every PR; the payload scan needs a stubbed tracker and a created card, so it runs nightly.

## Decisions not specified by the plan

- **Hook name** `__gobbitAnalyticsBeforeSend` is shared by the SPA tracker and `page.js` (one name for `data-before-send` everywhere).
- **`deckIdFromCache(queryClient, slug)`** fills `deckId` for hooks that only know the slug (bulk publish, notes import); items carry `deckId` and `type` themselves.
- **Share target** sends `deckId` only when a deck was chosen (`draft.deckId || undefined`).
- **Events only after the server accepted**: `onSuccess` of each mutation; lifecycle events are sent after `sendLifecycle` resolves, so a rollback sends nothing. Editing a proposal sends nothing (it isn't published content yet).

## Deviations from the plan

- `useReviewAction` gained an optional `onSent` callback so publish can send its event with the server's answer (create vs update).
- `ShareButton` takes optional `deckId` and `type` (passed by `CardBar`) to fill the `card-shared` event.
- `analytics.config` carries `surfaces` as a comma-joined string (`landing,app,public,share`), not an array.
- `/analytics/page.js` is unit-tested by importing its source with Vite's `?raw` (jsdom refuses `file:` URLs) and running it with a stubbed `document.currentScript`.
- The web image precaches `/analytics/page.js` with the rest of `public/` (harmless).
- The `@smoke` check runs only when `/config` says analytics is off (PR CI); post-deploy with analytics on it is skipped and the payload check lives in `@full`.
- The integration test checks the share-preview tag on an unknown card id: a public card's `/s/` redirects to `/p/` (D181).
- No change to `initial-chunks.test.ts`: `pnpm budget` shows the tracker as its own non-initial chunk (initial 120 KB gzip of 150).
- E2E specs were not run locally (no smoke session on this machine); CI runs `@smoke` on the PR and `@full` nightly.
- T028 (quickstart §4 on the deployed instance, demo 7) waits for the deploy.
