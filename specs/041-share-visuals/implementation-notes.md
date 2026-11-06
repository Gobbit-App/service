# Implementation notes: 041 Share visuals

Decisions the plan didn't make, and deviations from it. At close-out these were copied into
"Deviations from the 041 plan" in [`docs/design/links.md`](../../docs/design/links.md#deviations-from-the-041-plan).

## Decisions made while implementing

- **`login_wall` is a word test.** `lockedPreviewVerdict` removes the site name, then checks the
  known "unavailable" titles and a `LOGIN_WORDS` pattern (log in, sign in, sign up, join).
  Anything else that only names the site is `generic`.
- **A failed page fetch on a locked host is `fetch_failed`**, not a discard: there was no preview
  to judge.
- **The snapshot handler takes `ctx.jobId`** as a second argument, so its `link_preview.built` and
  `link_snapshot.image` events carry the job id like ingest's do.
- **`link_preview.applied`** compares the stored description with the page description to tell
  `page` from `caption`, because the validator returns only the final payload.
- **The backfill logic is `runImageBackfill` in `apps/api/src/jobs/link-image-backfill.ts`**. The
  script only wires the database, pg-boss and the logger, so the integration test drives the
  real function.
- **`createLinkCheckFetch` takes an optional guard** (`allowedPorts`, `isBlocked`), so the identity
  test can reach the loopback fixture server. Production calls it with none.
- **`queues.ts` gained a `startAfter` send option** for the backfill's per-host spacing.

## Deviations from the plan

- **The editor cache holds the answered preview only**, not the whole build. The route answers
  `{ preview }` and nothing else reads the rest.
- **Auto-published shares enqueue the snapshot without candidates.** The job builds once.
- **The backfill query returns a `memberEdited` flag** instead of excluding those rows, so the
  summary can count `skipped (member edits)`.
- **A card with `imageRemoved` makes the job return `skipped`** after it logs `member_choice`.
- **T009's link-check identity test lives in `link-preview.int.test.ts`** with the other identity
  tests, not in `link-checks.int.test.ts`.
- **The oEmbed integration test (T033)** rewrites youtube.com URLs to the fixture server through
  injected `safeFetch`/`fetchJson` wrappers. The endpoints stay hard-coded, so production has no
  override.
- **A locked-host wall card is still enqueued for a snapshot**, without candidates (T024 expected
  none). It has text, no image and no `imageLookup` stamp, so D350 sends the job once, and the job
  stamps it.
