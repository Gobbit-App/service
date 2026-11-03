# Tasks: Analytics consent

**Input**: Design documents from `/specs/035-analytics-consent/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/consent.md, quickstart.md; `033-app-analytics` merged

**Tests**: included — every rule has a unit test; the audit row and the page tags have integration tests; the landing head is `[e2e:smoke]`, the consent journeys with a stubbed tracker are `[e2e:full]` (plan, E2E tier).

## Format: `[ID] [P?] [Story] [Tier?] Description`

- **[P]**: can run in parallel (different files, no dependency)
- **[Story]**: US1 DNT members counted, US2 member choice, US3 visitor choice, US4 people know what is measured
- **[Tier]**: `[e2e:smoke]` / `[e2e:full]` when the task adds or changes an e2e test

## Phase 1: Setup

- [x] T001 Plan settled (2026-11-02): D259–D266, ADR-068; migration `0020_analytics_consent`; no env changes

## Phase 2: Foundational (data, rule, copy)

- [x] T002 [P] Enums `analytics_consent` (`allowed`, `declined`) and `analytics_consent_source` (`prompt`, `settings`) in `packages/db/src/schema/common.ts`; users columns `analytics_consent` (null = not answered), `analytics_consent_at` (`timestamptz(3)`, null), `analytics_consent_source` (null) with CHECK `users_analytics_consent_complete` ("the three columns are all null or all set") in `packages/db/src/schema/users.ts`
- [x] T003 [P] Audit table `analytics_consent_events` (`id` uuid PK, `user_id` FK users on delete cascade, `from_value` null = not answered, `to_value` not null, CHECK `from_value is distinct from to_value`, `source` not null, `request_id` text not null, `created_at` default now(); indexes `(user_id, created_at)`, `(created_at)`) in `packages/db/src/schema/analytics-consent-events.ts` + schema index export
- [x] T004 Migration `packages/db/migrations/0020_analytics_consent.sql` (`pnpm db:generate`) + hand-written `packages/db/migrations/down/0020_analytics_consent.sql`; round trip migrate → rollback → migrate
- [x] T005 [P] Unit tests `packages/shared/src/analytics/consent.test.ts`: the D261 table (6 rows), `parseDeviceConsent` (valid, missing, unparsable, other value → unanswered)
- [x] T006 `packages/shared/src/analytics/consent.ts`: `ANALYTICS_CONSENT_VALUES`, `DEVICE_CONSENT_KEY = 'gobbit.analytics.consent'`, `analyticsAllowed(member, device)`, `parseDeviceConsent(raw)`; export from `analytics/index.ts`
- [x] T007 [P] `packages/shared/src/schemas/analytics-consent.ts` (`analyticsConsentSchema`, strict `setAnalyticsConsentSchema`) and `meSchema.analyticsConsent` in `packages/shared/src/schemas/auth.ts` (+ fixtures in `auth.test.ts`)

**Checkpoint**: the account can hold a choice and one rule decides whether anything is sent.

## Phase 3: US1 — Do Not Track no longer switches analytics off (P1)

- [x] T008 [P] [US1] `apps/web/src/analytics/tracker.ts` drops `doNotTrack`; `tracker.test.ts` asserts no `data-do-not-track`
- [x] T009 [P] [US1] `sanitizePayload` cancels when `context.consented === false` in `packages/shared/src/analytics/sanitize.ts` (+ `sanitize.test.ts`)
- [x] T010 [US1] `analytics.config` gains `consent: 'opt_out'` when enabled in `apps/api/src/public/analytics.ts` (+ `analytics.test.ts`)

## Phase 4: US2 — a member makes a clear, lasting choice (P1)

- [x] T011 [US2] `users.repo`: consent columns in the `/me` read; `setAnalyticsConsent(userId, {value, source, requestId})` locks the row (`FOR UPDATE`), no-op on same value, else updates the three columns and inserts the audit row in the same transaction, in `apps/api/src/repositories/users.repo.ts`
- [x] T012 [P] [US2] Unit tests `apps/api/src/services/analytics-consent.service.test.ts`: changed / unchanged events, returns DTO
- [x] T013 [US2] `apps/api/src/services/analytics-consent.service.ts` (+ `.events.ts` `analytics.consent`), wired in `services/index.ts`
- [x] T014 [US2] `GET /me` returns `analyticsConsent`; `PUT /me/analytics-consent` (session/bearer; 200/400/401) in `apps/api/src/routes/me.ts`; `pnpm api:openapi`
- [x] T015 [US2] Integration test `apps/api/test/analytics-consent.int.test.ts`: new user unanswered; PUT writes audit row with from/to/source/request id; same value → no row; CHECK rejects partial; only own user; counts query from `infra/README.md`
- [x] T016 [P] [US2] `apps/web/src/analytics/device-consent.ts` (+ test): reads `localStorage` via the shared parser, storage errors → unanswered
- [x] T017 [US2] Facade gating in `apps/web/src/analytics/analytics.ts`: no load until `me` known and `analyticsAllowed` holds; hook context `consented`; reacts to `me` changes (allowed → load + current view) without reload (+ `analytics.test.ts`)
- [x] T018 [P] [US2] `apps/web/src/analytics/prompt-routes.ts` (+ test): untracked, editor, new card and Browse never show the prompt
- [x] T019 [US2] `apps/web/src/api/analytics-consent.ts` mutation (PUT, writes `me` cache) (+ test)
- [x] T020 [US2] `apps/web/src/analytics/ConsentPrompt.tsx` (+ test): in-flow labelled region, Allow / No thanks / close (this app start only), failed save message, nothing when unconfigured or answered; rendered in `apps/web/src/routes/__root.tsx`
- [x] T021 [US2] `apps/web/src/settings/PrivacySection.tsx` (+ test): switch with date, "Not answered yet (on)", offline disabled, unconfigured text; used by `SettingsScreen.tsx`

## Phase 5: US3 — an anonymous visitor can say no (P2)

- [x] T022 [P] [US3] `apps/api/src/public/consent-banner.ts` (+ test): hidden banner and "Analytics" button markup per contract §4
- [x] T023 [US3] `analyticsTag` renders only `/analytics/page.js` with `data-website-id`, `data-domains` (+ pattern/screen); banner after the site header in `layout.ts`; button in the landing privacy note (`landing.ts`) and the `/p` footer (`pages.ts`); share preview head (`share/share-page.ts`)
- [x] T024 [US3] `apps/web/public/analytics/page.js`: device choice, hook (null when declined), tracker injection unless declined, banner/button wiring, stores choice; `apps/web/src/analytics/page-script.test.ts` (no cookie, choice never in payload)
- [x] T025 [US3] `apps/api/test/landing-analytics.int.test.ts`: page.js head, banner and button present when configured, none unconfigured; no `data-do-not-track`

## Phase 6: US4 — people know what is measured (P2)

- [x] T026 [US4] Rewrite copy in `packages/shared/src/analytics/privacy.ts` (landing note, prompt, banner, settings, unconfigured) with `privacy.test.ts` (no Do Not Track as an off switch); landing copy uses it

## Phase 7: Polish

- [x] T027 [e2e:smoke] `e2e/tests/smoke/landing.spec.ts`: new head; banner does not block joining
- [x] T028 [e2e:full] `e2e/tests/full/analytics-consent.spec.ts`: DNT on still sends; decline in prompt → nothing, second context no prompt and nothing; settings re-enable → view; visitor decline on landing → `/p` sends nothing, no cookie
- [x] T029 Docs: ADR-068 in `docs/adr.md`, `docs/architecture.md` line + index row, `docs/design/web-pwa.md`, `public.md`, `waitlist.md`, `infra/README.md` (counts query, alert), `CHANGELOG.md`, `PLAN.md`, `specs/README.md`, `CLAUDE.md` analytics line
- [x] T030 `pnpm lint && pnpm typecheck && pnpm test:unit && pnpm test:int && pnpm build:web && pnpm budget`; `implementation-notes.md`

## Dependencies

Phase 2 blocks all. US1 (T008–T010) is independent of US2. US2's web tasks need T006/T007; T017 needs T016. US3 needs T006 (mirrored in page.js) and T026 copy. Polish last.

## Parallel examples

- Phase 2: T002, T003, T005, T007 together.
- US2: T012, T016, T018 together; then T013 → T014 → T015.
- US3: T022 with T024.

## Implementation strategy

MVP = Phase 2 + US1 + US2 (DNT gone, member choice works). US3/US4 complete the anonymous side and copy in the same PR (one stream).

## Phase 8: Convergence

- [x] T031 [e2e:full] Check a member's "No thanks" from a second browser context sharing the stored answer (no tracker request, nothing sent) in `e2e/tests/full/analytics-consent.spec.ts` per SC-002 (partial)
- [x] T032 [e2e:full] Check that a member with `navigator.doNotTrack = '1'` who hasn't answered still has the deck view recorded in `e2e/tests/full/analytics-consent.spec.ts` per SC-001 (partial)
- [x] T033 [e2e:full] Assert the visitor banner flow sets zero cookies in `e2e/tests/full/analytics-consent.spec.ts` per SC-006 (partial)
