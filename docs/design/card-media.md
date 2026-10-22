# Card media (Phase 6, `specs/008-card-media`)

_Overview: [architecture.md](../architecture.md). Decisions: [adr.md](../adr.md)._

Image cards from the editor (upload a photo, or take one on a phone) and "Fetch preview" for link cards. Two new routes, no migration, no new env vars and no new dependencies (`cloudinary` and `lru-cache` were already in the API).

**Boundary with Phase 7 (D129)**: Phase 6 ships signed browser uploads and a synchronous link preview, both as services. The `assets` table, the orphan sweep, remote-URL upload, preview snapshots, link checks and `CloudImage` stay in Phase 7. An image card stores only `{ publicId, alt }`; an upload whose card is never saved stays in Cloudinary until Phase 7's sweep, which can find it by tag.

**Signed direct uploads (D133, ADR-051)**: `POST /decks/{id}/media/sign` (`media.service` → `media/sign-upload.ts`). Access: `resolveDeck` + `authorize(..., 'item.create')`; then 503 `/problems/unavailable` without `CLOUDINARY_URL`; then `rateKeys.mediaSignUser` at 60/user/hour. The response holds the upload URL, `apiKey`, `timestamp`, `signature`, `folder`, `tags`, `allowedFormats`, `maxBytes` and `expiresAt` (50 min, inside Cloudinary's one-hour signature window), with `Cache-Control: no-store`. The API secret never leaves `signEditorUpload`. The browser posts the file straight to `https://api.cloudinary.com/v1_1/<cloud>/image/upload` (`editor/upload.ts`, XHR for progress and abort); the API never sees the bytes. The web CSP `connect-src` adds `https://api.cloudinary.com` (`apps/web/Caddyfile`).

**Upload diagnostics**: Cloudinary's answer goes only to the browser, so a refused upload used to leave nothing in the API log. Now:
- `upload.ts` keeps Cloudinary's status and `error.message` on `UploadError`. `failureMessage()` turns them into a specific message: connection, file too large, resolution too high (the Free plan caps images at 25 MP), unsupported type, or server misconfigured (401 / invalid signature). Anything else is shown truncated.
- `use-image-upload` sends `POST /decks/{id}/media/upload-failures` `{ status, message, fileType, fileBytes }` (`uploadFailureReport()`, best effort; cancels and stale retries aren't sent).
- `media.service.reportUploadFailure` checks `item.create`, rate-limits at 30/user/hour (`rateKeys.mediaUploadFailureUser`) and logs a `warn` line with msg `browser upload to cloudinary failed`. Nothing is stored; the route answers 204.
- At boot the API runs `media/cloudinary-check.ts`, which calls Cloudinary's Admin API `ping` with `CLOUDINARY_URL`. It logs `cloudinary credentials ok` or an `error` line `cloudinary credentials rejected; image uploads will fail`, and never blocks startup.

**Storage conventions**: folder `gobbit/items/<deckId>` (ingest uses `gobbit/ingest/<deckId>`), tags `editor` and `deck:<deckId>`, formats jpg/png/webp/heic/heif. All of them are covered by the signature, so the browser can't change them. 8 MB (`MEDIA_IMAGE_MAX_BYTES`, the same as ingest) is checked in the browser before the upload; Cloudinary's account upload limit is the server-side backstop (no signed preset, see Deviations).

**Editor image fields**: `editor/fields/ImageFields.tsx` replaces `ReadOnlyImage`; image is in `CREATABLE_TYPES`. "Take photo" (`capture="environment"`) and "Choose photo" are labelled file inputs; `image-file.ts` checks the type (MIME, or the extension when the browser reports none, e.g. HEIC) and size. `use-image-upload.ts` runs sign → upload with states idle / signing / uploading (percent) / failed (with retry), cancel through `AbortController`, and maps 429/503/403/404 to messages. `cachedSigner` reuses a signature until it expires; a stale signature is re-signed once. `validate.ts` requires a finished upload ("Add a photo") and alt text ("Alt text is required"). Without a cloud name (`GET /config`) the type picker disables Image with "Image cards aren't available: image storage isn't set up here." and `?type=image` falls back to text. Offline, picking is disabled.

**Link preview (D134)**: `POST /decks/{id}/link-preview` (`link-preview.service`): `item.create`, then `rateKeys.linkPreviewUser` at 30/user/hour, then an `lru-cache` (200 entries, 1 h, keyed by the parsed URL; empty results are cached too). The page is fetched only through `fetch/safe-fetch.ts` (ADR-048) and read by `extract-page`: OG title (else `<title>`, ≤ 200 code points), OG description (≤ 500), absolute http(s) OG image (≤ 2048 chars). Any failure answers `200 { preview: null }`; the reason is only logged. In the editor, `LinkEditorFields` puts `FetchPreview` in the 007 `previewSlot`: text the member already wrote wins over fetched text, a fetched image replaces the old one, and an empty card title takes the fetched title. Any failure reads "No preview available" and Save stays on.

**Bundle**: initial JS unchanged at 112.5 KB gzip; the image and preview code sits in the editor's lazy chunks (`CardEditor` chunk 7.4 KB gzip). Web code imports the zod-free `@pb/shared/media-constants`.

## Deviations from the 008 plan

- **8 MB, not 10 MB**: the same cap as ingest images (`INGEST_IMAGE_MAX_BYTES`).
- **No width/height** in the image payload: the card stores `{ publicId, alt }` only, as the existing schema does.
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
