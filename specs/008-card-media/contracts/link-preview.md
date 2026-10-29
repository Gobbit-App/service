# Contract: `POST /decks/{id}/link-preview`

Reads a page's Open Graph preview for a link card (D134). Defined in `apps/api/src/routes/media.ts`; schemas are in `@gobbit/shared/media`.

**Auth**: session only (ingest tokens rejected).

**Path**: `id`, the deck id.

**Body**: `LinkPreviewRequest` `{ "url": "https://…" }`. The URL is validated with `httpUrlSchema`; anything else answers 400 `/problems/validation`.

## Responses

| Status | Body | When |
|--------|------|------|
| 200 | `{ "preview": { "title"?, "description"?, "image"? } }` | Page fetched through `safe-fetch` and OG/title found |
| 200 | `{ "preview": null }` | Any fetch error (`blocked`, `timeout`, `not_html`, `too_many_redirects`, `http_<status>`, `fetch_failed`) or nothing to show. The reason is logged, never returned |
| 400 | problem `/problems/validation` | Body is not a valid http(s) URL |
| 401 | problem `/problems/unauthorized` | No session |
| 403 | problem `/problems/forbidden` | No `item.create` on the deck |
| 404 | problem `/problems/not-found` | Deck missing or not visible |
| 429 | problem `/problems/rate-limited`, `Retry-After` | More than `LINK_PREVIEW_RATE_PER_HOUR` (30) lookups by this user this hour. Cache hits still count |

`Cache-Control: no-store` (the server-side LRU is the cache).

## Guarantees

- The only outbound path is `createSafeFetch()` (ADR-048): http/https only, ports 80/443, every resolved address checked by `ip-guard`, 3 redirects, 10 s, 3 MB.
- `title` ≤ 200 and `description` ≤ 500 characters; `image` is an absolute http(s) URL or absent.
- The response never blocks saving: the editor treats `null`, 429 and network errors alike, as "No preview available".

## Example

```json
{ "preview": { "title": "Sourdough starter guide", "description": "Feed it twice a day…", "image": "https://example.org/og.jpg" } }
```
