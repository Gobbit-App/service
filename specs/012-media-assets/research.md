# Research: Media assets — registry, orphan cleanup and uploads from a URL

Decisions continue the project-wide D numbering. Phase 7 reserves **D156–D173** (see [`specs/README.md`](../README.md)). This feature owns **D156–D160**.

## D156 — `assets` table, references derived from payloads

- **Decision**: a new table `assets` (migration `0012_media_assets`). Its columns:
  - `id`;
  - `deck_id` (FK, cascade);
  - `public_id` (unique);
  - `source` (enum `asset_source`: `editor`, `ingest`, `link_snapshot`, `remote`);
  - `width`, `height`, `bytes`, `format` (all nullable for backfilled rows);
  - `uploaded_by` (FK users, set null);
  - `created_at`.
  There is **no `item_id`**. Whether an asset is in use is derived from card payloads when the sweep runs: image `payload.publicId`, and from 014 link `payload.preview.publicId`. A partial expression index on `items ((payload->>'publicId')) WHERE type = 'image'` keeps the anti-join cheap.
- **Rationale**: a card can switch images, two cards can share one (copied cards, a re-proposed update), and payloads are already the source of truth for what a card shows. A stored `item_id` would need updating on every payload write, and every drift would turn into a wrong deletion. With references derived from payloads, an image is deleted only when no row anywhere mentions it.
- **Alternatives considered**:
  - `item_id` on assets, as in the master plan: drifts on replace, copy, purge and review "publish as update". Each of those paths would need its own bookkeeping.
  - A join table `item_assets`: correct but redundant with the payload, and it needs a trigger to stay in sync.
  - Cloudinary as the registry, listing by tag: see D158.

## D157 — Confirming editor uploads

- **Decision**: after the direct upload (D133), the editor sends Cloudinary's upload response to `POST /decks/{id}/media/assets`: `{ publicId, version, signature, width, height, bytes, format }`. `media.service.confirmUpload`:
  1. resolves the deck and checks `item.create`;
  2. verifies the response with `cloudinary.utils.verify_api_response_signature(publicId, version, signature)`, using the server-side secret;
  3. checks that `publicId` starts with `gobbit/items/<deckId>/`;
  4. upserts the asset (`source = editor`, `uploaded_by` = the caller) and returns it.
  Ingest calls `assets.record` right after `uploads.upload` in `ingest.service` (`source = ingest`, dimensions from the upload result, `uploaded_by` = the job's user). Confirmations share the 60/user/hour limit of `mediaSignUser` and count separately.
- **Rationale**: the browser holds the upload result, so the browser has to report it, and the signature check makes that report trustworthy. The folder check stops a member of deck A from claiming an image uploaded for deck B. With the dimensions recorded, 013 can reserve the right space without another Cloudinary call.
- **Alternatives considered**:
  - A Cloudinary upload notification webhook: needs a public callback URL and a second signature scheme. Local development has no reachable URL.
  - Looking the asset up with the Admin API on save: one rate-limited Admin API call per save, and the API is still not told about uploads that are never saved.
  - Recording at sign time: a signature is not an upload. Most of those rows would describe images that don't exist.

## D158 — Orphan sweep driven by the database

- **Decision**: a pg-boss queue `media-sweep`, scheduled daily (`MEDIA_SWEEP_CRON = '0 6 * * *'`) and only when `CLOUDINARY_URL` is set. Each run:
  1. selects up to `MEDIA_SWEEP_BATCH = 500` assets with `created_at < now − MEDIA_ORPHAN_GRACE_DAYS` (7) that no `items` row references in any status, including deleted rows still inside the undo window;
  2. deletes them in Cloudinary with `cloudinary.api.delete_resources(ids)`, at most 100 per call;
  3. removes the asset rows whose result is `deleted` or `not_found`, and keeps rows whose deletion failed for the next run;
  4. logs `{ deleted, notFound, failed }` through `childLogger('media-sweep')`.
  The sweep never lists Cloudinary by prefix or tag.
- **Rationale**:
  - Development and production may share one Cloudinary account, and test runs use real folders. A sweep driven by listing the account would see images that its own database doesn't know about and would delete them.
  - The database is the only place that knows both sides: what was uploaded and what is referenced.
  - The weekly purge (D132, `prune-deleted-items`, Sunday 05:00) turns deleted cards into missing rows, so their images become orphans with no extra code.
  - Seven days is the master plan's grace period. A daily run keeps each batch small.
- **Alternatives considered**:
  - The master plan's approach (list by the `deck:` tag and keep referenced ids): unsafe with a shared account, and it costs Admin API calls per deck.
  - Deleting at the moment a reference disappears: needs hooks on every write and purge path, and loses the grace period that protects open editors.
  - Cloudinary's own auto-delete settings: not keyed to our references.
- **Legacy uploads**: 008 editor uploads and Phase 5 ingest uploads that no card references were never recorded. `pnpm media:reconcile` (a script, dry run by default) lists resources tagged `editor` or `ingest` under the configured folders that have no asset row, so an operator can delete them on purpose. It is not scheduled.
- **ADR**: yes → **ADR-054** "Asset registry with a database-driven orphan sweep" (covers D156 and D158).

## D159 — `media.service.uploadFromUrl`

- **Decision**: `uploadFromUrl({ deckId, url, source, uploadedBy? })` returns `{ asset } | { asset: null, reason }`. It is a server-side service with no route in Phase 7, and it never throws on fetch failure. Steps:
  1. Fetch the URL through a new **binary mode of `safe-fetch`**: `createSafeFetch({ accept: 'image', maxBytes: MEDIA_IMAGE_MAX_BYTES })`. It keeps the same IP guard, ports, redirects and timeout, and accepts only `MEDIA_IMAGE_MIMES` (by `Content-Type`, then confirmed by magic bytes). It returns `{ bytes, contentType, finalUrl, error }`. The HTML mode stays the default, so its callers don't change.
  2. Upload the buffer server-side with `cloudinary.uploader.upload` (data URI, as `ingest-uploads.ts` does). The folder is `gobbit/<links|items>/<deckId>`, chosen by source. The tags are `<source>` and `deck:<deckId>`.
  3. Record the asset with the dimensions Cloudinary returns.
  Without `CLOUDINARY_URL` it returns `{ asset: null, reason: 'unavailable' }`. Callers (the 014 snapshot job, Phase 13 MCP) do their own access checks; the service takes an already-authorized deck id.
- **Rationale**: constitution IV allows outbound HTTP only through `fetch/safe-fetch.ts`. Cloudinary's own fetch-by-URL upload is simpler, but it would make Cloudinary's servers fetch arbitrary URLs for us outside the guard: no IP rules, no size cap that we enforce, and no single place to audit. The binary mode adds one option to the existing guard instead of creating a second fetcher.
- **Alternatives considered**:
  - `cloudinary.uploader.upload(remoteUrl)`: bypasses the guard (above).
  - Cloudinary "fetch" delivery URLs (`/image/fetch/<url>`): each view re-fetches the remote image, nothing is snapshotted, and the account's fetch allow-list becomes a second security policy.
  - A separate `image-fetch.ts` module: duplicates the IP guard and the redirect handling.

## D160 — Asset reference rule and server-owned dimensions

- **Decision**: `imagePayloadSchema` gains optional `width` and `height` (positive integers ≤ 20 000). The schema stays `strict`, so this is an additive and backwards-compatible change. On create and update, `items.service` checks the asset reference:
  - when the payload has an image `publicId` (from 014 also a link `preview.publicId`), it must be an asset row of the **same deck**, otherwise the request fails with 422 `/problems/validation` (`pointer: /payload/publicId`, "Unknown image");
  - the service then writes `width` and `height` from the asset, replacing anything the client sent.
  Review publish (`review.service`) runs the same check, because ingest records its uploads (D157). Backfilled assets without dimensions leave `width` and `height` out.
- **Rationale**:
  - Today any string is accepted as `publicId`, so a client can point a card at another deck's image or at nothing.
  - The sweep's safety depends on references matching recorded assets.
  - 013 needs the dimensions to reserve layout space, and keeping them server-owned stops them drifting from the real image.
- **Alternatives considered**:
  - Dimensions only on the DTO (joined from assets on read): every list query would join `assets`, and offline caches would hold two shapes.
  - Trusting the client's dimensions: easy to spoof and pointless when the server knows them.

## Other choices (no new D-number)

- **Backfill**: `0012_media_assets` inserts one asset row for each distinct `payload->>'publicId'` of image items (any status), with `source = ingest` when the id starts with `gobbit/ingest/` and `editor` otherwise, `deck_id` from the item, `created_at = now()` and no dimensions. `pnpm media:backfill-dimensions` (optional, Admin API, batched) fills the dimensions later. The down file drops the table and enum.
- **Rate-limit key**: `rateKeys.mediaConfirmUser`, 60/user/hour, like signing.
- **Web**: `editor/use-image-upload.ts` calls confirm after the XHR succeeds. Its state machine gains a `confirming` step, and a confirm failure is shown like an upload failure with a retry button. This is lazy editor chunk only.
- **Logging**: the sweep and `uploadFromUrl` log through pino `childLogger` (#40). They log reasons, never the API secret.
