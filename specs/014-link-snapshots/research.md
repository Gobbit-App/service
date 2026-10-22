# Research: Link snapshots and link checks

Decisions continue the project-wide D numbering. Phase 7 reserves D156–D173. This feature owns **D163–D165** and records them in **ADR-055**.

## Where link previews come from today

- **Editor** ([`008-card-media`](../008-card-media/research.md), D134): `GET /decks/{id}/link-preview?url=` uses `link-preview.service.lookup`:
  - It goes through `safe-fetch` → `extract-page` → `toLinkPreview` and returns `{ title?, description?, image? }`.
  - There is a per-user rate limit (30/hour) and a shared LRU cache.
  - The editor writes the result into `payload.preview`.
- **Ingest** (Phase 5):
  - `normalize-raw` fetches the shared URL, and `buildNormalizedSource` keeps `og` for the extractor.
  - `extract-validate` then builds a link payload as `{ url }` only.
  - So shared links have **no preview** at all.
- **Rendering**: `LinkCard` loads `preview.image` straight from the remote site on every view. This means:
  - the reader's IP and referrer go to the third party;
  - hotlink protection or a redesign breaks the card;
  - the image is not cacheable offline beyond the browser cache.
- **Search**: `item_search_text()` (0009) indexes every string in a link payload (`url`, `preview.*`). A stored `publicId` would be indexed too.

## D163 — `link-snapshot` job

- **Decision**: a pg-boss queue `link-snapshot` with data `{ itemId }`, `singletonKey: itemId`, retries 2 with backoff.
  - **When it is enqueued** (after commit, like `embedQueue.enqueueIfStale`), through `linkSnapshotQueue.enqueueIfNeeded(row)`. It is enqueued when the row is a live link card (`proposed` or `published`) and either:
    - `preview.image` is set and `preview.publicId` is not; or
    - the preview has no title, description or image yet.

    It is called from `items.service.create`/`update`, `review.service.publish`, and `ingest` `proposeItem`.
  - **Server-owned fields**:
    - On update, when the incoming `url` or `preview.image` differs from the stored one, the service drops `preview.publicId`/`width`/`height` if that `publicId` is a `link_snapshot` asset, so the job copies the new image. A photo a member added (`editor` or `ingest` asset, 015) is kept.
    - Otherwise the stored `publicId`/`width`/`height` win over anything the client sends.
    - A client-sent `preview.publicId` is accepted only under 012's D160 rule (a recorded asset of the same deck), which 015's "Add photo" uses. 014's own web code never sends one.
  - **Job steps**:
    1. Load the row. Stop if it's gone, not a link, or not live.
    2. If the preview is empty, fill it with `linkPreview.fetchPreview(url)`. This is the service's internal core, without the per-user rate limit, through the shared LRU.
    3. If `preview.image` is set and image storage is configured, call `media.uploadFromUrl({ deckId, url: preview.image, source: 'link_snapshot' })` (012, D159). The folder is `gobbit/links/<deckId>` and the tags are `link_snapshot` and `deck:<deckId>`.
    4. Write the new preview with `items.repo.updatePayloadIf(itemId, expectedUpdatedAt, payload)`. It is conditional on `updated_at`.
    5. If the row changed meanwhile, re-enqueue once (`attempt` in the job data), then give up. The asset that was just made becomes an orphan, which the sweep removes after 7 days.
    6. On success, `embedQueue.enqueueIfStale(itemId)`: a filled title or description changes the searchable text.
  - **Failures** (`blocked`, `not_image`, `too_large`, `unavailable`) are logged at info level. No error is surfaced to users, and the card keeps its remote image.
  - `verified_at` is not touched.
- **Rationale**:
  - The copy needs outbound I/O and image storage, so it can't sit inside the request.
  - The job pattern, the after-commit enqueue and the conditional write match how embeddings already work (ADR-041–043).
  - Deriving "needs a snapshot" from the payload avoids a status column.
  - The `updated_at` guard stops a slow job from overwriting a member's edit.
- **Alternatives considered**:
  - **Cloudinary remote fetch** (`upload(url)`, or delivery-time `fetch/` URLs): this sends Cloudinary to arbitrary third-party URLs outside `safe-fetch`'s IP guard (constitution IV, ADR-048), and delivery-time fetch also re-fetches on cache misses.
  - **Snapshot in the request** (editor save waits for the copy): it slows down the save, and ingest and publish would need the same.
  - **A `snapshot_status` column**: more state to keep in sync, for no gain over checking whether the payload has a `publicId`.
  - **Copying at lookup time in the editor** (before saving): this creates assets for previews that are never saved. The sweep would clean them up, but it's waste.

### Ingest keeps the preview

`extract-validate` builds `payload.preview` from the normalized source's `og` (`title`, `description`, `image`). It uses the same clipping as `toLinkPreview`, which moves from `link-preview.service.ts` to `fetch/link-preview.ts` so both callers share it. `proposeItem` then enqueues the snapshot. With the extractor off, direct proposals (`ingest-direct-draft`) only get the URL, and the job fills the preview.

### Search text

Migration `0013` replaces `item_search_text(t, title, body, payload, entities)`. Its `CASE` gets `WHEN 'link' THEN payload #- '{preview,publicId}'`. `width` and `height` are numbers, so the `string` filter already skips them.

The function feeds a generated column, so `search_text` and `items_search_trgm_idx` are dropped and re-added, as 0009 did.

No existing row has `preview.publicId`, so search text, hashes and embeddings don't change.

## D164 — `link_checks` and the daily check sweep

- **Decision**: a table `link_checks`, with one row per link item, created on the first check (see [data-model.md](./data-model.md)). It has a daily cron queue `link-check-sweep` (`LINK_CHECK_CRON = '30 6 * * *'`, after `media-sweep` at 06:00). Each run:
  1. **Select due items**:
     - published live link cards whose check row is missing, or whose `next_check_at ≤ now()`;
     - ordered by `next_check_at NULLS FIRST, item id`;
     - limited to `LINK_CHECK_BATCH = 100`.
  2. **Probe** them grouped by host: one request per host at a time, with hosts handled in parallel up to 4.

     The probe uses `safe-fetch` in a new mode, `accept: 'any'`. It follows redirects as today and reads at most `LINK_CHECK_READ_BYTES = 256 KB`. For HTML, it extracts the `<title>`/OG title with `extract-page`.
  3. **Classify the result**:

     | Result | Class |
     |--------|-------|
     | 2xx | `ok`; `changed` if the normalized title (`search_normalize`-like: case, spacing, punctuation) differs from the normalized `preview.title`, and both exist |
     | 404, 410, DNS failure, connection refused, `blocked` (private IP after a redirect) | definite failure |
     | timeout, 5xx, 429, 403, `too_many_redirects` | temporary failure |

  4. **Update the row**:
     - Definite failure: `consecutive_failures += 1`. The status becomes `dead` when it reaches `LINK_CHECK_DEAD_AFTER = 2`. Until then the previous status is kept.
     - Temporary failure: no change to `consecutive_failures`, and the status is kept.
     - Success: `consecutive_failures = 0`.
     - `http_status`, `error`, `title_seen` and `checked_at` are always written.
     - `next_check_at = now + 30 days ± 3 days` (jitter spreads the load). After a definite failure that isn't yet dead, it is `now + 1 day`, so dead links are confirmed the next day.
  5. **Update `flagged_at` and `dismissed_at`**:
     - When the status changes to `dead` or `changed`, `flagged_at = now()` and `dismissed_at = NULL`.
     - When it changes to `ok`, both become `NULL`.
     - When the status is unchanged, the flag fields are left as they are, so a dismissal holds.
  6. **Log a summary**: `{ checked, ok, dead, changed, failed_temp }`.

  The sweep runs without image storage or AI keys.
- **Rationale**:
  - Monthly checks with a 100-a-day cap keep outbound traffic small and polite.
  - Two strikes avoids flagging a page for one bad night.
  - Title comparison is cheap and catches the common "the page is now something else" case (domain resale, a redesign that changes content).
  - A separate table keeps check churn out of `items`, so `updated_at`, the trigger, `search_text` and embeddings are unaffected.
- **Alternatives considered**:
  - **Columns on `items`**: every check would move `updated_at` through the trigger, or need a trigger exception. It would also bloat the hot table.
  - **HEAD requests**: many sites answer HEAD incorrectly (405, or a different status), and HEAD gives no title for the "changed" check.
  - **Content hashing for "changed"**: dynamic pages (ads, dates) would flag constantly.
  - **Checking proposed cards**: they are short-lived, and review happens soon after.
  - **One job per link**: 100 small jobs a day is more pg-boss noise than one sweep with a bounded loop.

## D165 — How flags reach members

- **Decision**:
  - The **Item DTO** gains `linkHealth: { status: 'dead' | 'changed'; checkedAt: string } | null`.
    - It is non-null only when the item is a link, the check row's status is `dead` or `changed`, and `dismissed_at IS NULL`.
    - It is filled in `createItemDtoMapper` with one batched lookup per page (`linkChecks.flagsFor(itemIds)`), just like favorites.
    - Search results use the same mapper.
  - **Web**:
    - `LinkCard` shows a muted badge, "Link may be dead" or "Link may have changed", with the check date as its title.
    - Members with `item.update` see "Check again" and "Dismiss" in the card's actions (`CardActions`).
  - **Routes**:
    - `POST /items/{id}/link-check`: needs `item.update`, at most `LINK_CHECK_RATE_PER_HOUR = 10` per user per hour. It runs one probe synchronously (bounded by `safe-fetch`'s timeout), applies the same state rules and returns the updated `Item`. One exception: a manual check never sets `dead`. It can clear a flag or set `changed`, but definite failures still need the sweep's next-day confirmation, so repeated clicks can't produce a "dead" flag within seconds.
    - `DELETE /items/{id}/link-check/flag`: needs `item.update`. It sets `dismissed_at = now()` and returns 204, or 404 when there is no active flag.
  - **List filter**:
    - `GET /decks/{id}/items?flag=link` returns flagged link cards that aren't dismissed, ordered by `flagged_at DESC`.
    - It needs `item.update` on the deck, else 403. It respects `visibleCategoriesWhere()`.
    - Web: a "Links to check" route `/d/$slug/links`, linked from the deck menu for editors and up, following the archived-cards page pattern (`d.$slug.archived.tsx`).
- **Rationale**:
  - The flag belongs to the card everyone reads, so it travels with the DTO and the offline cache.
  - The actions are scoped to people who can fix the card.
  - A list filter reuses the existing list, pagination and visibility code instead of a new page type.
- **Alternatives considered**:
  - **Review queue entries**: the queue is for proposals. Phase 10's staleness watcher will create "update" proposals from these flags.
  - **Notifications**: there is no notification system yet (Phase 9 digests).
  - **Hiding flags from readers**: readers are the ones who tap dead links.

## Other choices (no new D-number)

- **Same-origin snapshot rendering**:
  - `LinkCard` renders `CloudImage` with `preview.publicId`, `width` and `height` when present (013), then falls back to `preview.image` as today.
  - If 013 hasn't merged yet, it uses a plain `<img>` with `cloudinaryImageUrl(…, 720)`.
- **Backfill**:
  - `pnpm links:snapshot-backfill` enqueues `link-snapshot` for existing live link cards that have a `preview.image` and no `publicId`, 100 at a time.
  - It is a script and not part of the migration, because it needs the worker and storage.
- **Orphan sweep** (012):
  - The sweep's reference query gains `OR (i.type = 'link' AND i.payload #>> '{preview,publicId}' = a.public_id)`.
  - A partial index `items_link_preview_public_id_idx` on `((payload #>> '{preview,publicId}')) WHERE type = 'link'` keeps it cheap.
- **Ports**: tests and local runs use a fixture server through the test wiring's `allowedPorts: null`, as `link-preview.int.test.ts` does.
