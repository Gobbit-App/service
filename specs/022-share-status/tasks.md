---

description: "Task list for 022-share-status"
---

# Tasks: Share status and auto-publish for publishers

**Input**: Design documents from `/specs/022-share-status/`

**Prerequisites**: plan.md, spec.md, research.md (D192–D199), data-model.md, contracts/shares-api.md; constitution 1.2.0 (IV amended)

**Tests**: REQUIRED (constitution V). Every row of the plan's traceability table maps to a test task below.

**Organization**: Tasks are grouped by user story.

## Format: `[ID] [P?] [Story] [Tier?] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: US1 your shares, US2 review entry, US3 auto-publish, US4 failure logging
- **[Tier]**: `[unit]` `*.test.ts(x)` next to code, `[int]` `apps/api/test/*.int.test.ts` (Docker), `[e2e:smoke]` `e2e/tests/smoke/`, `[e2e:full]` `e2e/tests/full/` (tier rule: constitution V, ADR-053)

---

## Phase 1: Foundational (Blocking Prerequisites)

- [X] T001 [P] Constants in packages/shared/src/ingest/constants.ts (exported from `@pb/shared/ingest`):
  - `ingestFailureCodes = ['content_expired','sharer_left','fetch_failed','unreadable_answer','assistant_unavailable','image_unavailable','unknown']`
  - `autoPublishOutcomes = ['published','held_not_publisher','held_needs_category','held_duplicate','held_duplicate_check_failed','held_publish_failed']`
  - `shareChannels = ['pwa','shortcut','paste','email']`
  - `SHARES_LIST_LIMIT = 50`, `SHARE_MAX_RETRIES = 3`, `SHARE_POLL_MS = 3000`
  - `RETRYABLE_FAILURES` = every code except `sharer_left` and `content_expired`
  - Types `IngestFailureCode`, `AutoPublishOutcome`, `ShareChannel`
- [X] T002 Drizzle schema:
  - packages/db/src/schema/decks.ts: `autoPublishShares` boolean `NOT NULL DEFAULT false`.
  - packages/db/src/schema/ingest-jobs.ts:
    - `failureCode` text null, CHECK `failure_code IS NULL OR failure_code IN (…)`, CHECK `failure_code IS NULL OR status = 'failed'`;
    - `autoPublish` text null, CHECK in `autoPublishOutcomes`;
    - `retryCount` smallint `NOT NULL DEFAULT 0`, CHECK `retry_count BETWEEN 0 AND 3`;
    - `retriedAt` `timestamp({ withTimezone: true, precision: 3, mode: 'date' })` null;
    - index `(user_id, deck_id, created_at DESC)`.
- [X] T003 Migration packages/db/migrations/0017_share_status.sql (`pnpm db:generate`, then hand-add the backfills):
  - `UPDATE decks SET auto_publish_shares = true WHERE is_default`.
  - `failure_code` on `status = 'failed'` rows:
    - `raw_missing` → `content_expired`;
    - `sharer_gone` / `sharer_not_member` → `sharer_left`;
    - `invalid_output%` → `unreadable_answer`;
    - else `unknown`.
  - Down file packages/db/migrations/down/0017_share_status.down.sql.
- [X] T004 [P] [unit] packages/db/src/schema/enums.test.ts: the CHECK lists in the 0017 SQL equal `ingestFailureCodes` / `autoPublishOutcomes`
- [X] T005 [P] packages/shared/src/schemas/share.ts: `shareSummarySchema` and `shareListSchema` (`{ shares }`), per data-model.md. `state` ∈ `processing | failed | in_review | published | not_added`; `preview` `{ title: string | null, host: string | null, photoCount: number }`; `item` `{ id, title, deleted } | null`; `reviewedBy` `{ displayName } | null`. Add `autoPublishShares` to `deckSchema` and `deckPatchSchema` in packages/shared/src/schemas/deck.ts (+ deck.test.ts row). [unit] share.test.ts: the schema rejects any extra `error`/`raw` key (strict).
- [X] T006 [P] [unit] apps/api/src/ingest/failure-code.ts `classifyFailure(input: string | Error): IngestFailureCode`:
  - `raw_missing` → `content_expired`;
  - `sharer_*` → `sharer_left`;
  - `invalid_output*` / no tool call → `unreadable_answer`;
  - safe-fetch / normalize errors → `fetch_failed`;
  - image read errors → `image_unavailable`;
  - provider/HTTP/timeout errors (`ExtractResponseError`, abort) → `assistant_unavailable`;
  - else `unknown`.
  - Tests in failure-code.test.ts.
- [X] T007 apps/api/src/repositories/ingest-jobs.repo.ts:
  - `setStatus` accepts `failureCode`;
  - `listForSharer({ userId, deckId, since, channels, limit })` newest first;
  - `resetForRetry(id, now)`: conditional `WHERE status='failed' AND raw IS NOT NULL AND retry_count < 3`; sets queued, attempts 0, clears error/failure_code/finished_at/auto_publish, `retry_count+1`, `retried_at=now`; returns the row or null;
  - `countByUserSince` counts `created_at >= since OR retried_at >= since`.

**Checkpoint**: `pnpm db:migrate && pnpm db:rollback && pnpm db:migrate` clean; typecheck green

---

## Phase 2: User Story 1 — Find out what happened to a share (Priority: P1) 🎯 MVP

**Goal**: The sharer sees each recent share's live status, a plain reason when it failed, and can try again.

**Independent Test**: fail a share in the worker → Your shares and the Sent screen show "Couldn't add this" with the reason and Try again; retry → processing → in review.

### Tests for User Story 1

- [ ] T010 [P] [US1] [int] apps/api/test/shares.int.test.ts:
  - **List**: own shares only, newest first; 30-day window; `mcp`/`import` excluded; ≤ 50.
  - **Access**: another member's share → 404 (publisher included); non-member → 404; `ing_` token → 401/403.
  - **State mapping**: queued/running/proposed/published/discarded/failed, plus a soft-deleted result item → `item.deleted`.
  - **Payload**: no `error`/`raw` in the payload; `preview` without the shared text.
  - **Retry**: 202 → queued and re-enqueued; second tap 409 `/problems/share-not-failed`; raw pruned → 410 `/problems/share-expired`; `retry_count` 3 → 422 `/problems/share-retry-limit`; cap reached → 429; reader/removed member → 403/404.
- [X] T011 [P] [US1] [unit] apps/api/src/services/shares.service.test.ts: `toShareSummary` (state, preview from item title / `raw.title` / URL host / photo count, `canRetry` rules incl. `sharer_left` and missing raw, `reviewedBy` name)
- [ ] T012 [P] [US1] [unit] apps/web/src/shares/share-state.test.ts and failure-copy.test.ts:
  - every `IngestFailureCode` and `AutoPublishOutcome` has copy;
  - unknown code → "Something went wrong";
  - email channel → "forward it again" instead of "Paste it again".
- [ ] T013 [P] [US1] [unit] apps/web/src/shares/SharesScreen.test.tsx and ShareRow.test.tsx:
  - empty state; rows per state with links (published → card, in review → review/card);
  - Try again calls retry and shows processing; 410 → Paste it again;
  - offline disables actions;
  - polling only while a row is processing;
  - not-added row shows who decided and when; a deleted card shows "Card deleted";
  - `config.ingest` off → "Sharing is off for this deck" (edge case: no AI provider).
- [ ] T014 [P] [US1] [unit] apps/web/src/share/ShareSent.test.tsx: live status from `GET /shares/{id}` (processing → published / in review / failed with reason); "Your shares" link; no "it'll appear in Review" promise
- [ ] T015 [P] [US1] [e2e:smoke] e2e/tests/smoke/share.spec.ts: after the stubbed `POST /ingest`, the Sent screen links to Your shares (stub `GET /shares/{id}` at the page edge); the link opens `/d/<slug>/shares` (real, empty list)
- [ ] T016 [P] [US1] [e2e:full] e2e/tests/full/shares.spec.ts: with stubbed list/get/retry responses, check processing → failed → Try again → processing, the in-review and published rows with links, and expired → Paste it again

### Implementation for User Story 1

- [X] T017 [US1] Worker: apps/api/src/jobs/ingest.ts `fail(jobId, error, code)` stores `failureCode` (from `classifyFailure`, or the explicit code for raw/sharer cases)
- [X] T018 [US1] apps/api/src/services/shares.service.ts:
  - `list(user, deckRef)`;
  - `get(user, id)`;
  - `retry(user, id)`: sharer + member + `item.create`; status/raw/limit checks with the problems in the contract; `assertWithinCaps` for the job's channel; `resetForRetry`, then `queue.enqueue(id)`.
  - Item lookup is batched.
  - Wire it in apps/api/src/services/index.ts.
- [ ] T019 [US1] apps/api/src/routes/my-shares.ts: `GET /decks/{id}/shares`, `GET /shares/{id}`, `POST /shares/{id}/retry`; register; `pnpm api:openapi`; examples in api.http
- [ ] T020 [US1] apps/web/src/shares/shares-queries.ts:
  - list query `['shares', deckId]` with `refetchInterval: (q) => anyProcessing(q) ? SHARE_POLL_MS : false`;
  - share query by id;
  - retry mutation that invalidates the list.
  - Persisted like other deck queries.
- [ ] T021 [US1] apps/web/src/shares/{share-state,failure-copy}.ts, SharesScreen.tsx, ShareRow.tsx, SharesLink.tsx; lazy route apps/web/src/routes/d.$slug.shares.tsx; `SharesLink` in the deck header (apps/web/src/routes/d.$slug.tsx) for roles with `item.create`
- [ ] T022 [US1] apps/web/src/share/ShareScreen.tsx keeps the job `id` from the submit response; ShareSent.tsx shows the live status and the Your shares link

**Checkpoint**: The production incident is visible to the sharer end to end

---

## Phase 3: User Story 2 — Always reach the review queue (Priority: P1)

**Goal**: Publishers always see the review entry; the empty queue points to Your shares.

**Independent Test**: publisher with an empty queue sees "Review", opens it and follows the link to Your shares; an editor sees no review entry.

### Tests for User Story 2

- [ ] T030 [P] [US2] [unit] apps/web/src/review/ReviewPill.test.tsx (shown at count 0 without a number; count when > 0) and ReviewQueue.test.tsx (empty state links to Your shares)
- [ ] T031 [P] [US2] [e2e:smoke] e2e/tests/smoke/review.spec.ts: owner on a fresh smoke deck sees "Review" → empty queue → "Your shares" → empty list; an editor sees "Your shares" but no "Review"

### Implementation for User Story 2

- [ ] T032 [US2] apps/web/src/review/ReviewPill.tsx always renders for publishers; apps/web/src/review/ReviewQueue.tsx empty state with the link

**Checkpoint**: US1 + US2 = the MVP that fixes the "can't find it anywhere" incident

---

## Phase 4: User Story 3 — Publish my own shares directly (Priority: P2)

**Goal**: An opted-in deck publishes a publisher's share directly when it passes the reviewer's checks; otherwise it stays in review with the reason.

**Independent Test**: owner turns the setting on, shares a link with a matching category → published; same link again → in review "possible duplicate"; an editor's share → in review.

### Tests for User Story 3

- [ ] T040 [P] [US3] [unit] apps/api/src/ingest/auto-publish.test.ts. Gate order and outcomes:
  - setting off → null; `mcp`/`import` → null;
  - not a publisher → `held_not_publisher`;
  - empty `categoryIds` or only `newCategory` → `held_needs_category`;
  - `possible_duplicate`/`update` → `held_duplicate`;
  - no verdict → `held_duplicate_check_failed`;
  - publish throws → `held_publish_failed` (job stays proposed; warning logged);
  - success → `published`.
- [ ] T041 [P] [US3] [int] apps/api/test/ingest-pipeline.int.test.ts, with the fake extraction:
  - an owner's share on an opted-in deck is published with a `published` event (actor = sharer, via `ingest`), the job is `published` with `reviewedBy` = sharer, and `auto_publish = 'published'`;
  - a duplicate is held;
  - an editor's share is held `held_not_publisher`;
  - a role lowered between share and processing is held;
  - with the setting off, the job is proposed and `auto_publish` is null.
- [ ] T042 [P] [US3] [int] apps/api/test/decks.int.test.ts:
  - an owner/co-owner toggles `autoPublishShares`; a maintainer → 403 `/problems/owner-required`;
  - allowed on the personal deck;
  - apps/api/test/personal-deck.int.test.ts: a new personal deck has it `true`.
- [ ] T043 [P] [US3] [int] apps/api/test/review.int.test.ts stays green unchanged after the `publishProposal` extraction (run before and after)
- [ ] T044 [P] [US3] [unit] apps/web/src/deck-admin/DeckSection.test.tsx: owner toggles the switch (PATCH sent); maintainer sees it disabled with "Only owners can change this"
- [ ] T045 [P] [US3] [unit] ShareRow.test.tsx rows: auto-published → "Published"; held → "Waiting for review — <reason>"
- [ ] T046 [P] [US3] [e2e:full] e2e/tests/full/deck-admin.spec.ts: owner toggles "Publish shares from publishers directly" and it persists after reload; maintainer sees it disabled

### Implementation for User Story 3

- [ ] T047 [US3] apps/api/src/review/publish-proposal.ts: extract the `new`-mode publish from apps/api/src/services/review.service.ts:
  - D160 `imageReference` check;
  - transaction: item `published` + `verifiedAt`, event, job `published` + `reviewedBy`/`reviewedAt`;
  - returns the item; after-commit hooks are left to callers.
  - review.service.ts uses it (publish + publishMany).
- [ ] T048 [US3] apps/api/src/services/decks.service.ts: `autoPublishShares` patch rule (owner-only via `ownerRequired(detail)`; allowed on the personal deck); apps/api/src/errors/http-errors.ts `ownerRequired(detail?)`; apps/api/src/repositories/decks.repo.ts creates personal decks with `autoPublishShares: true`; Deck DTO mapping
- [ ] T049 [US3] apps/api/src/ingest/auto-publish.ts: `autoPublish(deps, { job, proposal, summary, verdict })` per D193. It writes `ingest_jobs.auto_publish` and, after a publish, calls `embedQueue.enqueueIfStale` and `linkSnapshotQueue.enqueueIfNeeded`. Call it from apps/api/src/jobs/ingest.ts after `proposeItem` (`proposeItem` returns the item and verdict). Wire the deps in apps/api/src/worker.ts: `decksRepo.byId`, `roleOf`, `publishProposal`.
- [ ] T052 [US3] Held reason in review (FR-011, US3-AS2): `job.autoPublish` (`AutoPublishOutcome | null`) in `reviewEntrySchema` (packages/shared/src/schemas/ingest.ts), mapped in apps/api/src/services/review.service.ts list; apps/web/src/review/ReviewCard.tsx shows "Not published directly: <reason>" for `held_*`. [unit] ReviewCard.test.tsx row; [int] review.int.test.ts asserts the field
- [ ] T050 [US3] apps/web/src/deck-admin/DeckSection.tsx: switch "Publish shares from publishers directly", with help text that cards with no category or a likely duplicate still go to review
- [ ] T051 [US3] `pnpm api:openapi` (Deck field)

**Checkpoint**: Owner's personal-deck shares land directly; shared decks unchanged unless opted in

---

## Phase 5: User Story 4 — Operators can see why shares fail (Priority: P2)

**Goal**: One content-free error line per final failure.

**Independent Test**: fail a job on its last attempt → exactly one `ingest job failed` line with `jobId`, `deckId`, `channel`, `attempts`, `failureCode` and no URL/text.

### Tests for User Story 4

- [ ] T060 [P] [US4] [int] apps/api/test/ingest-pipeline.int.test.ts, the **incident regression**. The fake extraction throws a provider error on every attempt. Then:
  - after the last attempt the job is `failed` with `failure_code = 'assistant_unavailable'`;
  - `GET /decks/{id}/shares` lists it as failed with `canRetry`;
  - the captured logs hold exactly one error line with the five fields and none of the shared URL/text;
  - the retry lines carry no message text.
- [X] T061 [P] [US4] [unit] apps/api/src/jobs/ingest.test.ts (or the existing handler test): `fail()` logs once at error level; a retry warning has `failureCode` and no message

### Implementation for User Story 4

- [X] T062 [US4] apps/api/src/jobs/ingest.ts:
  - replace the `log(string)` dep with a structured logger (`childLogger('ingest')`, injectable for tests);
  - `fail()` logs `error` "ingest job failed" with `{ jobId, deckId, channel, attempts, failureCode }`;
  - the retry path logs `warn` "ingest attempt failed, will retry" with `{ jobId, attempts, failureCode }`;
  - auto-publish failure logs `warn` with `{ jobId, deckId }`.

**Checkpoint**: All four stories work independently

---

## Phase 6: Close-out

- [ ] T070 `pnpm lint && pnpm format:check && pnpm typecheck && pnpm test:unit && pnpm test:int && pnpm build:web && pnpm budget`; `pnpm api:openapi && git diff --exit-code packages/api-client`
- [ ] T071 [P] docs/adr.md ADR-058 (opt-in auto-publish of publishers' shares; constitution IV 1.2.0); docs/architecture.md: one map line + ADR-058 index row (stay < 250 lines)
- [ ] T072 [P] docs/design/ingestion.md: "Share status" (failure codes, shares API, retry), "Auto-publish" (gate, outcomes), and Deviations (public page cache delay, D180)
- [ ] T073 [P] README.md: Your shares, the deck setting, the worker failure log line
- [ ] T074 [P] PLAN.md: link specs/022-share-status
- [ ] T075 Copy implementation-notes.md deviations into docs/design/ingestion.md Deviations
- [ ] T076 Run quickstart.md validation (sections 1–3 locally; section 4 after deploy)
- [ ] T077 `/speckit-converge` until it reports Converged

---

## Dependencies & Execution Order

- **Foundational (Phase 1)**: blocks all stories.
- **US1** (Phase 2): needs T001–T007.
- **US2** (Phase 3): independent of US1 except the link target. The route stub from T021 is needed for the smoke test, so do it after T021.
- **US3** (Phase 4): needs Phase 1. Independent of US1/US2 in the API; T045 needs T021.
- **US4** (Phase 5): needs T006/T017. Can run in parallel with US3 (both edit jobs/ingest.ts, so coordinate or sequence T049 and T062).
- **Close-out**: after all stories.

### Within Each User Story

- Tests written and FAILING before implementation.
- shared → db → repo → service → route → `api:openapi` → web.

### Parallel examples

- Phase 1: T001, T004, T005, T006 together; T002 → T003 → T007.
- US1: T010–T016 together, then T017 → T018 → T019 and, in parallel, T020 → T021 → T022.
- US3: T040–T046 together; T047 → T049, with T048 and T050 in parallel.

---

## Implementation Strategy

1. **MVP** = Phase 1 + US1 + US2. This fixes the incident (shares are visible, reasons are shown, the review entry is always there) and can ship alone.
2. Then US4 (small, operator value) and US3 (behaviour change, behind the per-deck setting, on for personal decks).
3. One PR for the feature (stories are small and share the migration). Split US3 into a follow-up PR if the diff grows past review size.

## Notes

- [P] tasks = different files, no dependencies.
- Fixtures are synthetic (`example.test`, generic households): specs and tests are public.
- Log decisions the plan did not make, and deviations, in implementation-notes.md as you go.
- Commit after each task or logical group (e.g. `feat(api): shares status API`).
