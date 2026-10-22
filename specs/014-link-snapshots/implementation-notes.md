# Implementation notes: 014-link-snapshots

Plan: `specs/014-link-snapshots/plan.md`, tasks: `tasks.md`. Branch `worktree-phase7-media` (all of Phase 7), on top of 013 (`e4baaa3`).

Migration `0013_link_checks` (+ hand-written down, round trip checked). Two queues: `link-snapshot`, `link-check-sweep`. No new env var or dependency.

## Bundle

| | Initial JS (gzip) |
| --- | --- |
| 013 | 113.7 KB |
| 014 | 113.9 KB (budget 150 KB) |

`LinkHealthBadge` and `LinkCheckButtons` are in the initial chunk (cards and actions render on the deck page); "Links to check" is a lazy file route.

## Decisions not specified by the plan

- **`fetchLinkPreview`** (`fetch/link-preview.ts`) is the rate-limit-free core shared by the editor lookup and the worker. The worker builds it from `safe-fetch` + `extract-page` directly, so it doesn't need the service's LRU or rate window.
- **`link-preview-fields.ts`** holds the server-owned field rules (`previewFields`): keep the stored snapshot, drop it on URL/image change only for `link_snapshot` assets. A client that omits `publicId` keeps the stored one.
- **The snapshot queue reaches services through `MediaWiring`** (`resolveLinkSnapshotQueue`), a no-op without `CLOUDINARY_URL`; the check fetch through `resolveLinkCheckFetch`.
- **The check sweep is always scheduled** in the worker, independent of Cloudinary and AI keys (`scheduleLinkCheckSweep`).
- **The backfill** pages with a keyset query (`items.repo.linkSnapshotCandidates`) instead of offsets.
- **Web**: a stored snapshot that fails to load falls back to the remote `preview.image`, then to no image. `belongsTo('links')` returns `null` for flagged cards (the list is ordered by `flaggedAt`, which the client doesn't know), so the refetch places them.

## Deviations from the plan

- **T007/T043**: the flagged listing is `items.repo.listLinkFlagged` (reusing list visibility and DTO mapping), not `link-checks.repo.flaggedPage`. `checkLink` / `dismissLinkFlag` live in `items.service` (role, visibility and "live" checks in one place); the probe and state rules are in `link-checks.service`.
- **D164 state**: a first definite failure keeps the previous status (a new row starts `ok`) with `consecutive_failures = 1`; the sweep summary adds `failing` for those.
- **T021**: job outcomes are `written`, `unchanged`, `requeued`, `superseded`, `skipped`; the requeue reuses the item's `singletonKey`.
- **T022**: snapshots are also enqueued on restore and undelete (an archived card is skipped by the job). The queue is optional in `proposeItem`, ingest and review. Review publish reloads the row once after publishing to enqueue from the stored payload.
- **T023**: the OG preview is attached only when the extracted URL equals the shared URL.
- **T004**: `linkPreviewSchema` (the editor lookup answer) omits the server-owned fields; the payload schema has them.
- **T046**: there is no deck menu; "Links to check" is a chip in `ChipRow` next to Archived, shown for `item.update`.
- **T042**: the full tier (011) has no seeding helper yet, so `e2e/tests/full/links.spec.ts` seeds the flag at the network layer (`page.route` adds `linkHealth`, answers `flag=link` and the dismiss). Everything else is the real API. `WEB_SPECS` in `e2e/playwright.config.ts` includes `links`.

## Gates

See the PR for the final gate run.

T054 (PLAN.md demo tick), T055 (quickstart on the deployed instance) and T056 (converge) are left for after deploy.
