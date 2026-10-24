# Contract: Public search

Same deck rule, 404 body and lenient cookie handling as [016's public API](../../016-public-read-api/contracts/public-api.md).

## 1. `GET /public/{slug}/search` (JSON, OpenAPI, `security: []`)

| | |
|---|---|
| Query | `q` (required, trimmed, 1–`SEARCH_QUERY_MAX`), `limit?` (1–20, default 10) |
| 200 | `PublicSearchResponse` |
| 400 | Missing or too long `q`, bad `limit` |
| 404 | Deck not public / not found |
| 429 | Over `PUBLIC_SEARCH_PER_HOUR` for this IP; `Retry-After` |
| Headers | `Cache-Control: public, max-age=60` |

```json
{
  "data": [
    {
      "item": { "id": "…", "type": "text", "title": "AMKA", "body": "…", "categories": [{ "slug": "services", "name": "Services" }] },
      "why": "semantic",
      "score": 0.031
    }
  ],
  "semantic": true
}
```

`semantic: false` when there is no embedding key, a budget is used up, or the provider failed. The answer is still 200.

## 2. `GET /p/{slug}/search?q=` (HTML)

| Caller | Answer |
|--------|--------|
| Anonymous or non-member | 200 page: search form (value = `q`, escaped), results (title, snippet, link to `/p/{slug}/i/{id}`), "text matches only" note when `semantic` is false; `X-Robots-Tag: noindex`; `Cache-Control: public, max-age=60`; `Vary: Cookie` |
| Member | 302 `/d/{slug}/search?q=<q>`, `private, no-store` |
| Empty `q` | 200 page with the form and no results |
| Over the limit | 429 page, `Retry-After` |
| Not public | 404 page |

## 3. Search form on 017 pages

```html
<form method="get" action="/p/<slug>/search" role="search">
  <input type="search" name="q" maxlength="…" required>
  <button type="submit">Search</button>
</form>
```

## 4. Not offered

`/public/{slug}/ask` and any Ask variant: 404.
