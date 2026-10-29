# Implementation Plan: Media assets — registry, orphan cleanup and uploads from a URL

**Branch**: `012-media-assets` | **Date**: 2026-10-22 | **Spec**: [spec.md](./spec.md) | **Roadmap**: `PLAN.md` § Phase 7 (demo 1)

**Input**: Feature specification from `/specs/012-media-assets/spec.md`

Project override of the core template. Written for outside readers: the repository is public.

## Summary

The API records every stored image in an `assets` table: browser uploads after the editor confirms them, ingest uploads when they are stored, and remote copies. Image cards can only reference recorded images of their own deck, and they get server-owned dimensions. A daily pg-boss sweep deletes assets that no card references after 7 days. The candidates come from the database, never from listing the Cloudinary account (D156–D158, ADR-054). `media.service.uploadFromUrl` copies a remote image through a new binary mode of `safe-fetch` (D159). 014 builds on this to snapshot link previews, and Phase 13 MCP uses it for images proposed by URL.

## Starting point

- `main @ 8ff137c` (#40: upload-failure diagnostics, pino JSON logs). Latest migration: `0011_item_lifecycle`. Phase 6 (006–009) is merged, and its demos wait on deployed-instance runs.
- From [`008-card-media`](../008-card-media/plan.md):
  - `media.service.signUpload` (D133, ADR-051): folder `gobbit/items/<deckId>`, tags `editor` and `deck:<deckId>`;
  - `media/sign-upload.ts` and `media/cloudinary-check.ts` (boot ping, #40);
  - `POST /decks/{id}/media/upload-failures` (log only, #40);
  - `services/media-wiring.ts` (`buildMediaServices`).
  `imagePayloadSchema` is `{ publicId, alt }` (strict). No server check ties `publicId` to an upload today.
- Ingest: `media/ingest-uploads.ts` (`IngestUploadStore.upload` → `cloudinary.uploader.upload(dataUri, { folder: gobbit/ingest/<deckId>, tags: [ingest, job:<id>] })`, `deleteForJob` by tag, `MemoryIngestUploads` for tests), called from `ingest.service.ts`. `prune-ingest-jobs` deletes the uploads of failed and discarded jobs.
- Lifecycle: `prune-deleted-items` (D132) purges cards that were soft-deleted more than 30 days ago, weekly (Sunday 05:00). Their images stay in Cloudinary today.
- Outbound: `fetch/safe-fetch.ts` (ADR-048) accepts **HTML content types only** and returns `{ html, error }`. There is no binary mode.
- Worker: `jobs/queues.ts` (`QUEUES`), `worker.ts` (`boss.schedule(QUEUES.x, CRON)`), with crons in `@gobbit/shared` constants.
- `item_search_text()` (0009) already strips the image `publicId` from search text.

## Technical Context

**Language/Version**: TypeScript (strict, ESM, no build step) on Node ≥ 22

**Primary Dependencies**: Hono + `@hono/zod-openapi`, Drizzle, pg-boss, `cloudinary` (existing: `verify_api_response_signature`, `uploader.upload`, `api.delete_resources`), `undici` through `safe-fetch`. No new dependencies.

**Storage**: PostgreSQL 17 with a new `assets` table and an `asset_source` enum (see [data-model.md](./data-model.md)); Cloudinary

**Testing**: Vitest unit; integration with Testcontainers and a fake Cloudinary (`MemoryMediaStore`); Playwright `@smoke`

**E2E tier**: smoke — the change sits on the photo upload journey (sign → upload → confirm) and crosses a third-party boundary (constitution V). The sweep and reconcile paths are integration-tested only

**Target Platform**: Docker Compose on Dokploy; the worker runs the sweep

**Project Type**: pnpm monorepo — API + worker, PWA, shared packages

**Performance Goals**: the sweep handles 500 assets per run in under a minute; confirming an upload adds less than 300 ms after the upload finishes

**Constraints**: outbound fetches only through `safe-fetch`; works without `CLOUDINARY_URL`; the sweep never deletes anything this database didn't record; the web change stays in the lazy editor chunk

**Scale/Scope**: tens of uploads a day; low thousands of assets per deployment

## Constitution Check

| Principle | How this plan complies |
|-----------|------------------------|
| I. Layered API | `routes/media.ts` parses the input. `media.service` (`confirmUpload`, `uploadFromUrl`, `deleteForDeck`) and `items.service` (the reference rule) hold the rules. `assets.repo.ts` holds the SQL, including the orphan query. The `media-sweep` job calls `media.service.sweepOrphans` |
| II. One source of truth | The DTOs and limits are in `@gobbit/shared/media` and `/media-constants`. The payload change is in `payloads.ts`. `pnpm api:openapi` runs for the new route and the 422 |
| III. Invariants in the DB | `public_id` UNIQUE, dimension CHECKs, FK cascade on decks, migration with a down file. The "same deck" reference rule lives in the service, because it reads across jsonb |
| IV. Private by default | `uploadFromUrl` goes only through `safe-fetch` (binary mode, same IP guard). The confirmation is signature-verified and folder-scoped per deck. The API secret is never returned. The sweep is scoped to this database |
| V. Tests at the right tier | Unit (signature and folder check, binary safe-fetch, sweep batching), integration (route, reference rule, sweep against all statuses, migration backfill), e2e (editor upload still works); traceability below |
| VI. Lean web | The only web change is the confirmation step in `use-image-upload.ts`, in the lazy editor chunk. Initial bundle unchanged |
| VII. Simple, optional | No new dependency. Without `CLOUDINARY_URL` the sweep isn't scheduled and the routes answer 503. No AI key involved |

No violations.

## Decisions this plan pins down

Full reasoning in [research.md](./research.md).

| ID | Decision | ADR? |
|----|----------|------|
| D156 | `assets` table (`deck_id`, unique `public_id`, `source`, dimensions, `bytes`, `format`, `uploaded_by`, `created_at`); no `item_id`; references derived from payloads | yes → **ADR-054** |
| D157 | Editor confirms uploads at `POST /decks/{id}/media/assets` (verified signature, folder per deck, `item.create`, 60/user/hour); ingest records its uploads server-side | no |
| D158 | Daily `media-sweep`: assets older than 7 days that no item row references in any status, deleted in Cloudinary in chunks of 100, max 500 per run; never lists the account; `media:reconcile` is a dry-run report for uploads made before 012 | yes → **ADR-054** |
| D159 | `media.service.uploadFromUrl` with a `safe-fetch` binary mode (image MIME allow-list, 8 MB, magic-byte check), server-side upload, records the asset; no route | no |
| D160 | Image `publicId` must be a recorded asset of the same deck (422 otherwise); `width` and `height` are optional server-owned payload fields | no |

## Project Structure

### Documentation (this feature)

```text
specs/012-media-assets/
├── spec.md
├── checklists/requirements.md
├── plan.md
├── research.md
├── data-model.md
├── contracts/media-assets.md
├── quickstart.md
├── tasks.md
└── implementation-notes.md   # created during /speckit-implement
```

### Source Code (repository root)

```text
packages/db/
├── src/schema/assets.ts                 # NEW: assets + asset_source
├── src/schema/index.ts                  # export
├── migrations/0012_media_assets.sql     # generated + backfill + items_image_public_id_idx
└── migrations/down/0012_media_assets.sql

packages/shared/src/
├── media/constants.ts                   # + grace, cron, batch, chunk, confirm rate, dimension max
├── schemas/media.ts                     # + mediaAssetConfirmRequestSchema, mediaAssetSchema
└── schemas/payloads.ts                  # image + width?, height?

apps/api/src/
├── fetch/safe-fetch.ts                  # + accept: 'image' mode → { bytes, contentType }
├── fetch/image-sniff.ts                 # NEW: magic bytes (jpg/png/webp/heic)
├── repositories/assets.repo.ts          # NEW: record/upsert, byPublicId, orphans(grace, limit), deleteByIds
├── media/media-store.ts                 # NEW: Cloudinary adapter (uploadBuffer, deleteMany, deleteByPrefix, verifyResponse) + MemoryMediaStore
├── services/media.service.ts            # + confirmUpload, uploadFromUrl, sweepOrphans, deleteForDeck
├── services/media-wiring.ts             # wire assets repo + media store
├── services/items.service.ts            # D160 reference rule + dimensions on create/update
├── services/review.service.ts           # same rule on publish
├── services/ingest.service.ts           # record ingest uploads
├── services/decks.service.ts            # deleteForDeck after commit
├── lib/rate-window.ts                   # + rateKeys.mediaConfirmUser
├── routes/media.ts                      # + POST /decks/{id}/media/assets
├── jobs/queues.ts                       # + MEDIA_SWEEP
├── jobs/media-sweep.ts                  # NEW
└── worker.ts                            # schedule when CLOUDINARY_URL is set
apps/api/scripts/media-reconcile.ts      # NEW: dry-run report (pnpm media:reconcile)
apps/api/test/
├── media-assets.int.test.ts             # NEW
├── media-sweep.int.test.ts              # NEW
└── items.int.test.ts                    # + reference rule

apps/web/src/editor/use-image-upload.ts  # + confirming step
apps/web/src/api/media.ts                # + confirmAsset
e2e/tests/smoke/editor.spec.ts           # image happy path asserts the asset was confirmed
```

**Structure Decision**: Cloudinary calls move behind a small `media-store.ts` port, so the sweep, confirmation and remote upload can be tested with an in-memory store, the way `MemoryIngestUploads` is used for ingest. The ingest store keeps its own interface and only gains the recording call.

## Invariant → test traceability

| Invariant / rule | Enforced in | Test (file, tier) |
|------------------|-------------|-------------------|
| FR-001 one asset row per stored image, unique `public_id` | DB UNIQUE + `assets.repo` upsert | `media-assets.int.test.ts` (int) |
| FR-002 confirmation verifies the signature, folder and `item.create` | `media.service.confirmUpload` | `media.service.test.ts` (unit); `media-assets.int.test.ts` (int: 201/200/403/404/422/429/503) |
| FR-003 ingest uploads recorded | `ingest.service` | `ingest.int.test.ts` (int: proposal with an image → asset row, `source = ingest`) |
| FR-004 unknown or foreign `publicId` refused | `items.service`, `review.service` | `items.int.test.ts` (int: 422 create/update, other deck's asset); `review.int.test.ts` (int) |
| FR-005 server-owned dimensions | `items.service` | `items.int.test.ts` (int: client 1×1 → stored asset dimensions) |
| FR-006 orphans past the grace period deleted, referenced kept (all statuses) | `assets.repo.orphans` + `sweepOrphans` | `media-sweep.int.test.ts` (int: proposed, published, archived, deleted-in-window kept; purged and never-saved deleted; young kept) |
| FR-007 never lists the account | `media-store` has no list call in the sweep path | `media-sweep.test.ts` (unit: the store spy sees only `deleteMany` with recorded ids) |
| FR-008 batches, `not_found` = deleted, failures kept, summary logged | `sweepOrphans` | `media-sweep.test.ts` (unit) |
| FR-009 remote copy through the guard, type and size limits | `safe-fetch` binary mode + `uploadFromUrl` | `safe-fetch.test.ts` (unit: image MIME, magic bytes, cap, private IP); `media-assets.int.test.ts` (int: fixture server; HTML → `not_image`; 9 MB → `too_large`) |
| FR-010 no Cloudinary → 503, no schedule | `media.service`, `worker.ts` | `media-assets.int.test.ts` (int); schedule helper test in `jobs/media-sweep.test.ts` (unit) |
| FR-011 backfill protects existing references | `0012_media_assets.sql` | `media-sweep.int.test.ts` (int: image items inserted without asset rows → backfill statement → rows exist → sweep deletes none) |
| FR-012 delivery transformation unchanged | `cards/cloudinary.ts` | existing `cloudinary.test.ts` (unit) |
| Deck delete removes its folders | `decks.service` → `deleteForDeck` | `decks.int.test.ts` (int, MemoryMediaStore prefixes) |

## Rollout

- **Migrations**: `0012_media_assets`, reversible (the down file drops the index, table and enum). It backfills one asset row per referenced image `publicId`. It is fast for the current data size and runs in the deploy's normal migrate step.
- **Env / config**: no new variables. `CLOUDINARY_URL` now also enables the sweep and confirmation. README: describe the sweep, the 7-day grace period and `pnpm media:reconcile`.
- **API client**: `pnpm api:openapi` is needed (new route, new 422 on items).
- **Deploy order / flags**:
  - API and web deploy together.
  - An older web build that doesn't confirm uploads produces image saves that fail with 422 until it reloads. The PWA update prompt covers this. If that turns out to be too abrupt, accept unconfirmed `gobbit/items/<deckId>/` ids for one release by calling the Admin API on save (see Risks).
  - The first sweep runs the day after deploy and has nothing to delete until assets are 7 days old.

## Risks

| Risk | Likelihood / impact | Mitigation |
|------|---------------------|------------|
| A bug in the orphan query deletes images in use | L / H | Integration test across all statuses; the sweep logs counts; the batch cap limits the damage of a single run; Cloudinary backups if enabled on the account |
| A stale PWA saves images without confirming them → 422 | M / M | Confirmation lands with the same web release; the editor turns a 422 "Unknown image" into "upload again"; optional one-release fallback (Rollout) |
| A shared dev/prod Cloudinary account | M / H | The sweep is DB-driven (D158); `deleteForDeck` uses UUID prefixes; the reconcile script is dry-run by default |
| Admin API rate limits during a large sweep | L / L | 100 ids per call, max 500 per run |
| A remote URL serves an HTML page with an image extension | M / L | Content type plus magic-byte check |
| Deleting a deck while Cloudinary is down leaves folders behind | L / L | Logged; the reconcile report lists them |

## Settle before starting

- [ ] Does production share its Cloudinary account with development or CI? This settles whether `media:reconcile` must stay dry-run only. Either way, the default sweep is safe.
- [ ] Confirm that the Admin API `delete_resources` quota on the current plan covers 5 calls a day.
- [ ] Is Cloudinary backup on, as a safety net for the first sweeps? Optional.

## Complexity Tracking

None.
