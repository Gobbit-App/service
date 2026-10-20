# Data Model: Card media

No new tables, columns, constraints or migrations. Everything below is either an existing payload shape or a transient DTO in `@pb/shared` (`packages/shared/src/media/`, subpath `@pb/shared/media`).

## Existing payloads used (unchanged, `packages/shared/src/schemas/payloads.ts`)

| Type | Shape | Notes |
|------|-------|-------|
| `image` | `{ publicId: string (min 1), alt: string (min 1) }`, `strict` | `publicId` is the Cloudinary public id under `gobbit/items/<deckId>/…`; no width/height (D133) |
| `link` | `{ url: httpUrl, preview?: { title?, description?, image?: httpUrl } }`, `strict` | `preview` filled from D134; `image` stays a remote URL until Phase 7 |

The DB CHECK on payload size (≤ 8192 UTF-8 bytes, ADR-007) still applies. The D134 caps (title 200, description 500) keep a preview well below it.

## Transient DTOs (new)

### `MediaSignResponse`

| Field | Type | Notes |
|-------|------|-------|
| `uploadUrl` | string | `https://api.cloudinary.com/v1_1/<cloudName>/image/upload` |
| `apiKey` | string | Public API key (the secret never leaves the server) |
| `timestamp` | integer (unix s) | Signed; valid for 1 hour at Cloudinary |
| `signature` | string | `api_sign_request` over the signed params below |
| `folder` | string | `gobbit/items/<deckId>` |
| `tags` | string | `editor,deck:<deckId>` |
| `allowedFormats` | string | `jpg,png,webp,heic,heif` |
| `maxBytes` | integer | `MEDIA_IMAGE_MAX_BYTES` (8 MB), a client-side check |
| `expiresAt` | ISO datetime | `timestamp + 50 min`; the editor re-signs after this |

The client sends the fields named in `folder`, `tags`, `allowed_formats` and `timestamp`, plus `api_key`, `signature` and `file`, as multipart form fields to `uploadUrl`, using Cloudinary's snake_case names.

### `LinkPreviewRequest` / `LinkPreviewResponse`

| DTO | Shape |
|-----|-------|
| Request | `{ url: httpUrl }` |
| Response | `{ preview: { title?: string ≤ 200, description?: string ≤ 500, image?: httpUrl } \| null }` |

`preview` reuses the `linkPayloadSchema.preview` object, so the editor can copy it into the draft unchanged.

## Storage conventions (Cloudinary)

| Source | Folder | Tags | Removed by |
|--------|--------|------|------------|
| Ingest (Phase 5) | `gobbit/ingest/<deckId>` | `ingest`, `job:<jobId>` | `deleteForJob` on a failed or discarded job |
| Editor (this feature) | `gobbit/items/<deckId>` | `editor`, `deck:<deckId>` | Phase 7 orphan sweep: lists by `deck:` tag and keeps ids referenced by an item's `payload.publicId` |

## Limits added (`@pb/shared/media`)

`MEDIA_IMAGE_MAX_BYTES = 8 MB` (equal to `INGEST_IMAGE_MAX_BYTES`), `MEDIA_IMAGE_MIMES` (= `INGEST_IMAGE_MIMES`), `MEDIA_SIGN_RATE_PER_HOUR = 60`, `LINK_PREVIEW_RATE_PER_HOUR = 30`, `LINK_PREVIEW_TITLE_MAX = 200`, `LINK_PREVIEW_DESCRIPTION_MAX = 500`, `LINK_PREVIEW_CACHE_MAX = 200`, `LINK_PREVIEW_CACHE_TTL_MS = 3_600_000`.
