# Implementation notes: 012-media-assets

Plan: `specs/012-media-assets/plan.md`, tasks: `tasks.md`. Branch `worktree-phase7-media` (all of Phase 7), from `main` at `d543480`.

One migration (`0012_media_assets`: `assets` table, `asset_source` enum, backfill, `items_image_public_id_idx`), no new env vars, no new dependencies. One new optional CI secret: `CLOUDINARY_API_SECRET` for the photo smoke (see Deviations).

## Bundle (T050)

| | Initial JS (gzip) |
| --- | --- |
| 012 | 113.7 KB (budget 150 KB) |

The confirm call (`api/media.ts`) and the extra upload state live only in the lazy `CardEditor` chunk (7.9 KB gzip); no new code in the initial chunk.

## Settled before starting

- **Verification uses Cloudinary's upload signature** (`sha1` of `public_id=…&version=…` + secret, the SDK's default algorithm), checked by `MediaStore.verifyResponse`. No Admin API call per confirm.
- **Sweep is database-driven** (D158): it never lists Cloudinary; it reads `assets` rows older than 7 days that no item (any status, deleted-in-window included) references.

## Decisions not specified by the plan

- **Separate `createSafeImageFetch`** instead of an `accept: 'image'` option on `safeFetch`: the image mode returns bytes, the HTML mode returns text; one function with a union result made both call sites worse. Both share the same guarded connection, redirects and timeouts.
- **Confirm answers 201 on first record and 200 on a repeat** (the upsert reports `created` via `xmax = 0`). An id already recorded for another deck is 422 "Image belongs to another deck".
- **Order of checks** on `POST /decks/{id}/media/assets`: access (`item.create`), then 503 without Cloudinary, then the rate limit (`rateKeys.mediaConfirmUser`, 60/user/hour), then signature, then folder, then the upsert.
- **D160 dimensions**: on create, update and publish the stored `width`/`height` come from the asset; an asset without dimensions (backfilled) drops them from the payload. Client-sent dimensions are never trusted.
- **Error paths use `path`** (`payload.publicId`, `signature`, `publicId`) like every other 422 in the API, not the JSON pointer `/payload/publicId` the task text used.
- **Sweep order**: delete in Cloudinary first, then the rows that came back `deleted` or `not_found`; a `failed` id keeps its row for the next run.
- **Deck delete**: `media.deleteForDeck` deletes the three prefixes after the soft-delete commits (logged, never fails the delete). The `assets` rows stay with the soft-deleted deck; the rows are harmless and cascade if the deck is ever purged.
- **Backfill `created_at = now()`**: backfilled images are referenced, so the grace period doesn't matter for them; if a card is later purged, its image gets a full 7 days.
- **`MemoryIngestUploads`** (test/dev store for ingest) reports fixed 800×600 dimensions.
- **`pnpm media:reconcile`** lists Cloudinary by tag (`resources_by_tag`) in the script only; the worker never lists. Dry run by default, `--delete` to remove unrecorded images.
- **`pnpm job:run <queue>`** is the dev helper that enqueues one named queue once (plan called it `run-job`).
- **Retry after a failed confirm** re-uploads the file; the first upload becomes an orphan that the sweep removes after 7 days.

## Deviations from the plan

- **T014**: the `use-image-upload` state machine (uploading → confirming → done, confirm failure → retry) is covered through `ImageFields.test.tsx` with injected deps, not a separate hook test.
- **T032**: the deck-delete prefix test lives in `apps/api/test/media-sweep.int.test.ts`, next to the other sweep tests, not in `decks.int.test.ts`.
- **T021 / e2e fixture**: an image card must now reference a recorded asset, so the fixture deck no longer seeds an image card (`samples/smoke/does-not-exist` would be refused). The photo smoke fakes only `api.cloudinary.com`; for the real API to accept the fake upload, the fake answer is signed with `CLOUDINARY_API_SECRET` when the env var is set. Without it the save test is skipped. **The repository secret `CLOUDINARY_API_SECRET` must be added** for the deployed smoke to cover the save.
- **`pnpm media:backfill-dimensions`** (optional in research) is not implemented: backfilled images render without a placeholder ratio until replaced, which 013 handles.

## Gates

- `pnpm lint`, `pnpm format:check`, `pnpm typecheck`: clean.
- `pnpm test:unit`: 243 files, 2207 tests passed.
- `pnpm test:int`: 46 files, 417 tests passed.
- `pnpm build:web && pnpm budget`: 113.7 KB gzip initial JS.
- T054/T055 (quickstart on the deployed instance, demo 1 tick) are left for after deploy.
