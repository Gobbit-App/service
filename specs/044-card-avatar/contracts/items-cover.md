# Contract: card cover image on the items API (044)

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
  "cover": { "publicId": "gobbit/items/<deckId>/abc123", "width": 1200, "height": 1600 } // or null
}
```

`width`/`height` are omitted when the asset has no recorded dimensions.

## Create: `POST /decks/{id}/items`

Optional `cover` on any type variant:

```json
{ "type": "text", "title": "Babysitter", "body": "…", "cover": { "publicId": "gobbit/items/<deckId>/abc123" } }
```

## Update: `PATCH /items/{id}`

| `cover` in body | Effect |
|------------------|--------|
| absent | unchanged |
| `{ "publicId": "…" }` | set or replace |
| `null` | remove |

Permission: `item.update`, the same rule as any other field (FR-002). Proposals are edited by
publishers through the same route (FR-011).

## Errors

| Case | Status | Problem (`/problems/validation`) | `errors[].path` |
|------|--------|---------|------------------|
| `cover` on a `link` or `image` card | 422 | validation | `cover`: "This card type has no cover image" |
| `publicId` unknown, or recorded for another deck | 422 | validation | `cover.publicId`: "Unknown image" (same text for both, D388) |
| `cover` carries `width`, `height` or any other key | 422 | validation (zod strict) | `cover` |
| `publicId` empty or longer than 255 characters | 422 | validation | `cover.publicId` |

## Unchanged

- `POST /decks/{id}/media/sign` and `POST /decks/{id}/media/assets`: the cover image upload uses them
  as they are. The folder (`gobbit/items/<deckId>`) and tags (`editor`, `deck:<deckId>`) are the same.
- Public reads (`/public/{slug}`, `/p/…`, public search): no `cover` field (D394).
- `POST /ingest`, `POST /decks/{id}/imports`: no `cover` input.
- `GET /decks/{id}/events`: entries may now list `"cover"` in `changes`.

## Share preview (`/s/{itemId}`, `og:image` of `/p/…/i/{id}`)

Public share mode (D393), first that applies:

1. an image card's own picture (unchanged);
2. the generated card (title, excerpt, category, deck) with a visual composited at delivery by a
   Cloudinary layer into one right-hand panel. The visual is the member-set cover, or else the
   stored link/event preview snapshot, or else none. A member-set cover always supersedes an
   automatic image;
3. if rendering fails or times out: the visual alone,
   `…/image/upload/c_fill,g_auto,w_1200,h_630,f_jpg/<publicId>`, or else `/og/private.png`.

The visual's `publicId` is part of the OG content hash, so changing the cover re-renders the stored
card.

Private share mode is unchanged: `/og/private.png` and generic text, with nothing derived from the
card (no cover, title or other image).
