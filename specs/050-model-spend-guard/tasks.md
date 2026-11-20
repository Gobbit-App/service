---

description: "Task list for the model spend guard — smart share only for people switched on"
---

# Tasks: Model spend guard — smart share only for people switched on

**Input**: Design documents from `/specs/050-model-spend-guard/` — [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/best-effort.md](./contracts/best-effort.md), [quickstart.md](./quickstart.md)

**Prerequisites**: plan.md, spec.md (both present). One migration (`0028_smart_share`), no new env var, no new route.

**Tests**: REQUIRED (constitution V). Every logic task has a test task at the tier named in plan.md's traceability table. **E2E tier: full** (plan) — one stubbed `@full` case, no smoke (the e2e stack has no extraction provider).

**Organization**: grouped by user story. One PR for the implementation. The model path in `jobs/ingest.ts` must stay byte-for-byte as today (FR-009): the existing `ingest.test.ts` and `ingest-pipeline.int.test.ts` pass unchanged apart from supplying the new required `smartShare` dependency as "on".

## Format: `[ID] [P?] [Story] [Tier?] Description`

- **[P]**: different files, no dependency on an incomplete task
- **[Tier]** on test tasks: `[unit]` `*.test.ts` next to code, `[int]` `*.int.test.ts` in `apps/api/test/` (Docker), `[e2e:full]` `e2e/tests/full/`
- **UI tasks** (`.tsx`/`.css`) name their sibling (plan "UI reference") and end with "screenshots: phone 412 px + desktop 1280 px, light + dark, compared with <sibling>"; without screenshots the task is blocked, not done
- Fixtures use made-up content only (the repository is public)

---

## Phase 1: Foundational (Blocking Prerequisites)

**Purpose**: the column, the shared shapes and the event catalogue every story uses

- [ ] T001 Add `smartShare: boolean().notNull().default(false)` (comment: D452, set only by an operator in SQL; platform admins count as on in code) to `users` in `packages/db/src/schema/users.ts`, generate `0028_smart_share` with `pnpm db:generate` (`ALTER TABLE "users" ADD COLUMN "smart_share" boolean DEFAULT false NOT NULL`), and hand-write `packages/db/migrations/down/0028_smart_share.down.sql` (`ALTER TABLE "users" DROP COLUMN IF EXISTS "smart_share";`, with a one-line header comment like `0027`'s)
- [ ] T002 [P] [int] Migration up and down on a database with existing users: every existing user reads `smart_share = false`, down removes the column, up again works — in the existing migration test (find it with `rg -l "down" packages/db/test apps/api/test`) or `apps/api/test/spend-guard-migration.int.test.ts` if none fits
- [ ] T003 In `packages/shared/src/ingest/constants.ts` widen `extractionFallbacks` to `['preview', 'no_smart_share']`; in `packages/shared/src/schemas/ingest.ts` add `bodyCut: z.boolean().optional()` to `extractionSummarySchema` (comment D456) and `extractionBodyCut: z.boolean()` to the `reviewEntrySchema` job object; in `packages/shared/src/schemas/share.ts` add required `savedAsSent: z.boolean()` to `shareSummarySchema` (strict stays strict; comment: true when the share was saved as sent because smart share is off for the sharer). Run `pnpm typecheck` and fix every construction site of these DTOs and their test fixtures (`rg "extractionFallback|ShareSummary" apps packages --glob '!schema.d.ts'`) with the values `null`/`false`
- [ ] T004 [P] [unit] Schema tests in `packages/shared/src/schemas/ingest.test.ts` (create if absent): `fallback: 'no_smart_share'` and `bodyCut` accepted, an unknown fallback rejected; `shareSummarySchema` rejects a summary without `savedAsSent` and keeps rejecting unknown keys
- [ ] T005 Add `smartShareOf(id: string): Promise<{ email: string; smartShare: boolean } | null>` to `createUsersRepo` in `apps/api/src/repositories/users.repo.ts` (explicit columns `email`, `smartShare`; live users only like `findById`; `CurrentUser` and `currentUserColumns` stay unchanged so no other read carries the setting). The email is returned only for the admin check in the worker and never leaves it
- [ ] T006 [P] [int] `smartShareOf`: default false, true after `UPDATE`, null for a deleted or unknown user — in the existing users repo int test (`rg -l "createUsersRepo" apps/api/test`) or `apps/api/test/users-smart-share.int.test.ts`
- [ ] T007 [P] Create the decision catalogue `apps/api/src/ingest/best-effort.events.ts` (model on `media.events.ts`): type `IngestBestEffortDecisions = { 'ingest.extraction_skipped': { outcome: 'proposed' | 'failed'; reason: 'smart_share_off' } }`, `export const BEST_EFFORT_DECISION_LEVELS = { 'ingest.extraction_skipped:failed': 'warn' }` (default info), and `logExtractionSkipped(log, fields)` over `decisionLogger<IngestBestEffortDecisions>('ingest', { levels })` with fields jobId (the correlation id), deckId, userId, channel, kind (`'link' | 'media' | 'text' | null`), itemId (only when proposed), cut (boolean), unusedPhotos (count). Ids and counts only: never titles, text, addresses or file names (contracts/best-effort.md "Decision event")
- [ ] T008 [P] Start `specs/050-model-spend-guard/implementation-notes.md` (empty log: decisions the plan did not make, deviations); the D452–D458 / ADR-083 reservation is already in `specs/README.md`

**Checkpoint**: the repo typechecks; migration applies and reverses; DTO shapes exist with neutral values.

---

## Phase 2: User Story 1 — A share without smart share is still saved (Priority: P1) 🎯 MVP

**Goal**: for a user without the switch, every share kind except files becomes one best-effort proposal, with zero extraction calls and one decision event.

**Independent Test**: share a link, a text, a photo and an email as a user without the switch (`ingest-spend-guard.int.test.ts`): one proposal each, shaped per the contract; the fake extractor's call count and `llm_calls` extraction rows are 0; one `ingest.extraction_skipped` event each.

### Tests for User Story 1

- [ ] T009 [P] [US1] [unit] `apps/api/src/ingest/best-effort.test.ts`: one case per row of the contracts/best-effort.md kind table and each spec edge case — link (page title / share title / site name; sender text without the address, else description, else none), link with photos (address wins, `unusedPhotos` = photo count), photos only (title from share title, then first line, then "Shared image"; rest of text as body), text only (share title, then first line; rest as body), email with photos, email whose body is only the address (including empty body with the address in the subject), email with an address among other text (text card, no `sourceUrl`), long title cut at `CARD_TITLE_MAX`, body over `CARD_BODY_MAX` sets `cut` and is shortened, nothing usable returns `null`, locked host with no readable page gets the honest locked text (D348), event page becomes a link card (no event context is passed)
- [ ] T010 [P] [US1] [unit] In `apps/api/src/jobs/ingest.test.ts` (file exists; extend its fake deps with `smartShare`, default `async () => true` so every existing case is unchanged): with `smartShare` false the handler never calls the extractor (`runExtraction` deps spy), never calls `autoPublish`, calls `normalize` only for the link kind, proposes `extraction = { model: 'direct', escalated: false, confidence: 0, categoryIds: [], newCategory: null, fallback: 'no_smart_share' }` (+ `bodyCut: true` when cut), logs `ingest.extraction_skipped` with outcome `proposed` and the right `kind`/`cut`/`unusedPhotos`; a share that builds nothing ends `failed` through `fail()` with error `best_effort_empty` (sharer reason `unknown`) and logs outcome `failed` at warn; a file share is unchanged and logs nothing; with `smartShare` true the existing behaviour holds
- [ ] T011 [P] [US1] [int] `apps/api/test/ingest-spend-guard.int.test.ts` (model on `ingest-pipeline.int.test.ts`, same fake extractor with a call counter and the Testcontainers worker harness): for a user without the switch, over channels `paste`, `pwa`, `shortcut` and `email`, a link (page served by the existing fake fetch), a text, two photos and an email with a signature link each give one `proposed` item in the deck's default category with the contract's title and body, `llm_calls` rows with `purpose LIKE 'extract%'` for the job = 0, extractor calls = 0, the embed queue still enqueued for the proposal (FR-011) and a dedup verdict present (FR-007); a PDF share is proposed as today (FR-005 row 1)

### Implementation for User Story 1

- [ ] T012 [US1] Create `apps/api/src/ingest/best-effort.ts` (D454, D455): `bestEffort(raw: IngestRaw, channel: IngestChannel, sourceUrl?: string)` is pure and returns `{ kind, input: ProposeCardInput, cut, unusedPhotos, needsPreview }` or `null`. Kind rules in order, exactly as plan research D455 (email: photos → media, else address-only body → link, else text; others: address → link, else photos → media, else text; the address is removed from the sender's text; an email text card gets no URL). The `input` is `type: 'link' | 'image' | 'text'`, `categoryIds: []`, `confidence: 0`, `language: 'und'`; `cut` is set by comparing the intended body with `CARD_BODY_MAX` (code points, `codePointLength` from `@gobbit/shared`). Export `bestEffortContext(kind, raw, base)` returning the `ValidateContext` (`categoryIds: []`; `sourceUrl`, `linkPreview`, locked host only for link; `imagePublicId`/`morePublicIds` only for media; `sharedText` for link; never `event`). Reuse `hostOf`-style site name from `preview-fallback.ts` by exporting it rather than copying. Constants `INGEST_TEXT_MAX`, `CARD_TITLE_MAX`, `CARD_BODY_MAX` come from `@gobbit/shared`
- [ ] T013 [US1] Add the dependency `smartShare: (userId: string) => Promise<boolean>` (required, documented D453) to `IngestHandlerDeps` in `apps/api/src/jobs/ingest.ts` and the gate right after the file branch: `if (!(await deps.smartShare(job.userId))) return await proposeBestEffort(jobRef, job, role, opts?.signal)`. `proposeBestEffort`: classify with `bestEffort`; for a link kind run `normalize` once as today (`job.normalized ?? deps.normalize(...)`, persist it, `stage = 'normalize'` so a fetch failure keeps the existing retry and `fetch_failed` behaviour) and build the validate context from `previewOf(source)`, `lockedHostOf` and the asset dimensions exactly as the model path does (extract that block into a shared local helper rather than duplicating it); run `validateProposal(input, ctx)`; on success call the existing `propose(...)` with the summary `{ model: DIRECT_PROPOSAL_MODEL, escalated: false, fallback: 'no_smart_share', ...(cut ? { bodyCut: true } : {}), ...validated.summary }`, then `logExtractionSkipped` (outcome `proposed`, itemId); on `null` or an invalid result call `fail(job, 'best_effort_empty')` and log outcome `failed`. Never call `autoPublish`, `runExtraction` or `eventContext` on this branch. A thrown provider-free error (fetch) follows the existing `catch` (the preview-fallback branch there needs `stage === 'extract'`, so it does not fire)
- [ ] T014 [US1] Bind `smartShare` in `apps/api/src/worker.ts` where `createIngestHandler` is built: `createPlatformAdmins({ admins: env.PLATFORM_ADMINS })` once (reuse the helper from `apps/api/src/access/platform-admin.ts`; pass a no-op `decisions` logger if it requires one, or construct it as `apps/api/src/services/admin-wiring.ts` does), then `smartShare: async (userId) => { const u = await users.smartShareOf(userId); return u !== null && (u.smartShare || admins.is({ email: u.email })); }` (FR-003). A missing user is off (the role check has already failed such a job before this point)
- [ ] T015 [US1] Update the existing callers that construct the handler to pass `smartShare: async () => true` so they keep exercising the model path: `apps/api/src/jobs/ingest.test.ts` (default fake), `apps/api/test/ingest-pipeline.int.test.ts`, `apps/api/test/ingest-auto-publish.int.test.ts`, `apps/api/test/ingest-events.int.test.ts`, `apps/api/test/ingest-media.int.test.ts` (find all with `rg "createIngestHandler" apps/api`), and run them unchanged otherwise

**Checkpoint**: US1 works end to end for an unswitched user; today's model path is untouched.

---

## Phase 3: User Story 2 — The sharer sees why the card is plain (Priority: P1)

**Goal**: Your shares and the after-share screen say the share was saved as sent and that smart share is coming soon; reviewers see the marker.

**Independent Test**: a share processed without smart share shows the notice; an extracted one and a file share do not (`shares.service` unit + `@full` stubbed case).

### Tests for User Story 2

- [ ] T016 [P] [US2] [unit] `toShareSummary` sets `savedAsSent` true only when `extraction.fallback === 'no_smart_share'` (false for extracted, preview-fallback, file/direct, queued and failed jobs), in the existing `apps/api/src/services/shares.service.test.ts`; `review.service` maps `extractionFallback: 'no_smart_share'` and `extractionBodyCut` (true only when `extraction.bodyCut === true`), in `apps/api/src/services/review.service.test.ts`
- [ ] T017 [P] [US2] [unit] Web copy: `savedAsSentLine(share)` returns "Saved as you sent it. Smart share is coming soon." only when `savedAsSent` and the state is not `processing`/`failed`, in `apps/web/src/shares/share-state.test.ts`; `fallbackLine` returns the `no_smart_share` line, plus " The text was cut at the limit." when `extractionBodyCut`, and still returns the D355 line for `preview` and null otherwise, in `apps/web/src/review/fallback-line.test.ts`
- [ ] T018 [P] [US2] [unit] `apps/web/src/shares/ShareRow.test.tsx`: the line renders for a `savedAsSent` share and not for another (the after-share screen renders the same `ShareDetail`, so `ShareSent.test.tsx` gets one assertion too)
- [ ] T019 [P] [US2] [e2e:full] `e2e/tests/full/shares.spec.ts`: add a case to the existing stubbed-shares setup (`stubShares`) with one share `savedAsSent: true` and one `false`; only the first shows "Smart share is coming soon" (`@full`)

### Implementation for User Story 2

- [ ] T020 [US2] Fill the new fields in the mappers: `savedAsSent` in `toShareSummary` (`apps/api/src/services/shares.service.ts`) and `extractionBodyCut: job.extraction?.bodyCut === true` beside `extractionFallback` in `apps/api/src/services/review.service.ts` (around the `extractionFallback: job.extraction?.fallback ?? null` line)
- [ ] T021 [US2] Run `pnpm api:openapi` and commit the regenerated `packages/api-client` (CI checks drift); `rg "extractionBodyCut|savedAsSent" packages/api-client/src/schema.d.ts` shows both
- [ ] T022 [US2] Web: add `savedAsSentLine(share)` to `apps/web/src/shares/share-state.ts` and render it in `apps/web/src/shares/ShareRow.tsx` as `<p className="share-row__hint">` next to the `shareEventLine` paragraph (same element, no new class); add the `no_smart_share` case and the cut suffix to `apps/web/src/review/fallback-line.ts` (rendered by the existing `review-card__held` paragraph in `ReviewCard.tsx`, no change there). UI reference: `share-row__hint` / `review-card__held` siblings. Screenshots: phone 412 px + desktop 1280 px, light + dark, of a share row with the line (against a row with the event line) and a review card with the marker (against the D355 preview-fallback card); `ui-system.test.ts` baselines must not rise

**Checkpoint**: US1 + US2 give a visible, explained guard.

---

## Phase 4: User Story 3 — People switched on keep today's smart share (Priority: P1)

**Goal**: a switched-on user, and a platform admin, are extracted exactly as today; the setting is read at processing time; caps apply to everyone.

**Independent Test**: the same share run as one user without the switch and one with it: a best-effort proposal and an extracted one with an extraction call recorded.

### Tests for User Story 3

- [ ] T023 [P] [US3] [unit] `apps/api/src/jobs/ingest.test.ts`: `smartShare` read at run time (a fake that flips between enqueue and `ingest(jobId)` decides; a second run of an already-processed job is `skipped`, nothing is redone), and the true branch calls the extractor with today's escalation, event proposals and preview fallback (the existing cases, now under an explicit "switched on" `describe`)
- [ ] T024 [P] [US3] [int] In `apps/api/test/ingest-spend-guard.int.test.ts`: a user with `UPDATE users SET smart_share = true` is extracted (one `llm_calls` extract row, categories chosen by the fake model); a platform admin (email in `PLATFORM_ADMINS`) with the column false is extracted (FR-003); switching the same user off then on changes the next share only; an unswitched user is refused at the 51st share on one channel and at the 201st combined by the existing caps (FR-010; use the cap env overrides the cap tests already use rather than 200 real jobs); `PATCH /me` and every other route ignore a `smartShare` field and the OpenAPI document has no `smart_share`/`smartShare` property outside the response DTOs listed in contracts (FR-002)

### Implementation for User Story 3

- [ ] T025 [US3] No new production code beyond T013–T014 is expected. If T023/T024 find a gap, fix it in `apps/api/src/jobs/ingest.ts` or `worker.ts` and record it in `implementation-notes.md`

**Checkpoint**: all three stories independently verified.

---

## Phase 5: Close-out

**Purpose**: keep the repository's docs and gates true

- [ ] T026 `pnpm lint && pnpm format:check && pnpm typecheck && pnpm test:unit && pnpm test:int` and `pnpm budget` (copy only, expect no change); `pnpm api:openapi` shows no drift
- [ ] T027 `pnpm test:e2e --grep @full` passes for `shares.spec.ts`; `@smoke` untouched (the e2e stack has no provider, so `smoke/share.spec.ts` still expects the 503)
- [ ] T028 [P] `docs/design/ingestion.md`: a "Smart share and best effort" section (the gate, kinds table, marker, event) and the operator runbook (switch on: `UPDATE users SET smart_share = true WHERE email = '…';`, switch off, check: `SELECT email, smart_share FROM users WHERE smart_share;`, verify no model call: `SELECT count(*) FROM llm_calls WHERE job_id = '…' AND purpose LIKE 'extract%';`, platform admins are always on), and the "Deviations from the plan" list from `implementation-notes.md`
- [ ] T029 [P] `docs/adr.md`: ADR-083 (D452, D453, D454: boolean on the person, gate at processing time, best effort through the existing validator) and one index row in `docs/architecture.md` (keep it < 250 lines); the Ingestion bullet in `CLAUDE.md` gains one clause: "model extraction runs only for people with `users.smart_share` or platform admins, everyone else gets a best-effort proposal (D452–D458)"
- [ ] T030 [P] `README.md` ingestion section: one note that smart share is per person and off by default, with a link to the runbook; `CHANGELOG.md` entry under Unreleased: migration `0028_smart_share`, **Action required** (every user except platform admins is off after deploy; switch curators on with the runbook SQL right after the migration), no environment variable change
- [ ] T031 `PLAN.md` Phase 16: link this spec's plan under H11 if not already; `community-go-list.md` Tracking: tick H11 on merge, record deviations from `implementation-notes.md`
- [ ] T032 Run `quickstart.md` against a local stack (normal member plain share → switch on → extracted → off → photo and long text → event lines in the worker log)
- [ ] T033 `/speckit-converge` until it reports Converged, then `/ponytail:ponytail-review` before the PR (CLAUDE.md "Before a PR")

---

## Dependencies & Execution Order

- **Phase 1** blocks everything. T001 before T002/T005; T003 before T004, T016–T022 and every construction-site fix; T005 before T006 and T014; T007 before T013.
- **US1** (Phase 2): tests T009–T011 first and failing; T012 (builder) before T013 (gate); T013 before T014 and T015; T015 keeps the old suites green and must land with T013 in the same commit.
- **US2** (Phase 3) needs T003 and the job summary written by T013 for the int check; its tests T016–T019 can be written in parallel with US1. T020 before T021; T021 before T022.
- **US3** (Phase 4) needs T013–T014; it adds only tests unless a gap shows.
- **Close-out** last.

### Parallel Opportunities

- Phase 1: T002, T004, T006, T007 in parallel after their targets.
- US1 tests T009–T011 together; US2 tests T016–T019 together (different files).
- US2 can run alongside US1 after T003; same-file tasks (`jobs/ingest.ts`: T013, T025; `ingest.test.ts`: T010, T023; `ingest-spend-guard.int.test.ts`: T011, T024) are sequential.

## Implementation Strategy

- **MVP**: Phase 1 + US1 is the spend guard itself (SC-001); US2 must ship in the same PR, because plain cards without the notice look like a bug (spec US2 priority).
- **One PR**; do not deploy before the curators' addresses are ready for the runbook step (plan Rollout).
- Log decisions the plan did not make and deviations in `specs/050-model-spend-guard/implementation-notes.md`; commit after each task or logical group (conventional commits, e.g. `feat(api): …`).
