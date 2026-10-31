# Implementation Plan: Link snapshots and link checks

**Branch**: `014-link-snapshots` | **Date**: 2026-10-22 | **Spec**: [spec.md](./spec.md) | **Roadmap**: `PLAN.md` § Phase 7 (demo 3)

**Input**: Feature specification from `/specs/014-link-snapshots/spec.md`

Project override of the core template. Written for outside readers: the repository is public.

## Summary

**Snapshots.** Link cards get a stored copy of their preview image:

- A `link-snapshot` pg-boss job is enqueued after commit on create, URL/image change, publish and ingest propose.
- It fills an empty preview, copies `preview.image` with 012's `media.uploadFromUrl` (source `link_snapshot`) and writes `preview.publicId`/`width`/`height`.
- The write is conditional on `updated_at`, so the job never overwrites a newer edit (D163).
- Ingest stops discarding the page's OG data and stores it as the preview.
- Migration `0013` keeps the stored id out of `search_text`.

**Checks.** A daily `link-check-sweep` checks up to 100 due published links:

- Each link is checked about once a month, with one request per host at a time, through `safe-fetch`.
- Results are recorded in a new `link_checks` table. Two definite failures mean `dead`; a different title means `changed` (D164).
- Flags reach readers as `linkHealth` on the Item DTO, shown as a badge.
- Editors get "Check again", "Dismiss" and a "Links to check" list (D165).

Both parts are recorded in **ADR-055**.

## Starting point

- `main @ 8ff137c`. This plan depends on [`012-media-assets`](../012-media-assets/plan.md):
  - `uploadFromUrl` and `safe-fetch` binary mode;
  - the asset registry and the D160 reference rule;
  - the orphan sweep and migration `0012`.

  Rendering prefers [`013-cloud-image`](../013-cloud-image/plan.md), but this feature doesn't require it.
- Link preview lookup: `services/link-preview.service.ts` (D134), with `toLinkPreview`, an LRU cache and a per-user rate limit. `GET /decks/{id}/link-preview` is used by the editor's `FetchPreview`/`LinkFields`.
- `linkPayloadSchema`: `{ url, preview?: { title?, description?, image? } }`, strict.
- Ingest:
  - `normalize-raw` fetches the URL, and `buildNormalizedSource` keeps `og` for the extractor.
  - `ai/extract-validate.ts` builds link payloads as `{ url }`.
  - `ingest/propose.ts` `proposeItem` creates the proposed item and calls `embedQueue`.
- Items: `items.service` `create`/`update` and `review.service.publish` call `embedQueue.enqueueIfStale` after commit. `createItemDtoMapper` batches categories and favorites per page.
- `item_search_text()` (0009) indexes every string in link payloads.
- `safe-fetch` returns `{ status, finalUrl, ms, html, error }` and accepts HTML only. 012 adds `accept: 'image'`.
- Worker: `QUEUES` in `jobs/queues.ts`, schedules in `worker.ts`. The latest migration after 012 is `0012_media_assets`.
- Web:
  - `cards/LinkCard.tsx` renders the remote image.
  - `items/CardActions.tsx` holds the per-card actions.
  - `d.$slug.archived.tsx` is the pattern for filtered list pages.

## Technical Context

**Language/Version**: TypeScript (strict, ESM, no build step) on Node ≥ 22; React 19 PWA

**Primary Dependencies**: Hono + `@hono/zod-openapi`, Drizzle, pg-boss, `undici` via `safe-fetch`, the existing `extract-page`, Cloudinary through 012's `media-store`. No new dependencies.

**Storage**: PostgreSQL 17 — new `link_checks` table and `link_check_status` enum; `item_search_text()` replaced; new partial index on link `preview.publicId`

**Testing**: Vitest unit; integration with Testcontainers, a local fixture HTTP server and `MemoryMediaStore`; Playwright `@full`

**E2E tier**: full — snapshots and checks are async third-party work, and the flag actions are a secondary path off the card (constitution V). No smoke journey changes; the `@full` spec needs [`011-e2e-nightly`](../011-e2e-nightly/spec.md)'s suite (until then it runs locally with `pnpm test:e2e`)

**Target Platform**: Docker Compose on Dokploy; the worker runs both jobs

**Project Type**: pnpm monorepo — API + worker, PWA, shared packages

**Performance Goals**: snapshot within 30 s of save; sweep ≤ 100 requests and < 10 min; the DTO flag lookup adds one indexed query per page

**Constraints**: outbound only through `safe-fetch`; snapshots off without `CLOUDINARY_URL`, checks always on; the job never overwrites newer edits; no change to `verified_at`

**Scale/Scope**: up to ~3,000 link cards per deployment at the monthly cadence

## Constitution Check

| Principle | How this plan complies |
|-----------|------------------------|
| I. Layered API | `routes/items.ts` (filter, two routes) → `link-checks.service` (rules, classification) and `items.service` (server-owned preview fields, enqueue) → `link-checks.repo`, `items.repo.updatePayloadIf`; jobs call services |
| II. One source of truth | Payload, DTO, query and constants in `@gobbit/shared` (`/links` subpath for the web); `pnpm api:openapi` |
| III. Invariants in the DB | `link_checks` FK cascade, CHECKs; search text exclusion in `item_search_text()`; migration + down file |
| IV. Private by default | Copies and probes only via `safe-fetch` (IP guard, caps, timeouts); no Cloudinary remote fetch; readers stop sending requests to third-party image hosts once a snapshot exists; checks are unauthenticated GETs with the existing user agent |
| V. Tests at the right tier | Unit (classification, state machine, server-owned fields, enqueue rules), int (job against fixture server, conditional write, sweep, routes, search text, orphan reference), e2e (badge + actions); traceability below |
| VI. Lean web | Badge and actions in existing chunks; "Links to check" is a lazy route; `CloudImage` reused; flag data rides the persisted query cache |
| VII. Simple, optional | No dependency; without Cloudinary only snapshots are off; no AI key needed |

No violations.

## Decisions this plan pins down

Full reasoning in [research.md](./research.md).

| ID | Decision | ADR? |
|----|----------|------|
| D163 | `link-snapshot` job (after commit, singleton per item): fill an empty preview, copy `preview.image` via `uploadFromUrl` → server-owned `preview.publicId`/`width`/`height`, conditional on `updated_at`, requeue once, then `enqueueIfStale`; URL/image change drops the old snapshot fields; ingest stores the OG preview; `item_search_text()` strips the link `preview.publicId` | yes → **ADR-055** |
| D164 | `link_checks` table + daily `link-check-sweep` (`30 6 * * *`, 100/run, 30 ± 3 days, one request per host): `dead` after 2 consecutive definite failures, temporary errors never count, `changed` on a title difference, flags clear on `ok`, dismissal holds until the status changes | yes → **ADR-055** |
| D165 | `Item.linkHealth` (active flags only); card badge for everyone; `POST /items/{id}/link-check` (10/user/hour; never sets `dead` by itself), `DELETE /items/{id}/link-check/flag`, `GET …/items?flag=link` for `item.update`; web route `/d/$slug/links` | no |

## Project Structure

### Documentation (this feature)

```text
specs/014-link-snapshots/
├── spec.md
├── checklists/requirements.md
├── plan.md
├── research.md
├── data-model.md
├── contracts/link-checks.md
├── quickstart.md
├── tasks.md
└── implementation-notes.md   # created during /speckit-implement
```

### Source Code (repository root)

```text
packages/db/
├── src/schema/link-checks.ts                # NEW: link_checks + link_check_status
├── src/schema/index.ts                      # export
├── migrations/0013_link_checks.sql          # generated + item_search_text() replacement + search_text regen + preview index
└── migrations/down/0013_link_checks.sql

packages/shared/src/
├── links/constants.ts                       # NEW (subpath @gobbit/shared/links)
├── links/index.ts                           # NEW
├── schemas/payloads.ts                      # link preview + publicId?, width?, height?
├── schemas/item.ts                          # + linkHealth, list `flag`
└── package.json                             # exports "./links"

apps/api/src/
├── fetch/safe-fetch.ts                      # + accept: 'any' (2xx alive, HTML title read ≤ 256 KB)
├── fetch/link-preview.ts                    # NEW: toLinkPreview moved here (shared by lookup and ingest)
├── fetch/link-status.ts                     # NEW: classify(result, previewTitle) → ok|changed|definite|temporary
├── repositories/link-checks.repo.ts         # NEW: due(limit), upsert, flagsFor(ids), dismiss, flaggedPage
├── repositories/items.repo.ts               # + updatePayloadIf(id, updatedAt, payload); list filter join
├── repositories/assets.repo.ts              # orphan query + link preview reference
├── services/link-preview.service.ts         # exposes fetchPreview core (no rate limit) for the job
├── services/link-checks.service.ts          # NEW: checkOne, sweep, checkNow, dismiss
├── services/items.service.ts                # server-owned preview fields; enqueue snapshot; flag filter access
├── services/review.service.ts               # enqueue snapshot on publish
├── services/item-dtos.ts                    # + linkHealth via flagsFor
├── ingest/propose.ts                        # enqueue snapshot
├── ai/extract-validate.ts                   # link payload preview from normalized og
├── lib/rate-window.ts                       # + rateKeys.linkCheckUser
├── lib/mappers.ts                           # toItemDto(+ linkHealth)
├── routes/items.ts                          # + flag filter, POST /items/{id}/link-check, DELETE …/flag
├── jobs/queues.ts                           # + linkSnapshot, linkCheckSweep
├── jobs/link-snapshot-queue.ts              # NEW: enqueueIfNeeded(row)
├── jobs/link-snapshot.ts                    # NEW
├── jobs/link-check-sweep.ts                 # NEW
└── worker.ts                                # work link-snapshot (when Cloudinary) + schedule sweep
apps/api/scripts/links-snapshot-backfill.ts  # NEW (pnpm links:snapshot-backfill)
apps/api/test/
├── link-snapshot.int.test.ts                # NEW
├── link-checks.int.test.ts                  # NEW
├── media-sweep.int.test.ts                  # + link reference kept
├── search.int.test.ts                       # + preview.publicId not searchable
└── ingest-pipeline.int.test.ts              # + proposal has preview

apps/web/src/
├── cards/LinkCard.tsx                       # CloudImage for preview.publicId; health badge
├── cards/LinkHealthBadge.tsx                # NEW
├── items/CardActions.tsx                    # + Check again / Dismiss
├── api/items.ts                             # + checkLink, dismissLinkFlag, flag filter
├── routes/d.$slug.links.tsx                 # NEW "Links to check"
└── styles.css                               # badge
e2e/tests/full/links.spec.ts                # NEW
```

**Structure Decision**:

- Classification is a pure function (`fetch/link-status.ts`), so the state machine is unit-tested without HTTP.
- The service owns the state transitions, and the repository only reads and writes rows.
- The snapshot job reuses 012's `uploadFromUrl` and doesn't add a new store.

## Invariant → test traceability

| Invariant / rule | Enforced in | Test (file, tier) |
|------------------|-------------|-------------------|
| FR-001 snapshot after create, publish, URL/image change | `link-snapshot-queue.enqueueIfNeeded` + callers | `link-snapshot-queue.test.ts` (unit: cases); `link-snapshot.int.test.ts` (int: create → job → `preview.publicId`, asset `link_snapshot`) |
| FR-002 copy through `safe-fetch` limits | 012 `uploadFromUrl` | `link-snapshot.int.test.ts` (int: HTML at the image URL → no snapshot, card unchanged) |
| FR-003 ingest keeps the preview | `extract-validate` | `extract-validate.test.ts` (unit); `ingest-pipeline.int.test.ts` (int) |
| FR-004 render order: snapshot → remote → none | `LinkCard` | `LinkCard.test.tsx` (unit) |
| FR-005 never overwrites a newer edit | `items.repo.updatePayloadIf` + requeue | `link-snapshot.int.test.ts` (int: edit between load and write → edit kept, one requeue) |
| Server-owned snapshot fields | `items.service.update` | `items.int.test.ts` (int: client-sent `width` ignored; URL change drops `publicId`; foreign `publicId` → 422) |
| FR-006 not searchable | `item_search_text()` 0013 | `search.int.test.ts` (int: query for the public id → no hit; title still hits) |
| FR-007 bounded batch, 30 ± 3 days, published only | `link-checks.repo.due` + sweep | `link-checks.int.test.ts` (int: 120 due → 100 checked; proposed/archived skipped; `next_check_at` window) |
| FR-008 dead after two definite failures; temporary never | `link-status.classify` + `link-checks.service` | `link-status.test.ts`, `link-checks.service.test.ts` (unit: 404,404 → dead; 503,404 → not dead; 404,200 → ok) |
| FR-009 changed on title difference | `classify` | `link-status.test.ts` (unit: normalization cases) |
| FR-010 flag clears on ok; dismissal holds until status changes | `link-checks.service` | `link-checks.service.test.ts` (unit); `link-checks.int.test.ts` (int) |
| FR-011 readers see, editors act; 10/h; manual never sets dead | routes + service | `link-checks.int.test.ts` (int: reader 403 on POST/DELETE/filter; 11th → 429; manual 404 → still not dead) |
| FR-012 one request per host at a time | `link-checks.service.sweep` | `link-checks.service.test.ts` (unit: fake fetch records concurrency per host) |
| FR-013 no Cloudinary → no snapshots, checks still run | `worker.ts`, enqueue guard | `link-snapshot-queue.test.ts` (unit); `link-checks.int.test.ts` (int, no media store) |
| Orphan sweep keeps referenced link snapshots | `assets.repo.orphans` | `media-sweep.int.test.ts` (int) |
| `linkHealth` on every DTO path | `item-dtos.ts` | `items.int.test.ts`, `search.int.test.ts` (int) |
| Migration round-trips | 0013 + down | `pnpm db:rollback && pnpm db:migrate` in quickstart; `link-checks.int.test.ts` setup |

## Rollout

- **Migrations**:
  - `0013_link_checks` is reversible.
  - It regenerates `search_text`, a table rewrite of `items`. At current data sizes this takes seconds and runs in the normal deploy migrate step.
  - Search text values don't change, because no row has `preview.publicId` yet.
- **Env / config**: no new variables. README: the two jobs, the cadence and the backfill script.
- **API client**: `pnpm api:openapi` is needed (`linkHealth`, the filter, two routes).
- **Deploy order / flags**:
  - Deploy after 012.
  - After the deploy, run `pnpm links:snapshot-backfill` once on the deployed worker to copy existing previews.
  - The first sweep checks the 100 oldest cards the next morning. With no rows yet, all link cards are due, so the backlog drains at 100 a day.

## Risks

| Risk | Likelihood / impact | Mitigation |
|------|---------------------|------------|
| Sites block the checker (403/429), so links are flagged wrongly | M / M | 403 and 429 are temporary and never dead; 015 skips social hosts; the user agent identifies the app |
| A title "changed" flag is noisy on sites with dynamic titles | M / L | Normalization (case, spacing, punctuation, trailing site names after `|`/`–`); dismissal holds; tune in implementation-notes if noisy |
| Regenerating the search text column locks `items` briefly | L / L | Seconds at current size; runs in the deploy migrate step |
| The snapshot job races the editor | L / L | Conditional write + one requeue |
| Copyright of copied preview images | L / M | Only the page's own OG image, used for the card preview (the same use as showing it remotely); removed with the card by the sweep |
| The backfill floods the queue | L / L | Batches of 100 with a short pause; singleton per item |

## Settle before starting

- [ ] Confirm the user agent string for checks (today's `safe-fetch` UA, or one with a contact URL).
- [ ] Should "Links to check" be visible to editors, or only to owners and maintainers? The plan says `item.update` (editors included).
- [ ] Is the 100-per-day check budget acceptable for the deployed instance's outbound traffic?

## Complexity Tracking

None.
