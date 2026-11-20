# Implementation Plan: Model spend guard — smart share only for people switched on

**Branch**: `050-model-spend-guard` | **Date**: 2026-11-20 | **Spec**: [spec.md](./spec.md) | **Roadmap**: `PLAN.md` § Phase 16 (`community-go-list.md` H11, closes G21)

**Input**: Feature specification from `/specs/050-model-spend-guard/spec.md`

Project override of the core template. Written for outside readers: the repository is public.

## Summary

One boolean on the person, one branch in the worker, one pure builder, two small DTO additions.

- **The switch** (D452): `users.smart_share boolean NOT NULL DEFAULT false`, changed only by an operator with SQL. Platform admins count as on in code (`PLATFORM_ADMINS`, the list a migration cannot read).
- **The guard** (D453): in the ingest handler, after the sharer's role check and after the file branch (D395, no model today), the worker asks `smartShare(userId)` at processing time (FR-012). Off → `proposeBestEffort`; on → today's path, untouched.
- **The builder** (D454, D455): `ingest/best-effort.ts` is a pure function from `(raw, channel)` to a `propose_card`-shaped input plus a validate context. It is passed through the **same** `validateProposal` an extracted answer goes through, so limits, locked-site rules (D347/D348), link previews and the media payload come for free (FR-007). No category, no event context, no `autoPublish` call (FR-006).
- **The marker** (D456): `extractionFallbacks` gains `no_smart_share`; the job's extraction summary gets `fallback: 'no_smart_share'` and, when the body was cut, `bodyCut: true`. The review queue shows a line (same slot as the D355 preview-fallback line); the share status (`ShareSummary.savedAsSent`) shows "smart share is coming soon" on Your shares and the after-share screen (both render `ShareDetail`/`ShareRow`).
- **The record** (D457): one decision event, `ingest.extraction_skipped`, per share processed without the switch.
- **Unchanged**: caps (`submit`), search, query and card embeddings (including the dedup draft embedding, spec Assumptions), bulk import, Ask, files, the no-provider 503.

## Starting point

`main @ c610dd5` (spec merged in #176). Latest migration `0027_member_profile`; `049-import-v2` is planned and tasked but not merged, and adds no migration, so this feature's migration is `0028_smart_share`. Builds on `022-share-status` (share states, `ShareRow`), `045-media-cards` (D395 direct media proposals) and D355 (preview fallback). Next free ids: D452, ADR-083 (`049` still lists ADR-081, which `047` took on main; it will renumber, so this plan skips 082). Not deployed. Current ingest flow: `docs/design/ingestion.md`.

## Technical Context

**Language/Version**: TypeScript (strict, ESM, no build step) on Node ≥ 22; React 19

**Primary Dependencies**: existing only (Hono + zod-openapi, Drizzle, pg-boss, pino, TanStack Query). No new dependency.

**Storage**: PostgreSQL 17. One column on `users` (migration `0028_smart_share` + hand-written down file). The marker rides in the existing `ingest_jobs.extraction` jsonb. See [data-model.md](./data-model.md).

**Testing**: Vitest unit (builder, gate, DTO mappers, review and share copy); integration with the fake extractor already used by `ingest-pipeline.int.test.ts` (extractor call count = 0, every kind, every channel, switch on/off, admin, cap); Playwright `@full` with the share status stubbed.

**E2E tier**: full. The e2e stack has no extraction provider, so `POST /ingest` answers 503 there (`smoke/share.spec.ts`); a real share cannot run end to end. The new UI is one line on a share row, shown for a variant (a share saved without smart share), the kind of case `full/shares.spec.ts` already covers by stubbing the shares list at the page edge. Pipeline behaviour is covered at the integration tier. No smoke: the critical share journey is unchanged for people switched on and still reaches the API for everyone.

**UI reference**:
- Share-status line → the existing `share-row__hint` paragraph in `apps/web/src/shares/ShareRow.tsx` (same element and class as `shareEventLine`, below it). No new class, token or layout.
- Review-queue marker → the `review-card__held` paragraph that shows `fallbackLine` (D355) in `ReviewCard.tsx`. Same slot, one more case in `fallback-line.ts`.

**Target Platform**: Docker Compose on Dokploy; PWA

**Project Type**: pnpm monorepo — API + worker, PWA, shared packages

**Performance Goals**: N/A. The guard adds one indexed user read per share in the worker, and removes model calls.

**Constraints**: card body ≤ 2000 code points / payload ≤ 8192 bytes (both enforced by `validateProposal`/`itemCreateSchema`); AI keys optional; no env var added.

**Scale/Scope**: a handful of curators switched on; every other user off.

## Constitution Check

| Principle | How this plan complies |
|-----------|------------------------|
| I. Layered API | The decision is in the worker handler (service level); the new user lookup is a `UsersRepo` method; DTO fields are filled in the existing mappers (`toShareSummary`, `review.service`). No route changes. |
| II. One source of truth for contracts | `extractionFallbacks`, `ExtractionSummary.bodyCut`, `ShareSummary.savedAsSent` and `ReviewEntry.job.extractionBodyCut` live in `@gobbit/shared`; `pnpm api:openapi` regenerates the client (CI checks drift). |
| III. Invariants live in the database | The default is a column default plus `NOT NULL`; nothing a bad caller could set, because no route writes it (FR-002). Down file written by hand. |
| IV. Private by default | No new read surface. `savedAsSent` goes only to the sharer (strict `ShareSummary`, D196); the review flag only to publishers. Link previews still come through `safe-fetch` (the existing normalize step). No content in the decision event. |
| V. Tests at the right tier | Unit + integration + one `@full` case; table below. E2E tier stated above. |
| VI. Lean, offline-first web | Two copy lines, no new import, no new query. Bundle effect negligible. |
| VII. Simple, optional, deployable | One column, no env var, no dependency. Works without AI keys exactly as before (the worker still registers ingest only with a provider). |
| VIII. Accountable by default | Accountability table below: the skip, the cut and the unused photos are in one event; the failure uses the existing sharer-visible state. |
| IX. Reuse before writing | Checked: `validateProposal` (whole validation and payloads), `proposeItem` (default category, dedup, embedding, snapshot), `buildNormalizedSource`/`normalizeRaw` (page preview), `previewFallback` pattern and its review line, `createPlatformAdmins.is`, `decisionLogger`, `share-row__hint`. New code is the pure builder, the gate and the copy. |
| X. One UI system | UI reference above; no new class or token; screenshots (phone 412 px + desktop 1280 px, light + dark) of one share row and one review card against their siblings are part of the UI task. |

Re-check after design: no violation; nothing in Complexity Tracking.

## Decisions this plan pins down

Full reasoning in [research.md](./research.md).

| ID | Decision | ADR? |
|----|----------|------|
| D452 | The switch is `users.smart_share` (boolean, default false), set by SQL only; platform admins are on in code via `PLATFORM_ADMINS`, not by migration. | yes → ADR-083 |
| D453 | The gate is in the ingest handler, after the role check and the file branch, reading the setting at processing time. Off → best effort; the model path is not touched. | yes → ADR-083 |
| D454 | Best effort goes through the existing `validateProposal`, with no categories and no event context; no `autoPublish`. | yes → ADR-083 |
| D455 | Kind rules: files unchanged; for app/paste/Shortcut a web address wins over photos, then photos, then text; for email photos win, then "body is only the address" → link, else text. Only a link kind fetches the page. | no |
| D456 | The marker is `fallback: 'no_smart_share'` (+ `bodyCut`) in the job's extraction summary, surfaced as `extractionFallback`/`extractionBodyCut` for reviewers and `savedAsSent` for the sharer. | no |
| D457 | One decision event `ingest.extraction_skipped` per share processed without the switch. | no |
| D458 | The runbook switch is a one-line SQL `UPDATE`, documented in `docs/design/ingestion.md`; the deploy note in `CHANGELOG.md` is **Action required** (switch your curators on, or their shares go plain). | no |

## Project Structure

### Documentation (this feature)

```text
specs/050-model-spend-guard/
├── spec.md
├── plan.md              # This file
├── research.md          # Phase 0
├── data-model.md        # Phase 1
├── quickstart.md        # Phase 1
├── contracts/
│   └── best-effort.md   # DTO additions, decision event, kind rules
├── tasks.md             # /speckit-tasks (not created here)
└── implementation-notes.md
```

### Source Code (repository root)

```text
packages/db/
├── src/schema/users.ts                          # + smartShare column
└── migrations/0028_smart_share.sql (+ down/0028_smart_share.down.sql)

packages/shared/src/
├── ingest/constants.ts                          # extractionFallbacks += 'no_smart_share'
└── schemas/{ingest,share}.ts                    # summary.bodyCut, review job flags, ShareSummary.savedAsSent

apps/api/src/
├── ingest/best-effort.ts (+ .test.ts)           # NEW: kind rules + builder over validateProposal
├── ingest/best-effort.events.ts                 # NEW: `ingest.extraction_skipped` catalogue
├── jobs/ingest.ts (+ .test.ts)                  # the gate, proposeBestEffort, event
├── worker.ts                                    # bind `smartShare` (users repo + createPlatformAdmins)
├── repositories/users.repo.ts                   # smartShareOf(id): { email, smartShare } (CurrentUser stays lean)
├── services/{shares,review}.service.ts          # map the new flags
└── test/ingest-spend-guard.int.test.ts          # NEW

apps/web/src/
├── shares/{share-state.ts,ShareRow.tsx}         # the "coming soon" line
└── review/fallback-line.ts                      # one more case

e2e/tests/full/shares.spec.ts                    # stubbed share with savedAsSent
docs/design/ingestion.md, docs/adr.md, docs/architecture.md (one index row), README.md, CHANGELOG.md
```

**Structure Decision**: all changes sit in packages that already own ingestion; no new package, route, queue or table.

## Invariant → test traceability

| Invariant / rule | Enforced in | Test (file, tier) |
|------------------|-------------|-------------------|
| FR-001 default off, FR-003 admin on | column default; `smartShare()` binding in `worker.ts` | `ingest-spend-guard.int.test.ts` (new user off; admin on), int |
| FR-002 no route changes it | no route or schema writes `smart_share` | `ingest-spend-guard.int.test.ts` asserts `PATCH /me` ignores it; OpenAPI snapshot has no field, int |
| FR-004 no extraction call, SC-001 | gate in `jobs/ingest.ts` | `ingest-spend-guard.int.test.ts`: extractor and `llm_calls` extraction rows = 0 for link, text, photo, email, Shortcut, int; `ingest.test.ts` unit |
| FR-005 kind table | `best-effort.ts` | `best-effort.test.ts`, unit (one case per table row and edge case) |
| FR-006 no category, never auto-published, marked | `proposeItem` default category; handler never calls `autoPublish`; `extraction.fallback` | `ingest.test.ts` unit; `ingest-spend-guard.int.test.ts` item lands in the default category, status `proposed`, int |
| FR-007 same validation, locked sites, dedup | `validateProposal`, `proposeItem` | `best-effort.test.ts` (locked host honest text, limits); int dedup verdict present |
| FR-008 sharer notice, only for plain shares | `toShareSummary.savedAsSent`; `ShareRow` | `shares.service` test; `share-state.test.ts`/`ShareRow.test.tsx`; `@full shares.spec.ts` |
| FR-009 switched on = today | gate false branch is the current code | existing `ingest.test.ts` and `ingest-pipeline.int.test.ts` pass unchanged, plus one explicit on/off pair, int |
| FR-010 caps for everyone | `ingest.service.submit` (unchanged) | existing caps tests; int: an unswitched user hits 50 on a channel, int |
| FR-011 embeddings, search, import, Ask unchanged | not touched | existing suites; int asserts the embed queue is still enqueued for the proposal |
| FR-012 read at processing time | `smartShare()` call after claim | `ingest.test.ts`: flip between enqueue and run, unit |
| Skip event, cut flag, unused photos, failure | `logExtractionSkipped` | `ingest.test.ts` asserts the event for each outcome, unit |

## Accountability

| Decision | Event / audit row | Outcomes · reasons | Fields (ids/hashes only) | Level | Watched (instance / aggregate / rate) | Alert threshold (default) | Test |
|----------|-------------------|--------------------|--------------------------|-------|---------------------------------------|---------------------------|------|
| Extraction skipped for a share, best effort built or not (also carries the body cut and the photos left unused) | `ingest.extraction_skipped` | `proposed`, `failed` · `smart_share_off` | jobId, deckId, userId, channel, kind (`link`, `media`, `text`, or null), itemId when proposed, cut (boolean), unusedPhotos (count) | info (`failed` → warn) | instance by job id; aggregate by kind and outcome; rate of `failed` | `failed` > 5 in an hour (a locked site or empty share is not an outage, a spike is) | `ingest.test.ts`, unit |
| Share ended failed because no best-effort card could be built | the job's existing `failed` state, `failureCode` and the `ingest job failed` log line, plus the event above | `failed` | as the existing failure line | error (existing) | existing share-failure watch | existing | `ingest.test.ts`, unit; int |
| The setting changed (operator, SQL) | none in the app: an operator's database change is outside the app's decisions (spec FR-002); the runbook asks for the change to be noted in the ops log | n/a | n/a | n/a | n/a | n/a | n/a |

The `llm_calls` table stays the record of model use (one row per extraction call), so "no call" is checkable by absence for any user and job.

**Operator controls**: the switch itself (`UPDATE users SET smart_share …`, runbook in `docs/design/ingestion.md`); the daily caps are unchanged (`INGEST_DAILY_CAP`, combined cap); no new env var.

## Rollout

- **Migrations**: `0028_smart_share` (additive, `ADD COLUMN … NOT NULL DEFAULT false`, reversible; down file drops the column). No backfill: every existing user becomes off, by design.
- **Env / config**: none. `PLATFORM_ADMINS` is already read by the worker env.
- **API client**: `pnpm api:openapi` yes (`ShareSummary.savedAsSent`, `ReviewEntry.job.extractionFallback` enum and `extractionBodyCut`).
- **Deploy order / flags**: normal CI → Dokploy flow. **Action required** on first deploy: shares from everyone except platform admins turn plain at once, so switch your curators on right after the migration (runbook SQL), or have it ready first. The `CHANGELOG.md` entry carries the note (no env var, but a behaviour change that needs a manual step).
- **Docs**: `docs/design/ingestion.md` (section and runbook, Deviations), one `docs/architecture.md` index row for ADR-083, ADR-083 in `docs/adr.md`, `README.md` (the "smart share" note next to ingestion), `specs/README.md` (reserve D452–D458, ADR-083), `community-go-list.md` Tracking (plan line, then merge).

## Risks

| Risk | Likelihood / impact | Mitigation |
|------|---------------------|------------|
| Deploying without switching curators on silently degrades their seeding | M / M | **Action required** note in the changelog and PR; the runbook SQL is one line; curators see the notice, so it is visible, not silent. |
| `validateProposal` evolves and its fallback `type` rules change what best effort builds | L / L | Builder tests pin each kind; kind rules live in one file. |
| A link share's page fetch is a cost or abuse surface | L / L | Already `safe-fetch`, already capped by the share caps; unchanged from today (normalize runs before extraction now). |
| Text card with a long first line as title, cut | L / L | Cut at the title limit, reviewer edits; same as media shares today. |
| `049` and this plan both mention ADR numbers | L / L | This plan takes ADR-083 and says so in `specs/README.md`. |

## Settle before starting

- [ ] None outside the repo. The list of curators to switch on after deploy is the operator's.

## Complexity Tracking

No violations.
