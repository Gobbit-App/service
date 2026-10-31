# Implementation Plan: Share status and auto-publish for publishers

**Branch**: `feat/022-share-status` | **Date**: 2026-10-25 | **Spec**: [spec.md](./spec.md) | **Roadmap**: `PLAN.md` § Phase 8 (follow-up)

**Input**: Feature specification from `/specs/022-share-status/spec.md`

Project override of the core template. Written for outside readers: the repository is public.

## Summary

A share that fails in the worker today disappears: the reason sits in `ingest_jobs.error`, nothing is logged, and the review pill hides itself when the queue is empty. This feature makes every share traceable and lets publishers skip review for their own shares.

**Traceable.**

- The worker stores a closed failure code (`ingest_jobs.failure_code`, D194) and logs one error line per final failure with no content (D195).
- A sharer-scoped API lists the caller's shares on a deck (`GET /decks/{id}/shares`), reads one (`GET /shares/{id}`) and retries a failed one in place (`POST /shares/{id}/retry`, D196–D197).
- The PWA adds **Your shares** (`/d/$slug/shares`, lazy, polls while processing). The Sent screen shows the live status of the share it just sent. Publishers always see the review entry, and the empty queue links to Your shares (D198).

**Auto-publish.**

- A deck setting `auto_publish_shares` (owner-changed; on by default for personal decks, D192).
- After the worker proposes a card, it publishes it directly when all of these hold (D193):
  - the sharer can publish now;
  - the model chose an existing category;
  - dedup found it new.
- Otherwise the card stays in review, and the reason is recorded in `ingest_jobs.auto_publish`.
- The publish runs through the same routine as review (`publishProposal`, extracted from `review.service`).
- Constitution IV is amended to allow this one path (1.2.0, ADR-058).

## Starting point

- `main @ 9ea9d75` (021 bulk import merged, Phase 8 deployed). Branch `feat/022-share-status` @ `cac0d07` (spec).
- Latest migration `0016_import_channel`.
- Ingest pipeline (`docs/design/ingestion.md`):
  - `ingest.service.submit` → `ingest_jobs` `queued` → worker `jobs/ingest.ts` (`claim` → normalize → `runExtraction` → `proposeItem` → dedup).
  - `fail()` writes `error` only.
  - Retries: `INGEST_JOB_RETRIES` = 2.
- Review: `review.service.publish/publishMany/discard`. It writes the `published` event (020, D187) and purges the in-process public page cache (D180).
- Web:
  - `review/ReviewPill` returns null at count 0;
  - `share/ShareSent` promises "it'll appear in Review";
  - deck settings `deck-admin/DeckSection` already has the owner-only `isPublic` switch (D176).
- Production incident (2026-10-25): an image share was accepted, then the job failed in the worker. The sharer, an owner, had no way to see it.

## Technical Context

**Language/Version**: TypeScript (strict, ESM, no build step) on Node ≥ 22; React 19

**Primary Dependencies**: Hono + `@hono/zod-openapi`, Drizzle, pg-boss, pino; TanStack Router/Query. No new dependencies.

**Storage**: PostgreSQL 17. One migration `0017_share_status`: `decks.auto_publish_shares`; `ingest_jobs.failure_code`, `auto_publish`, `retry_count`, `retried_at`; one index. Full detail in [data-model.md](./data-model.md).

**Testing**: Vitest unit; integration (Testcontainers) with the fake extraction already used by `ingest-pipeline.int.test.ts`; Playwright smoke + full

**E2E tier**: smoke + full.

- **Smoke**: the review entry, and the Sent → Your shares link, sit on the share and review journeys, which are critical. Today's failure ("I can't find it anywhere") is a broken critical journey.
- **Full**: the shares-list states and the deck setting are variants. They are nightly, with share responses stubbed because e2e has no extraction provider.
- The pipeline behaviour is covered at the integration tier.

**Target Platform**: Docker Compose on Dokploy; PWA on Android Chrome (share target), iOS Shortcut, paste box, email-in

**Project Type**: pnpm monorepo — API + worker, PWA, shared packages

**Performance Goals**:

- Shares list ≤ 50 rows from one indexed query plus one batched item lookup.
- Polling runs every 3 s, only while a row is processing.
- Status visible within 5 s of the worker finishing (SC-002).

**Constraints**:

- Web initial bundle ≤ 150 KB gzip; the shares route is lazy and only `SharesLink` joins the deck header chunk.
- Log lines carry no content (FR-009).
- Shares are visible only to their sharer.
- AI keys remain optional (with no key, ingest stays off as today).

**Scale/Scope**: household/community decks; a handful of shares per member per day (caps unchanged)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | How this plan complies (or "N/A") |
|-----------|-----------------------------------|
| I. Layered API | `routes/my-shares.ts` parses → `shares.service` (access: sharer + `deck.read` / `item.create`; retry rules) → `ingestJobsRepo` (list, conditional retry update). Auto-publish rules live in `ingest/auto-publish.ts`; SQL stays in repos; `publishProposal` is shared by `review.service` and the worker. |
| II. One source of truth for contracts | `ShareSummary`, failure codes, auto-publish outcomes, `DeckPatch.autoPublishShares` in `@gobbit/shared`; `pnpm api:openapi` regenerates the client; the DB CHECK lists are tested equal to the shared constants. |
| III. Invariants live in the database | `0017_share_status` + hand-written down file. CHECKs: `failure_code` ∈ list and only when `failed`; `auto_publish` ∈ list; `retry_count` 0–3. D95's "published needs ≥ 1 category" trigger still guards auto-publish. |
| IV. Private by default | **Amended (1.1.1 → 1.2.0)**: one automated publish path, only for a sharer who can publish, on a deck whose owner opted in (ADR-058). Shares are visible only to their sharer (404 for others); the summary never includes shared text; `ing_` tokens can't read shares; logs carry codes only. |
| V. Tests at the right tier | Unit: classifier, gate, copy, components. Int: shares API access/retry/caps, worker auto-publish + failure codes + log line, deck setting. E2E smoke (review entry, Sent → Your shares) + full (list states, setting). Regression for the incident at int. Traceability below. |
| VI. Lean, offline-first web | Lazy `/d/$slug/shares`; list persisted in the query cache for offline reading; actions disabled offline; subpath import `@gobbit/shared/ingest` for codes; no service-worker API caching. |
| VII. Simple, optional, deployable | No new deps, env vars or services; migration backfills; normal CI → Dokploy flow. |

Post-design re-check: still passes. IV holds because of the amendment, which is committed with this plan.

## Decisions this plan pins down

| ID | Decision | ADR? |
|----|----------|------|
| D192 | Deck setting `auto_publish_shares`, owner-changed, default off; on for personal decks (backfill + creation) | yes → ADR-058 |
| D193 | Worker auto-publish gate (share channel, publisher now, chosen category, dedup `new`) via shared `publishProposal`; outcome in `ingest_jobs.auto_publish`; failure keeps the proposal | yes → ADR-058 |
| D194 | Closed failure codes in `ingest_jobs.failure_code`; worker classifies; web maps to plain copy; `error` kept for operators | no |
| D195 | One content-free error log line per final failure; retry warning without the message | no |
| D196 | Sharer-only shares API (`/decks/{id}/shares`, `/shares/{id}`) with a content-free `ShareSummary`; `/ingest/{id}` stays the debug view | no |
| D197 | Retry in place (same job), ≤ 3 per share, counts against caps via `retried_at` | no |
| D198 | Web: lazy Your shares route with polling; review entry always visible to publishers; live Sent screen; owner switch in deck settings | no |
| D199 | E2E tier smoke + full; incident regression at integration | no |

## Project Structure

### Documentation (this feature)

```text
specs/022-share-status/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/shares-api.md
├── checklists/requirements.md
├── tasks.md                 # /speckit-tasks
└── implementation-notes.md  # /speckit-implement
```

### Source Code (repository root)

```text
packages/db/
├── src/schema/decks.ts, ingest-jobs.ts          # new columns + CHECKs
├── src/schema/enums.test.ts                     # CHECK lists = shared constants
├── migrations/0017_share_status.sql (+ meta)
└── migrations/down/0017_share_status.down.sql

packages/shared/src/
├── ingest/constants.ts                          # failure codes, outcomes, shareChannels, limits
├── schemas/share.ts (+ test)                    # ShareSummary, ShareList
└── schemas/deck.ts                              # autoPublishShares on Deck + DeckPatch

apps/api/src/
├── jobs/ingest.ts                               # failure codes, log lines, call autoPublish
├── ingest/failure-code.ts (+ test)              # classifyFailure
├── ingest/auto-publish.ts (+ test)              # gate → publishProposal → outcome
├── review/publish-proposal.ts                   # extracted from review.service (new-mode publish)
├── services/review.service.ts                   # uses publishProposal
├── services/shares.service.ts (+ test)          # list, get, retry
├── services/decks.service.ts                    # autoPublishShares owner-only
├── repositories/ingest-jobs.repo.ts             # listForSharer, resetForRetry, countByUserSince(retried_at)
├── repositories/decks.repo.ts                   # personal deck created with auto_publish_shares
├── errors/http-errors.ts                        # ownerRequired(detail)
├── routes/my-shares.ts                          # GET /decks/{id}/shares, GET /shares/{id}, POST /shares/{id}/retry
└── worker.ts / services/index.ts                # wiring
apps/api/test/
├── shares.int.test.ts                           # access, list window, retry, caps, 404s
├── ingest-pipeline.int.test.ts                  # auto-publish outcomes, failure codes, log line, incident regression
└── decks.int.test.ts                            # setting rules

apps/web/src/
├── routes/d.$slug.shares.tsx                    # lazy route
├── shares/SharesScreen.tsx, ShareRow.tsx, SharesLink.tsx (+ tests)
├── shares/share-state.ts, failure-copy.ts (+ tests), shares-queries.ts
├── review/ReviewPill.tsx, ReviewQueue.tsx       # always visible; empty → Your shares
├── share/ShareSent.tsx, ShareScreen.tsx         # live status by job id
├── deck-admin/DeckSection.tsx                   # auto-publish switch
└── routes/d.$slug.tsx                           # header links

e2e/tests/smoke/review.spec.ts, share.spec.ts    # review entry; Sent → Your shares
e2e/tests/full/shares.spec.ts, deck-admin.spec.ts
```

**Structure Decision**:

- **db**: columns and CHECKs.
- **shared**: contracts.
- **api**: worker, the new shares service and routes, and the `publishProposal` extraction.
- **web**: a new `shares/` feature folder plus small edits to review, share and deck-admin.
- The API routes go in `routes/my-shares.ts` because `routes/share.ts` already serves `/s/:itemId` previews.

## Invariant → test traceability

| Invariant / rule (spec FR or D-number) | Enforced in | Test (file, tier) |
|----------------------------------------|-------------|-------------------|
| FR-001/002 sharer sees own shares, 30 days, newest first, share channels only | repo query + service | `shares.int.test.ts`, int |
| FR-003 states map (processing/failed/in review/published/not added, deleted card) | service DTO + `share-state.ts` | `shares.service.test.ts`, unit; `share-state.test.ts`, unit |
| FR-004 plain-language reason, never raw error | `failure-copy.ts`; DTO has no `error` | `failure-copy.test.ts`, unit; `shares.int.test.ts` (no `error` field), int |
| FR-005 retry same share; expired → paste again; ≤ 3; caps | service + conditional update | `shares.int.test.ts`, int; `full/shares.spec.ts`, full |
| FR-006 Sent screen live status + link | `ShareSent` | `ShareSent.test.tsx`, unit; `smoke/share.spec.ts`, smoke |
| FR-007 review entry always visible to publishers; empty → Your shares | `ReviewPill`, `ReviewQueue` | `ReviewPill.test.tsx`, unit; `smoke/review.spec.ts`, smoke |
| FR-008 only the sharer sees a share (404 otherwise, publishers included) | `shares.service` | `shares.int.test.ts`, int |
| FR-009 one error log line, no content (D195) | `jobs/ingest.ts` `fail()` | `ingest-pipeline.int.test.ts` (captured log), int |
| FR-010/011 setting owner-only, maintainers read-only, personal deck default on | `decks.service`, migration, `decks.repo` | `decks.int.test.ts`, `personal-deck.int.test.ts`, int; `DeckSection.test.tsx`, unit; `full/deck-admin.spec.ts`, full |
| FR-012 auto-publish only when publisher now + category + dedup new; same as manual publish | `auto-publish.ts` + `publishProposal` + D95 trigger | `auto-publish.test.ts`, unit; `ingest-pipeline.int.test.ts`, int |
| FR-013 held reason shown | `auto_publish` column → DTO → copy | `ingest-pipeline.int.test.ts`, int; `ShareRow.test.tsx`, unit |
| FR-015 MCP and import never auto-published or listed | `shareChannels` gate | `auto-publish.test.ts`, unit; `shares.int.test.ts`, int |
| D194 failure code only on failed rows, closed list | DB CHECK | `ingest-pipeline.int.test.ts`, int; `enums.test.ts`, unit |
| Incident regression: final failure → listed as failed with reason + log line | worker + API | `ingest-pipeline.int.test.ts`, int |

## Rollout

- **Migrations**: `0017_share_status`. Reversible: the down file drops the new columns and index. Backfill sets `auto_publish_shares = true` on personal decks and `failure_code` on existing failed jobs.
- **Env / config**: none new.
- **API client**: `pnpm api:openapi` needed (new routes, Deck field).
- **Constitution**: amend principle IV → 1.2.0 in this branch (with the plan), ADR-058 in `docs/adr.md`, and a row in the `docs/architecture.md` ADR index.
- **Docs**: `docs/design/ingestion.md` (Shares status, Auto-publish, Deviations); `README.md` (Your shares and the setting, user-facing); `PLAN.md` link.
- **Deploy order / flags**: normal CI → Dokploy. The API and worker ship in one image, so the migration runs before both start.

## Risks

| Risk | Likelihood / impact | Mitigation |
|------|---------------------|------------|
| A wrong card auto-published on a shared deck | M / M | Off by default for shared decks; gates (category chosen, dedup `new`); card is a normal published card, archivable; activity log shows "via share" |
| Public deck page shows an auto-published card up to 5 min late (worker can't purge the API's in-process cache, D180) | H / L | Accepted; documented in ingestion.md Deviations |
| Polling load | L / L | Only while a row is processing, 3 s, sharer-only query on an index |
| Failure classifier maps a new error to `unknown` | M / L | `unknown` has generic copy + retry; `error` keeps the detail for operators |
| Retry abuse | L / L | ≤ 3 per share + caps count retries |
| Extracting `publishProposal` changes manual review | L / H | `review.int.test.ts` unchanged and green before and after |

## Settle before starting

- [x] Personal deck default: on (user decision 2026-10-25).
- [x] Constitution amendment IV → 1.2.0, committed with this plan.

## Complexity Tracking

No violations. The principle IV change is an amendment, not an exception.
