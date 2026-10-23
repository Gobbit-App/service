# Links: snapshots and checks (Phase 7, `specs/014-link-snapshots`, `specs/015-locked-host-links`, ADR-055)

Link cards keep a copy of their preview image and are checked once a month, so a card whose page
died or turned into something else says so.

## Snapshots (D163)

- **Queue `link-snapshot`** (`{ itemId, attempt? }`, `singletonKey: itemId`). The API enqueues after
  commit through `linkSnapshotQueue.enqueueIfNeeded(row)`. Callers: `items.service` writes
  (create, update, restore, undelete), `review.service` publish and ingest `proposeItem`.
- It is enqueued for a live (`proposed` or `published`) link card when `preview.image` is set and
  `preview.publicId` is not, or when the preview is empty. The queue is worked, and enqueued, only when
  `CLOUDINARY_URL` is set. Without it, cards keep loading the remote image as before.
- **Job** (`jobs/link-snapshot.ts`):
  1. Loads the row and stops unless it's a live link.
  2. Fills an empty preview with `fetchLinkPreview` (`fetch/link-preview.ts`), the same `safe-fetch` →
     `extract-page` → `toLinkPreview` path the editor's lookup uses, without its per-user rate limit.
  3. Copies `preview.image` with `media.uploadFromUrl` into `gobbit/links/<deckId>` (asset source
     `link_snapshot`, tags `link_snapshot`, `deck:<deckId>`).
  4. Writes `preview.publicId`/`width`/`height` with `items.repo.updatePayloadIf(id, updatedAt, …)`.
  5. If the card changed in the meantime, it re-enqueues once and then gives up. The asset that was
     just made is left for the orphan sweep.
  6. After a write, it calls `embedQueue.enqueueIfStale`.

  Fetch and upload failures are logged at info level, never surfaced. Outcomes: `written`,
  `unchanged`, `requeued`, `superseded`, `skipped`.
- **Server-owned fields**: on update the stored `publicId`/`width`/`height` win over the client.
  When the URL or `preview.image` changes and the stored `publicId` is a `link_snapshot` asset, the
  three fields are dropped so the job copies the new image. A photo a member added (an `editor` or
  `ingest` asset) is kept. A client-sent `publicId` must be an asset of the deck (D160).
- **Ingest** builds `payload.preview` from the page's OG data (`extract-validate`, same clipping as the
  editor) when the card's URL is the shared URL, then enqueues the snapshot.
- **Search**: migration `0013` strips `preview.publicId` from the link branch of
  `item_search_text()` ([search](search.md)).
- **Rendering**: `LinkCard` renders a stored snapshot through `CloudImage` (16:9 crop). If it fails to
  load, it falls back to the remote `preview.image`, then to no image. Without a cloud name it uses
  the remote image.
- **Backfill**: `pnpm links:snapshot-backfill` enqueues the job for existing live link cards with a
  `preview.image` and no `publicId`, 100 rows per keyset page (`items.repo.linkSnapshotCandidates`).
  Run it once after deploying.

## Checks (D164)

- **Table `link_checks`**: one row per link item, created by the first check. It holds `status`
  (`ok`/`dead`/`changed`), `consecutive_failures`, `http_status`, `error`, `title_seen`,
  `checked_at`, `next_check_at`, `flagged_at` and `dismissed_at`. Check churn never touches `items`,
  so `updated_at`, `search_text` and embeddings stay put.
- **Queue `link-check-sweep`**: daily at 06:30 UTC (`LINK_CHECK_CRON`), always scheduled (it needs
  no image storage or AI keys).
  - Each run takes up to 100 published, live link cards with no row or a due `next_check_at`.
  - Hosts are probed in parallel up to 4, with one request at a time per host.
- **Probe**: `safe-fetch` in `accept: 'any'` mode. It follows redirects through the same IP guard and
  takes any content type. For HTML it reads at most 256 KB and extracts the title.
- **Classify** (`fetch/link-status.ts`):

  | Result | Class |
  | --- | --- |
  | 2xx | `ok`, or `changed` when the normalized titles (case, spacing, punctuation, ` - Site` suffix) differ |
  | 404, 410, DNS failure, refused, `blocked` | definite |
  | timeout, 5xx, 429, 403, redirect loop | temporary |

- **State** (`link-checks.service`):
  - A definite failure counts a strike. The second consecutive strike makes the status `dead`; the
    first keeps the previous status and retries in 1 day.
  - Temporary failures change nothing but the check fields.
  - The next check is due in 30 ± 3 days.
  - A status change to `dead`/`changed` sets `flagged_at` and clears `dismissed_at`. A change to `ok`
    clears both. An unchanged status leaves them, so a dismissal holds.
  - The sweep logs `{ checked, ok, changed, dead, failing, failedTemp }`.

## Flags (D165)

- **DTO**: `Item.linkHealth` is `{ status: 'dead' | 'changed', checkedAt }` for a link card with an
  undismissed flag, otherwise `null`. It is batched per page by the item DTO mapper (search results
  too). Every member sees the badge ("Link may be dead" / "Link may have changed").
- **Routes** (all need `item.update`):
  - `POST /items/{id}/link-check`: one synchronous probe, 10 per member per hour; returns the
    updated `Item`. A manual check never sets `dead`.
  - `DELETE /items/{id}/link-check/flag`: 204, or 404 without an active flag.
  - `GET /decks/{id}/items?flag=link`: flagged cards by `flagged_at DESC`; 403 for readers.
- **Web**: "Check again" and "Dismiss" are in `CardActions` (`items/LinkCheckButtons.tsx`). A "Links to
  check" chip opens `/d/$slug/links` (lazy route) for `item.update` roles.

## Locked social hosts (015, D166–D168)

Instagram, Facebook (`fb.watch` too), Threads, TikTok, X (`twitter.com` too) and LinkedIn answer
server fetches with a login wall, so their cards use what the member shared instead.

- **Registry** (D166): `LOCKED_HOSTS` / `lockedHostOf(url)` in `@pb/shared/links` (exact host or a
  subdomain on a dot boundary, http(s) only). Shared by the API, the worker and the web.
- **Ingest** (D167, `ai/extract-validate.ts`): a share whose URL is on a locked host always becomes
  a `link` card for the shared URL. `preview.title` is the OG title unless it is generic (the label,
  the site name or a login wall, `fetch/locked-host-preview.ts`), else the extracted title;
  `preview.description` is the OG description, else the shared caption (URL stripped, ≤ 500 code
  points, `LOCKED_CAPTION_MAX`); a shared image becomes `preview.publicId` with the ingest asset's
  dimensions and no remote `image`, so no snapshot copy is queued.
- **Editor** (D167): "Add photo" on any link card (`editor/fields/LinkPhoto.tsx`, the same signed
  upload as image cards) sets `preview.publicId`/`width`/`height`. "Remove photo" sends
  `publicId: null` and drops `image`, which removes the stored copy (null is never stored).
- **Card** (D168): `LinkCard` shows the host label ("Instagram") in place of the domain line.
- **Snapshot job** (D168): one try with no requeue; a generic preview is discarded; a set
  `publicId` is never replaced.
- **Checks** (D168): the sweep writes `unchecked` rows for locked hosts without a request
  (flags cleared, next check in 30 ± 3 days; the summary adds `unchecked`). `POST
  /items/{id}/link-check` answers 422 ("Links to Instagram can't be checked automatically") before
  the rate limit.

## Deviations from the 014 plan

- **No deck menu exists**, so "Links to check" is a chip in `ChipRow` beside Archived.
- **The flagged listing** lives in `items.repo.listLinkFlagged`, which reuses the list's visibility
  and DTO code, not in `link-checks.repo.flaggedPage`.
- **Check again and Dismiss** are `items.service.checkLink` / `dismissLinkFlag` (role, visibility and
  "live" checks in one place). The probe and state rules stay in `link-checks.service`.
- **A first definite failure keeps the previous status** (a new row starts `ok`) with
  `consecutive_failures = 1`; the summary adds `failing` for those.
- **Job outcomes** add `unchanged` (nothing to fill or copy) and the requeue uses the same
  `singletonKey`.
- **Snapshots are also enqueued** on restore and undelete, since an archived card is skipped.
- **The snapshot queue is optional** in `proposeItem`, ingest and review (a no-op without Cloudinary).
- **Review publish** reloads the row once after publishing, to enqueue from the stored payload.
- **The ingest OG preview** applies only when the extracted URL equals the shared URL, so the OG data
  of one page is never attached to another.
- **`linkPreviewSchema`** (the editor lookup answer) omits the server-owned fields; the payload schema
  has them.
- **The e2e test** (`e2e/tests/full/links.spec.ts`, `@full`) seeds the flag at the network layer,
  because a real flag needs two daily checks and the nightly tier's seeding (011) isn't built yet.

## Deviations from the 015 plan

- **No extractor-off ingest path exists** (`POST /ingest` answers 503 without a provider key), so
  T014's "direct draft" branch has nothing to change; direct proposals (P5.9) skip the locked rules.
- **The caption** has the shared URL stripped before trimming, and **the OG image is dropped** when
  the OG title is generic (it is the site logo).
- **The ingest handler** gets an optional `assets` repo to read the uploaded image's dimensions.
- **Generic titles** also match login-wall wording ("log in or sign up", "welcome to").
- **"Remove photo"** needed an explicit signal, because an omitted `publicId` keeps the stored copy
  (014): the payload schema accepts `publicId: null` on writes.
- **The 422 for a manual check** lives in `items.service.checkLink` (with the other manual-check
  rules), not in `link-checks.service`.
- **T032/T033** were already covered by 014's `link-preview-fields` rules.
