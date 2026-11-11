# API contract changes: Media cards (045)

All DTOs live in `@gobbit/shared`; run `pnpm api:openapi` after the route changes.

## Item type and payload

- `ItemType`: `image` → `media` in every response (items, search, public, share, review, events).
- Inputs (`POST /decks/{id}/items`, `PATCH /items/{id}`, `GET /decks/{id}/items?type=`, direct ingest)
  also accept `image` as an alias for one release (D387); it is normalized to `media` with
  `kind: 'image'` when the payload has no kind.
- Media payload (request): `{ publicId: string, alt?: string, kind?: MediaKind }`; any other fact a
  client sends (`width`, `height`, `durationMs`, `pages`, `fileName`) is accepted and replaced from the
  asset. Response: the full payload in `data-model.md`.
- Errors (problem+json, field `payload.publicId`): `422 Unknown file` when the asset is missing or
  belongs to another deck (was "Unknown image").

## `POST /decks/{id}/media/sign`

Request body (new, optional for old clients): `{ kind?: 'image' | 'pdf' | 'audio' | 'video' }`
(default `image`).

Response `MediaSignResponse`, which adds fields and keeps the existing ones:

| Field | Change |
|-------|--------|
| `uploadUrl` | `…/image/upload` for image and pdf, `…/video/upload` for audio and video |
| `allowedFormats` | the kind's list (D389) |
| `maxBytes` | the kind's effective limit (D393) |
| `eager`, `eagerAsync` | new, optional; present for audio and video and must be posted unchanged (they are signed) |
| `kind` | new; echoes the kind |

Errors: unchanged (`404` deck, `403`→404 rules, `429`, `503` without media storage) plus
`400` for an unknown kind.

## `POST /decks/{id}/media/assets`

Request: `{ publicId, version, signature, bytes, format, kind?, resourceType?, width?, height?, durationMs?, pages?, etag?, originalFilename? }`,
forwarded from the provider's upload response (D157, D390). `kind` defaults to `image` (old
clients); `resourceType` defaults to `image`. `width`/`height` become optional (audio has none).
The server derives the kind from `format`, never from the request.

Response `MediaAsset`: adds `kind`, `resourceType`, `durationMs`, `pages` and `originalFilename`
(nullable).

New refusals (`422`, field `file`; the stored file is deleted first):

| `reason` | When |
|----------|------|
| `format` | the format isn't allowed for the kind |
| `too_large` | `bytes` is over the kind's limit |
| `unreadable` | a PDF has no pages, or audio/video has no duration |
| `kind_mismatch` | the format's kind differs from the requested kind, or `resourceType` doesn't match it |

## `GET /config`

`media` gains `maxBytes: { image, pdf, audio, video }` so the composer can show limits before signing.

## `POST /ingest`, share target, email-in

- Accepted file MIME families: `image/*` (as today), `application/pdf`, `audio/*`, `video/*`, each checked by
  magic bytes. Per-kind limits come from D393; the total body limit is unchanged.
- The share status (`GET /ingest/jobs/{id}`) reports unused files with a reason: `unsupported`,
  `too_large` or `extra_file`.

## Public API (`/public/{slug}…`)

`toPublicItem` media allow-list: `kind, publicId, alt, width, height, durationMs, pages` (D397).
