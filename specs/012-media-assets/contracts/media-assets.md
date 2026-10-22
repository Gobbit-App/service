# Contract: `POST /decks/{id}/media/assets`

Records a finished editor upload (D157). Defined with `@hono/zod-openapi` in `apps/api/src/routes/media.ts`; schemas are in `@pb/shared/media`.

**Auth**: session cookie or `Authorization: Bearer` (session). Ingest tokens (`ing_`) are rejected (ADR-046).

**Path**: `id`, the deck id.

**Body**: `MediaAssetConfirmRequest` ([data-model](../data-model.md)), built from Cloudinary's upload response: `public_id` → `publicId`, `version`, `signature`, `width`, `height`, `bytes`, `format`.

## Responses

| Status | Body | When |
|--------|------|------|
| 201 | `MediaAsset` | First confirmation; asset recorded |
| 200 | `MediaAsset` | Already recorded for this deck (idempotent; null dimensions filled) |
| 400 | problem `/problems/validation` | Body fails the schema |
| 401 | problem `/problems/unauthorized` | No session |
| 403 | problem `/problems/forbidden` | Member without `item.create` |
| 404 | problem `/problems/not-found` | Deck missing or not visible (ADR-004) |
| 422 | problem `/problems/validation` | Signature doesn't verify, `publicId` is outside `gobbit/items/<deckId>/`, or it is already recorded for another deck |
| 429 | problem `/problems/rate-limited`, `Retry-After` | More than `MEDIA_CONFIRM_RATE_PER_HOUR` (60) confirmations by this user in the hour |
| 503 | problem `/problems/unavailable` | `CLOUDINARY_URL` not configured |

`Cache-Control: no-store`.

## Example

```http
POST /decks/6f0e…/media/assets
Content-Type: application/json

{
  "publicId": "gobbit/items/6f0e…/k2x9q",
  "version": 1792500123,
  "signature": "4a1f…",
  "width": 3024,
  "height": 4032,
  "bytes": 2481152,
  "format": "heic"
}
```

```json
{
  "publicId": "gobbit/items/6f0e…/k2x9q",
  "width": 3024,
  "height": 4032,
  "bytes": 2481152,
  "format": "heic",
  "source": "editor",
  "createdAt": "2026-10-22T09:12:03.000Z"
}
```

## Changed: `POST /decks/{id}/items`, `PATCH /items/{id}`

| Status | Body | When |
|--------|------|------|
| 422 | problem `/problems/validation`, `errors: [{ pointer: "/payload/publicId", detail: "Unknown image" }]` | Image card whose `publicId` is not a recorded asset of the card's deck (D160) |

On success the stored payload holds `width` and `height` from the asset; values sent by the client are overwritten.

## Service only (no route in Phase 7)

`media.service.uploadFromUrl({ deckId, url, source, uploadedBy? })` returns `Promise<{ asset: MediaAsset } | { asset: null; reason: 'unavailable' | 'blocked' | 'timeout' | 'not_image' | 'too_large' | 'http_error' | 'upload_failed' }>`. The `reason` is for logs and callers; it is never shown to members. Phase 13 may expose it as an MCP tool.
