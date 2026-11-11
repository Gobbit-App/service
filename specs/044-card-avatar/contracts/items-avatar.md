# Contract: card avatar on the items API (044)

No new routes. Existing item routes gain one field. The OpenAPI spec and `@gobbit/api-client` are
regenerated with `pnpm api:openapi`. Errors are `application/problem+json` through the central
handler.

## Item DTO (all member read paths)

`GET /decks/{id}/items`, `GET /items/{id}`, search results, the review queue and every write response
return:

```jsonc
{
  "id": "…",
  "type": "text",
  // …existing fields…
  "avatar": { "publicId": "gobbit/items/<deckId>/abc123", "width": 1200, "height": 1600 } // or null
}
```

`width`/`height` are omitted when the asset has no recorded dimensions.

## Create: `POST /decks/{id}/items`

Optional `avatar` on any type variant:

```json
{ "type": "text", "title": "Babysitter", "body": "…", "avatar": { "publicId": "gobbit/items/<deckId>/abc123" } }
```

## Update: `PATCH /items/{id}`

| `avatar` in body | Effect |
|------------------|--------|
| absent | unchanged |
| `{ "publicId": "…" }` | set or replace |
| `null` | remove |

Permission: `item.update`, the same rule as any other field (FR-002). Proposals are edited by
publishers through the same route (FR-011).

## Errors

| Case | Status | Problem (`/problems/validation`) | `errors[].path` |
|------|--------|---------|------------------|
| `avatar` on a `link` or `image` card | 422 | validation | `avatar`: "This card type has no avatar" |
| `publicId` unknown, or recorded for another deck | 422 | validation | `avatar.publicId`: "Unknown image" (same text for both, D388) |
| `avatar` carries `width`, `height` or any other key | 422 | validation (zod strict) | `avatar` |
| `publicId` empty or longer than 255 characters | 422 | validation | `avatar.publicId` |

## Unchanged

- `POST /decks/{id}/media/sign` and `POST /decks/{id}/media/assets`: the avatar upload uses them
  as they are. The folder (`gobbit/items/<deckId>`) and tags (`editor`, `deck:<deckId>`) are the same.
- Public reads (`/public/{slug}`, `/p/…`, public search): no `avatar` field (D394).
- `POST /ingest`, `POST /decks/{id}/imports`: no `avatar` input.
- `GET /decks/{id}/events`: entries may now list `"avatar"` in `changes`.

## Share preview (`/s/{itemId}`, `og:image` of `/p/…/i/{id}`)

Public share mode (D393), first that applies:

1. an image card's own picture (unchanged);
2. the generated card (title, excerpt, category, deck) with a visual composited at delivery by a
   Cloudinary layer. The visual is the member-set avatar (a round crop), or else the stored
   link/event preview snapshot (a side panel), or else none. A member-set avatar always supersedes
   an automatic image;
3. if rendering fails or times out: the visual alone,
   `…/image/upload/c_fill,g_auto:faces,w_1200,h_630,f_jpg/<publicId>`, or else `/og/private.png`.

The visual's kind and `publicId` are part of the OG content hash, so changing the avatar re-renders
the stored card.

Private share mode is unchanged: `/og/private.png` and generic text, with nothing derived from the
card (no avatar, title or image).
