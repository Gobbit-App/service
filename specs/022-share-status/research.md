# Research: Share status and auto-publish for publishers

Decisions continue the project-wide D numbering. This feature owns **D192–D199**. D192 and D193 change who may publish a card and become **ADR-058**, together with the constitution amendment to principle IV (1.1.1 → 1.2.0).

## What exists today

- `POST /ingest` creates a `queued` job and enqueues it. The worker runs claim → normalize → extract → `proposeItem` (a `proposed` card by the sharer, D109) → dedup (D103). `fail()` writes `ingest_jobs.error` (free text: `raw_missing`, `sharer_gone`, `sharer_not_member`, `invalid_output: …`, provider messages, `error: <message>`) and logs nothing. A retried attempt logs one line that includes the error message.
- `GET /ingest/{id}` is a debug view (raw, normalized, cost) for the sharer or a deck publisher. There is no list of a member's shares.
- Review (`review.service`): `publish` checks the D160 image reference, merges or publishes in one transaction, writes a `published` event (D187, actor via `session`), marks the job `published` with `reviewedBy`, then purges the public page cache, enqueues the embedding and snapshots the link.
- The web review pill (D107) returns nothing when the count is 0. `ShareSent` promises "it'll appear in Review".
- `decks` has `is_public` (owner-only, D176) and `is_default` (personal deck, fixed visibility).
- Retention (D94): `raw` and `normalized` are kept 30 days. `prune-ingest-jobs` deletes uploads of failed and discarded jobs after that.

## D192 — Deck setting `auto_publish_shares`

- **Decision**: a new column `decks.auto_publish_shares boolean NOT NULL DEFAULT false`.
  - The migration sets it to `true` for every personal deck (`is_default`), and `decksRepo` creates personal decks with `true`.
  - `PATCH /decks/{id}` accepts `autoPublishShares`. Only `owner` may change it (the same rule and `ownerRequired()` problem as `isPublic`, D176). Unlike `isPublic`, the personal deck may change it.
  - The deck DTO exposes it to every member. The web shows it only in settings, which maintainers see read-only.
- **Rationale**: one boolean on the deck matches the "deck switch" pattern of `is_public`. Owner-only follows the spec: maintainers can publish but don't decide how publishing works for the whole deck.
- **Alternatives considered**:
  - A per-member preference ("publish my shares"): every publisher would opt in separately, and owners lose control over their deck.
  - A `deck_settings` key-value table: more machinery for a second boolean.
  - Default on for every deck: changes behaviour for existing shared decks without anyone choosing it.

## D193 — When a share is published directly, and how

- **Decision**: after `proposeItem`, the worker calls `autoPublish(job, proposal)` (`apps/api/src/ingest/auto-publish.ts`).
  - It runs only for share channels (`pwa`, `shortcut`, `paste`, `email`) on decks with `auto_publish_shares`.
  - It then checks, in order, and records the outcome in the new column `ingest_jobs.auto_publish`:
    1. The sharer's role **now** has `item.publish`. Otherwise → `held_not_publisher`.
    2. The extraction chose at least one existing category (`summary.categoryIds` non-empty). A default-category fallback or a suggested new category doesn't count. Otherwise → `held_needs_category`.
    3. The dedup verdict exists and its action is `new`. `possible_duplicate` or `update` → `held_duplicate`. No verdict (dedup errored) → `held_duplicate_check_failed`.
    4. Publish through `publishProposal()`, extracted from `review.service.publish`'s `new` path into `apps/api/src/review/publish-proposal.ts` and used by both: D160 image check, `status: published` and `verifiedAt`, a `published` event, and the job set to `published` with `reviewedBy = sharer` and `reviewedAt`, all in one transaction. After commit: embedding and link snapshot.
  - Outcomes: success → `published`. A thrown error → `held_publish_failed`; the proposal stays in review, the job stays `proposed`, and a warning is logged.
  - The event's actor is the sharer, with `via: 'ingest'`, so the activity log shows "published · via share/import", the same badge as the proposal line (D187).
  - With the setting off, or for MCP and import channels, `auto_publish` stays `NULL`.
- **Rationale**:
  - Every gate matches a reason a reviewer would stop and look: rights, category and duplicate.
  - One publish routine keeps "nothing downstream can tell the two apart" (FR-012) true by construction.
  - A failed auto-publish never fails the share, because the proposal already exists and review is the safe fallback.
  - Re-checking the role at processing time covers a role removed after sharing (US3-5).
- **Alternatives considered**:
  - Create the card as `published` directly in `proposeItem`: the dedup verdict is only known after the row exists, and the D160 and event paths would be duplicated.
  - Call `reviewService.publish` from the worker: that needs a `CurrentUser` and session actor, and its 409 on non-proposed items is review semantics.
  - Treat the default-category fallback as "has a category": it's a placeholder, and the spec says no category → review.
- **Public page cache**: the worker can't purge the API's in-process page cache (D180). A directly published card shows on a public deck's pages within the cache TTL (5 min). This is accepted; recorded as a risk.

## D194 — Failure reason codes

- **Decision**: a closed list in `@gobbit/shared/ingest`, stored in the new column `ingest_jobs.failure_code` (text, CHECK in list, NULL unless `failed`). `error` keeps the detail for the debug view.
  - `content_expired`: raw missing.
  - `sharer_left`: sharer gone or not a member.
  - `fetch_failed`: the source couldn't be fetched (safe-fetch or normalize error).
  - `unreadable_answer`: invalid model output, no `propose_card` call.
  - `assistant_unavailable`: provider error on the last attempt.
  - `image_unavailable`: an uploaded image couldn't be read.
  - `unknown`.
  - The worker classifies at the point of failure with a pure `classifyFailure(err | code)` in `apps/api/src/ingest/failure-code.ts`.
  - The migration backfills existing failed rows from their `error` prefix (`raw_missing` → `content_expired`, `sharer_*` → `sharer_left`, `invalid_output:` → `unreadable_answer`, else `unknown`).
  - The web maps codes to plain sentences in `apps/web/src/shares/failure-copy.ts`. An unknown code → "Something went wrong".
- **Rationale**: a DB-checked code is a stable contract between worker and UI. Matching free-text error messages at read time breaks whenever a library rewords an error. The detail stays for operators.
- **Alternatives considered**:
  - Derive the code from `error` at read time: brittle, as above.
  - Replace `error` with the code: loses the detail the debug view and operators need.

## D195 — Failure log lines

- **Decision**: `fail()` writes one pino `error` line (`childLogger('ingest')`) with fields `{ jobId, deckId, channel, attempts, failureCode }` and the message "ingest job failed". The retry warning becomes `{ jobId, attempts, failureCode }` "ingest attempt failed, will retry", without the error message. The message can contain a URL or a provider echo of the content, and FR-009 forbids both.
- **Rationale**: one structured line per final failure is what the production incident lacked. Codes are safe to log; free text isn't guaranteed to be.
- **Alternatives considered**: log `error` truncated (may contain shared links); log on every attempt at error level (noise; retries are expected).

## D196 — Shares API

- **Decision**: three routes under `routes/shares.ts` → `shares.service.ts` → `ingestJobsRepo`.
  - `GET /decks/{id}/shares`: the caller's own jobs on that deck. Share channels only (excludes `mcp`, `import`). Created in the last `INGEST_RAW_RETENTION_DAYS` (30). Newest first, at most 50 (`SHARES_LIST_LIMIT`). Needs `deck.read`; a deck the caller can't see → 404.
  - `GET /shares/{id}`: one summary; for the "Sent" screen.
  - `POST /shares/{id}/retry`: see D197.
  - Only the sharer can see their shares. Anyone else → 404, publishers included (they keep `GET /ingest/{id}`).
  - DTO `ShareSummary`:
    - `id`, `deckId`, `channel`, `createdAt`;
    - `state` (`processing` | `failed` | `in_review` | `published` | `not_added`), derived from job status, with `queued` and `running` → `processing`;
    - `preview`: `{ title | host | photoCount }`, taken from `raw.title`, the extraction or result item's title, the URL host, or the number of images, and never the shared text;
    - `failureCode`, `canRetry`, `autoPublish`;
    - `item`: `{ id, title, deleted }` or null;
    - `reviewedBy`: `{ displayName }` or null, and `reviewedAt`.
- **Rationale**: a sharer-scoped, content-free summary is safe to cache offline and to poll. `GET /ingest/{id}` stays the operator and publisher debug view (raw, normalized, cost), which a list shouldn't expose.
- **Alternatives considered**:
  - Extend `GET /ingest/{id}` and add `GET /ingest?deck=`: mixes the debug DTO (raw content, cost) into a member-facing list.
  - Let publishers list everyone's shares: not asked for, and review already shows proposals. Failed shares of others stay operator-only (logs, debug view).
- **Readers**: they can't share (`item.create`), so the "Your shares" link shows for roles with `item.create`. Spec FR-008 now reads "every member who can share to the deck".

## D197 — Retry in place

- **Decision**: `POST /shares/{id}/retry` resets the same job and re-enqueues it.
  - **Allowed when**: caller is the sharer, `status = failed`, `raw IS NOT NULL`, the sharer still has `item.create` on the deck, `retry_count < SHARE_MAX_RETRIES` (3), and the caps allow it.
  - **Reset**: `status queued`, `attempts 0`, `error`, `failure_code`, `finished_at` and `auto_publish` → NULL, `retry_count + 1`, `retried_at now`.
  - **Responses**: 202 with the summary. 409 if not failed; 410 `/problems/share-expired` when raw is gone; 429 when capped.
  - **Caps**: `countByUserSince` counts jobs with `created_at ≥ since OR retried_at ≥ since`, so a retry uses a slot in the channel and combined caps like a new share. Repeated retries of one share are bounded by `SHARE_MAX_RETRIES` rather than by counting each one.
  - **Concurrency**: the reset is a conditional update (`WHERE status = 'failed'`), so a double tap re-enqueues once.
- **Rationale**: the spec requires "the same share". Images are tagged with the job id (`job:<id>`) and pruned per job, so a copied job would share uploads with a failed one, and pruning the old job would delete the new card's images.
- **Alternatives considered**:
  - A new job copied from the old one: the upload ownership problem above.
  - Count each retry exactly (a `share_retries` table): more state than a household-scale cap needs.

## D198 — Web: "Your shares", review entry, "Sent"

- **Decision**:
  - **Route `/d/$slug/shares`**: `apps/web/src/routes/d.$slug.shares.tsx` with a `shares/` folder (`SharesScreen`, `ShareRow`, `share-state.ts`, `failure-copy.ts`, `shares-queries.ts`).
    - The query refetches every 3 s while any row is `processing` (TanStack `refetchInterval` returning false otherwise) and is persisted for offline like other deck queries.
    - "Try again" calls retry. "Paste it again" links to `/share?deck=<slug>`, or for email says to forward it again.
    - Offline disables both actions.
  - **Deck header**: `SharesLink` for `item.create` roles. `ReviewPill` is always shown to publishers, labelled "Review" with the count only when > 0.
  - **`ReviewQueue` empty state**: links to "Your shares".
  - **`ShareSent`**: takes the job id from the submit response and polls `GET /shares/{id}` with the same interval. It shows the live state and a link to "Your shares", and drops the promise of review.
  - **Deck settings**: `DeckSection` gains a "Publish shares from publishers directly" switch. It is editable for `owner` and disabled with a "Only owners can change this" hint for maintainers.
- **Rationale**: polling with a short interval is the existing pattern (no SSE or WebSocket infrastructure exists), and only runs while something is processing. The route is code-split (`autoCodeSplitting`), so the initial bundle gains only the header link.
- **Alternatives considered**: server-sent events (new infrastructure for one screen); a global shares page across decks (the spec places it in the deck).

## D199 — E2E tier

- **Decision**: **smoke**, because the change touches the share submit and review journeys (constitution V).
  - **Smoke**, nothing faked inside Gobbit:
    - a publisher with an empty queue sees "Review", opens the empty queue and follows the link to "Your shares";
    - an editor sees "Your shares" but no review entry.
    - The existing paste smoke test keeps stubbing `POST /ingest` (no extraction provider in e2e) and now asserts the "Sent" screen links to "Your shares" rather than promising review.
  - **Full**:
    - the shares list states (processing → failed → retry, in review, published, not added) with `GET /decks/*/shares` and `GET /shares/*` stubbed at the page edge;
    - the deck setting switch: owner toggles it, maintainer sees it disabled.
  - The pipeline itself (gates, failure codes, retry, log line) is covered by unit and integration tests with fake extraction, since e2e has no extraction provider.
- **Regression for the production incident**: an integration test fails a job on its last attempt (provider error). It checks that the sharer's list shows `failed` with `assistant_unavailable` and `canRetry`, and that exactly one error line with no shared content is logged. This is the tier that would have caught "failed silently".
