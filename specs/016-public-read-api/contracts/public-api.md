# Contract: Public read API

All errors are `application/problem+json` (RFC 9457). The public routes take no credentials (`security: []` in OpenAPI). A cookie or bearer sent anyway is ignored, and a stale cookie is not rejected.

Every "not public" reason (unknown slug, private deck, personal deck, deleted deck) answers the same 404 body: `{ "type": "about:blank", "title": "Not Found", "status": 404, "detail": "Deck not found" }`.

Anonymous limit (D175): over 600 requests per IP per hour → 429 `/problems/rate-limited` with `Retry-After`.

## 1. `GET /public/{slug}`

| | |
|---|---|
| 200 | `PublicDeck` |
| 404 | Deck not public / not found |
| 429 | Over the anonymous limit |
| Headers | `Cache-Control: public, max-age=60` |

```json
{
  "slug": "our-street",
  "name": "Our street",
  "kind": "communal",
  "categories": [
    { "slug": "emergency", "name": "Emergency", "itemCount": 12 },
    { "slug": "schools", "name": "Schools", "itemCount": 8 }
  ]
}
```

## 2. `GET /public/{slug}/items`

| | |
|---|---|
| Query | `category?` (public category slug), `cursor?`, `limit?` (1–50, default 20) |
| 200 | `PublicItemPage`, `created_at DESC, id DESC` |
| 400 | Bad `limit` or `cursor` |
| 404 | Deck not public / not found, or `category` is not a live public category of the deck |
| 429 | Over the anonymous limit |
| Headers | `Cache-Control: public, max-age=60` |

## 3. `GET /public/{slug}/items/{itemId}`

| | |
|---|---|
| 200 | `PublicItem` |
| 404 | Deck not public, or the card is not published and live in a public category of this deck |
| 429 | Over the anonymous limit |
| Headers | `Cache-Control: public, max-age=60` |

## 4. `PATCH /decks/{id}/categories/{categoryId}` (members)

| | |
|---|---|
| Auth | Session cookie or bearer |
| Body | `CategoryPatch` `{ name?, visibility? }` |
| Access | `category.update` (owner, maintainer) |
| 200 | `Category` |
| 400 | Empty body, unknown field, bad name |
| 403 | Caller can't update categories |
| 404 | Deck or category not found / not visible to the caller |

## 5. `PATCH /decks/{id}` — change

| Case | Answer |
|------|--------|
| `isPublic` in the body, caller is `owner` | 200 as today |
| `isPublic` in the body, caller is `maintainer` | 403 `/problems/owner-required` |
| `isPublic: true` on a personal deck | 409 `/problems/personal-deck` (unchanged) |
| Other fields | `deck.update` as today |
