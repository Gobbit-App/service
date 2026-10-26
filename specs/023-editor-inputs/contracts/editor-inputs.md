# Contract: Friendlier editor inputs

## 1. Image payload (`POST /decks/{id}/items`, `PATCH /items/{id}`)

`alt` is optional and may be empty. Everything else about the image payload is unchanged (recorded asset, server-owned dimensions).

```json
{ "type": "image", "title": "School notice", "payload": { "publicId": "gobbit/items/<deckId>/abc" } }
```

```json
{ "type": "image", "title": "School notice", "payload": { "publicId": "gobbit/items/<deckId>/abc", "alt": "" } }
```

Both → `201` (create) / `200` (update). The stored payload is what was sent (plus server-owned `width`/`height`). OpenAPI: `alt?: string` in the image payload; `pnpm api:openapi` regenerates `@pb/api-client`.

## 2. Instant category save (existing `PATCH /items/{id}`)

No new endpoint. The editor sends `{ "categoryIds": [...] }` once per burst and once per Undo. Existing behaviour it relies on:

| Case | Response |
|------|----------|
| Valid visible ids | `200` with the card; categories the caller can't see are kept |
| Published card, resulting set empty | `422 /problems/item-needs-category` (the editor refuses before sending) |
| Unknown / foreign category id | `422` validation (`categoryIds`) |
| Lost access | `403` / `404` |
| Each successful save that changes the set | one `updated` event with `changes: ["categories"]` (020) |

## 3. URL fields (client only)

The server rule is unchanged: `link.url`, `link.preview.image` and `sourceUrl` must be absolute `http://` or `https://` URLs (lowercase scheme). The PWA normalises input before sending (research D205).

## 4. Public pages (`/p/…`, HTML)

An image card without alt renders `<img … alt="">` under the card's `<h1>` title. With media unconfigured, the fallback paragraph shows the alt only when there is one.
