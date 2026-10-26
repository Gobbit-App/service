# Card media (Phase 6, `specs/008-card-media`)

_Overview: [architecture.md](../architecture.md). Decisions: [adr.md](../adr.md)._

Image cards from the editor (upload a photo, or take one on a phone) and "Fetch preview" for link cards. Two new routes, no migration, no new env vars and no new dependencies (`cloudinary` and `lru-cache` were already in the API).

**Boundary with Phase 7 (D129)**: Phase 6 ships signed browser uploads and a synchronous link preview, both as services. The `assets` table, the orphan sweep, remote-URL upload, preview snapshots, link checks and `CloudImage` stay in Phase 7 (see Media assets and Responsive images below).

**Signed direct uploads (D133, ADR-051)**: `POST /decks/{id}/media/sign` (`media.service` → `media/sign-upload.ts`). Access: `resolveDeck` + `authorize(..., 'item.create')`; then 503 `/problems/unavailable` without `CLOUDINARY_URL`; then `rateKeys.mediaSignUser` at 60/user/hour. The response holds the upload URL, `apiKey`, `timestamp`, `signature`, `folder`, `tags`, `allowedFormats`, `maxBytes` and `expiresAt` (50 min, inside Cloudinary's one-hour signature window), with `Cache-Control: no-store`. The API secret never leaves `signEditorUpload`. The browser posts the file straight to `https://api.cloudinary.com/v1_1/<cloud>/image/upload` (`editor/upload.ts`, XHR for progress and abort); the API never sees the bytes. The web CSP `connect-src` adds `https://api.cloudinary.com` (`apps/web/Caddyfile`).

**Upload diagnostics**: Cloudinary's answer goes only to the browser, so a refused upload used to leave nothing in the API log. Now:
- `upload.ts` keeps Cloudinary's status and `error.message` on `UploadError`. `failureMessage()` turns them into a specific message: connection, file too large, resolution too high (the Free plan caps images at 25 MP), unsupported type, or server misconfigured (401 / invalid signature). Anything else is shown truncated.
- `use-image-upload` sends `POST /decks/{id}/media/upload-failures` `{ status, message, fileType, fileBytes }` (`uploadFailureReport()`, best effort; cancels and stale retries aren't sent).
- `media.service.reportUploadFailure` checks `item.create`, rate-limits at 30/user/hour (`rateKeys.mediaUploadFailureUser`) and logs a `warn` line with msg `browser upload to cloudinary failed`. Nothing is stored; the route answers 204.
- At boot the API runs `media/cloudinary-check.ts`, which calls Cloudinary's Admin API `ping` with `CLOUDINARY_URL`. It logs `cloudinary credentials ok` or an `error` line `cloudinary credentials rejected; image uploads will fail`, and never blocks startup.

**Storage conventions**: folder `gobbit/items/<deckId>` (ingest uses `gobbit/ingest/<deckId>`), tags `editor` and `deck:<deckId>`, formats jpg/png/webp/heic/heif. All of them are covered by the signature, so the browser can't change them. 8 MB (`MEDIA_IMAGE_MAX_BYTES`, the same as ingest) is checked in the browser before the upload; Cloudinary's account upload limit is the server-side backstop (no signed preset, see Deviations).

**Editor image fields**: `editor/fields/ImageFields.tsx` replaces `ReadOnlyImage`; image is in `CREATABLE_TYPES`. "Take photo" (`capture="environment"`) and "Choose photo" are labelled file inputs; `image-file.ts` checks the type (MIME, or the extension when the browser reports none, e.g. HEIC) and size. `use-image-upload.ts` runs sign → upload with states idle / signing / uploading (percent) / failed (with retry), cancel through `AbortController`, and maps 429/503/403/404 to messages. `cachedSigner` reuses a signature until it expires; a stale signature is re-signed once. `validate.ts` requires a finished upload ("Add a photo") but no alt text: the field is "Description (optional)" and a blank one is left out of the payload (D206, 023). Without a cloud name (`GET /config`) the type picker disables Image with "Image cards aren't available: image storage isn't set up here." and `?type=image` falls back to text. Offline, picking is disabled.

**Link preview (D134)**: `POST /decks/{id}/link-preview` (`link-preview.service`): `item.create`, then `rateKeys.linkPreviewUser` at 30/user/hour, then an `lru-cache` (200 entries, 1 h, keyed by the parsed URL; empty results are cached too). The page is fetched only through `fetch/safe-fetch.ts` (ADR-048) and read by `extract-page`: OG title (else `<title>`, ≤ 200 code points), OG description (≤ 500), absolute http(s) OG image (≤ 2048 chars). Any failure answers `200 { preview: null }`; the reason is only logged. In the editor, `LinkEditorFields` puts `FetchPreview` in the 007 `previewSlot`: text the member already wrote wins over fetched text, a fetched image replaces the old one, and an empty card title takes the fetched title. Any failure reads "No preview available" and Save stays on.

**Bundle**: initial JS unchanged at 112.5 KB gzip; the image and preview code sits in the editor's lazy chunks (`CardEditor` chunk 7.4 KB gzip). Web code imports the zod-free `@pb/shared/media-constants`.

## Media assets (Phase 7, `specs/012-media-assets`, ADR-054)

**Registry (D156)**: `assets` (migration `0012_media_assets`) holds one row per stored image: `deck_id` (cascade), unique `public_id`, `source` (`editor` / `remote` / `ingest` / `link_snapshot`), `width`, `height`, `bytes`, `format`, `uploaded_by`, `created_at`. The migration backfills one row per image already referenced by a card (`source` from the folder, no dimensions) and adds `items_image_public_id_idx`. `assets.repo`: `upsert` (reports `created`; refuses an id recorded for another deck), `byPublicId`, `recordedAmong`, `orphans`, `deleteByIds`.

**Confirm (D157)**: after the browser upload, `use-image-upload` sends Cloudinary's answer to `POST /decks/{id}/media/assets` (`public_id`, `version`, `signature`, dimensions, bytes, format) and attaches the photo only once the API answers. `media.service.confirmUpload`: `item.create`, 503 without Cloudinary, 60/user/hour (`rateKeys.mediaConfirmUser`), then `MediaStore.verifyResponse` (Cloudinary's response signature), then the deck folder, then the upsert. 201 on first record, 200 on a repeat, 422 with `path` `signature` / `publicId` otherwise, `Cache-Control: no-store`. A failed confirm leaves no photo and offers Retry (which uploads again).

**Reference rule (D160)**: `image-reference.ts` runs on card create, update and publish: an image card's `publicId` must be recorded for the same deck, else 422 `payload.publicId` "Unknown image" (the editor shows "Photo expired, add it again"). `width`/`height` in the stored payload always come from the asset; client values are dropped.

**Server-side uploads (D159)**: `createAssetUploader().uploadFromUrl({ deckId, url, source, uploadedBy? })` downloads through `createSafeImageFetch` (same SSRF guard, redirects and timeouts as `safe-fetch`; JPEG/PNG/WebP/HEIC by MIME and magic bytes; 8 MB cap), uploads the bytes and records the asset. It never throws: it answers `{ asset }` or `{ asset: null, reason }` (`blocked`, `timeout`, `not_image`, `too_large`, `http_error`, `upload_failed`, `unavailable`). Ingest records its uploads the same way.

**Orphan sweep (D158)**: queue `media-sweep`, daily at 06:00 (`MEDIA_SWEEP_CRON`), scheduled only when `CLOUDINARY_URL` is set. One run takes up to 500 assets older than 7 days (`MEDIA_ORPHAN_GRACE_DAYS`) that no item references (any status; deleted-in-window cards keep theirs), deletes them in Cloudinary in chunks of 100, then deletes the rows that came back `deleted` or `not_found`. `failed` ids keep their row for the next run. It never lists Cloudinary. Deleting a deck deletes the `gobbit/items/`, `gobbit/ingest/` and `gobbit/links/` prefixes for that deck after commit (logged, never fails the delete).

**Ops**: `pnpm media:reconcile` lists Cloudinary by the `editor` and `ingest` tags and reports images without a row (dry run; `--delete` removes them). `pnpm job:run <queue>` enqueues one job (e.g. `media-sweep`) for a local check.

| Source | Folder | Tags | Recorded by |
| --- | --- | --- | --- |
| `editor` | `gobbit/items/<deckId>` | `editor`, `deck:<deckId>` | `POST /decks/{id}/media/assets` |
| `remote` | `gobbit/items/<deckId>` | `remote`, `deck:<deckId>` | `uploadFromUrl` |
| `ingest` | `gobbit/ingest/<deckId>` | `ingest`, `job:<jobId>` | `ingest.service` |
| `link_snapshot` | `gobbit/links/<deckId>` | `link_snapshot`, `deck:<deckId>` | `uploadFromUrl` (014) |

### Deviations from the 012 plan

- **`createSafeImageFetch`** is a separate function, not an `accept: 'image'` option on `safeFetch`.
- **422 errors use `path`** (`payload.publicId`), like the rest of the API, not a JSON pointer.
- **Deck delete keeps the `assets` rows** of the soft-deleted deck; they cascade if the deck is purged.
- **Backfilled rows get `created_at = now()`** and no dimensions; there is no `media:backfill-dimensions` script.
- **Photo smoke**: the fixture deck has no image card any more, and the save step needs the `CLOUDINARY_API_SECRET` CI secret to sign the faked Cloudinary answer (skipped without it).

## Responsive images (Phase 7, `specs/013-cloud-image`, D161–D162)

Every stored image renders through `cards/CloudImage.tsx` (image cards today, link previews from 014). Web only: no migration, route or API change.

- **Sizes**: `useElementWidth` (`cards/use-element-width.ts`) measures the wrapper with one shared `ResizeObserver` (a `WeakMap` of callbacks; changes under 8 px and hidden 0 widths are ignored). Until the first measurement, `sizes` is the viewport estimate `imageSizesFor(innerWidth)` (column ≤ 640 px minus padding). `src` is the 720 px URL; `srcset` stays 360/720/1080 (`f_auto,q_auto,c_limit,w_N`).
- **Box**: `width`/`height` attributes from the payload (012 records them on the asset; the editor copies them from the confirmed asset with `withPhoto`). Without both, the wrapper gets `cloud-image--unknown` and a 4:3 `contain` box. `max-height: min(70vh, 640px)`.
- **Placeholder**: a 32 px `f_auto,q_1,e_blur:2000` image (`cloudinaryPlaceholderUrl`), `aria-hidden` with an empty alt, stacked under the sharp image. The sharp image fades in on `load` (`cloud-image--loaded`); the fade sits inside `prefers-reduced-motion: no-preference`. On error the placeholder goes and `ImageCard` shows "Image unavailable".
- **Loading**: lazy by default; `priority` (the current Browse card, D144) makes both images eager and the sharp one `fetchpriority="high"`.
- **Cache (D162)**: placeholders share the service worker's `cloudinary-images` cache, so `maxEntries` went from 300 to 600.

### Deviations from the 013 plan

- **The placeholder loads like the sharp image** (lazy unless `priority`), rather than always eagerly, so off-screen cards cost nothing.
- **No `BrowseStack.test.tsx`**: the "priority only on the current card" test is in `BrowseScreen.test.tsx`.
- **The list-image smoke** (`sizes` in px, three-width `srcset`) is in the photo test of `editor.spec.ts`, the only list image the smoke can create since the fixture deck lost its image card (012). It runs only with `CLOUDINARY_API_SECRET`.

## Deviations from the 008 plan

- **8 MB, not 10 MB**: the same cap as ingest images (`INGEST_IMAGE_MAX_BYTES`).
- **No width/height** in the image payload: the card stores `{ publicId, alt? }` only (`alt` optional since 023), as the existing schema does.
- **No `siteName`** in the preview: the link payload has no field for it, so it is dropped.
- **The fetch failure reason is not returned** (`{ preview: null }`), only logged, so the route can't be used to probe hosts.
- **No signed upload preset**: signed params alone (folder, tags, formats) plus the client-side 8 MB check; Cloudinary's account limit is the backstop. A signed preset with a size cap can be added later by signing its name.
- **Schemas in `schemas/media.ts`**, exported from `@pb/shared` and `@pb/shared/media`; the web imports the zod-free `@pb/shared/media-constants` (research named `@pb/shared/media`).
- **`LINK_PREVIEW_IMAGE_URL_MAX` = 2048** is new: longer image URLs are dropped.
- **Order of checks**: access before the rate limit on both routes; the sign route's 503 comes after the access check and before the rate limit, so a server without Cloudinary doesn't use up a member's hourly count. The preview rate limit counts cache hits too.
- **Upload state**: starting an upload clears the stored `publicId`, so cancelling or failing a replacement leaves no photo (Save then asks for one). A restored draft keeps only a finished `publicId`.
- **Alt text has no client maximum**: the server has none either; the 8192-byte payload limit covers it.
- **Fetch preview only in the card editor**, not in the review queue's inline edit (which keeps plain `LinkFields`).
- **E2E fakes Cloudinary**: the smoke specs answer `/api/config` (cloud name), `/api/decks/*/media/sign`, `api.cloudinary.com` and `res.cloudinary.com` with `page.route`, so no test talks to Cloudinary or needs credentials. The happy-path preview is faked too, because `safe-fetch` refuses the local fixture server the task described; the no-preview path goes through the real API with a private-IP URL.
- **Caddy's `Permissions-Policy: camera=()`** stays: it doesn't affect `<input capture>`, which opens the system camera.
- **`use-image-upload.ts` is not a TanStack mutation**: sign and upload are one sequence with progress, cancel and one re-sign, so the hook keeps its own state behind an injectable `Signer` and upload function.
- **`ImageCard` is keyed by `publicId`** in `CardBody`, so a replaced photo in the editor preview doesn't inherit the previous photo's load error.

## Deviations from the 023 plan

- **Alt is optional** (`imagePayloadSchema.alt: z.string().optional()`, D206). Renderers use `imageAlt` from `@pb/shared/image-alt`: a non-blank alt wins, otherwise `alt=""` when the title is the heading right above the image (every current renderer, including the public page), otherwise the title. Agent-extracted image cards keep their generated alt.
- **A non-string `alt` is refused with 400** (request validation), not 422.
