# Contract: `POST /decks/{id}/media/sign`

Issues a signed permission for one direct image upload to Cloudinary (D133). Defined with `@hono/zod-openapi` in `apps/api/src/routes/media.ts`; schemas are in `@gobbit/shared/media`.

**Auth**: session cookie or `Authorization: Bearer` (session). Ingest tokens (`ing_`) are rejected (ADR-046).

**Path**: `id`, the deck id (same parameter as `/decks/{id}/categories`).

**Body**: none.

## Responses

| Status | Body | When |
|--------|------|------|
| 200 | `MediaSignResponse` ([data-model](../data-model.md)) | Caller has `item.create` on the deck |
| 401 | problem `/problems/unauthorized` | No session |
| 403 | problem `/problems/forbidden` | Member without `item.create` (reader) |
| 404 | problem `/problems/not-found` | Deck missing or not visible to the caller (ADR-004) |
| 429 | problem `/problems/rate-limited`, `Retry-After` | More than `MEDIA_SIGN_RATE_PER_HOUR` (60) signs by this user in the current hour |
| 503 | problem `/problems/unavailable` | `CLOUDINARY_URL` not configured |

`Cache-Control: no-store`.

## Example

```json
{
  "uploadUrl": "https://api.cloudinary.com/v1_1/demo-cloud/image/upload",
  "apiKey": "123456789012345",
  "timestamp": 1792500000,
  "signature": "b3c1…",
  "folder": "gobbit/items/6f0e…",
  "tags": "editor,deck:6f0e…",
  "allowedFormats": "jpg,png,webp,heic,heif",
  "maxBytes": 8388608,
  "expiresAt": "2026-10-20T10:50:00.000Z"
}
```

## Client upload (browser → Cloudinary, not our API)

`POST uploadUrl`, `multipart/form-data`, fields `file`, `api_key`, `timestamp`, `signature`, `folder`, `tags`, `allowed_formats`, sent via `XMLHttpRequest` for `upload.onprogress` and `abort()`. On 200, read `public_id` into `payload.publicId`. Any other status is an upload failure the editor offers to retry; a 401 from Cloudinary about a stale timestamp triggers one re-sign.
