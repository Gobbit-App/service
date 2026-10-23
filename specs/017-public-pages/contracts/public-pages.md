# Contract: Public pages

HTML routes on the API, reached through Caddy on the app origin. Not part of the OpenAPI document. All pages: `Content-Type: text/html; charset=utf-8`, no `<script>`, `Vary: Cookie`.

Every "not public" case answers the same 404 HTML page.

## Pages

| Route | 200 content | Other answers |
|-------|-------------|---------------|
| `GET /p/{slug}` | Deck name, public categories with counts, newest 20 cards, "Older" link (`?cursor=`) | 404 |
| `GET /p/{slug}/c/{category}` | Category name, its cards newest first, 20 per page | 404 (unknown or non-public category) |
| `GET /p/{slug}/i/{itemId}` | Full card, its public categories, "Open in app" | 301 to `/p/{current-slug}/i/{itemId}` when the card's public deck has another slug; 404 |

Query:

- `cursor` (deck and category pages): opaque, from the "Older" link. A bad cursor → 400 page.
- `view=public`: skip the member redirect.

## Member redirect (D178)

| Caller | Answer |
|--------|--------|
| No session, or a session without a role on the deck | The page |
| Session with any role on the deck, no `view=public` | 302 `Location: /d/{slug}` · `/d/{slug}/c/{category}` · `/i/{itemId}`; `Cache-Control: private, no-store` |
| Same with `view=public` | The page, `Cache-Control: private, no-store`, a "public view" note |

## Headers

| Answer | `Cache-Control` | `X-Robots-Tag` |
|--------|-----------------|----------------|
| Page, communal deck | `public, max-age=300` | — |
| Page, shared deck | `public, max-age=300` | `noindex` |
| 301 | `public, max-age=300` | — |
| 404 | `public, max-age=60` | `noindex` |
| 429 | `no-store`, plus `Retry-After` | `noindex` |

## Head tags (every page)

```html
<html lang="he" dir="rtl">
<title>…</title>
<meta name="description" content="…">           <!-- ≤ 160 chars -->
<link rel="canonical" href="https://<origin>/p/<slug>/i/<id>">
<meta property="og:type" content="article">      <!-- website for deck/category -->
<meta property="og:title" content="…">
<meta property="og:description" content="…">
<meta property="og:image" content="https://res.cloudinary.com/…">
<meta property="og:url" content="https://<origin>/p/<slug>/i/<id>">
<meta property="og:locale" content="he_IL">
<meta name="twitter:card" content="summary_large_image">
<meta name="robots" content="noindex">           <!-- shared decks only -->
```

## `GET /sitemap.xml`

`application/xml`; `<urlset>` with one `<url><loc/><lastmod/></url>` per communal public deck page, public category page and public card page. `Cache-Control: public, max-age=300`.

## `GET /robots.txt`

```text
User-agent: *
Disallow: /api/
Disallow: /s/
Disallow: /d/
Disallow: /i/
Disallow: /settings
Disallow: /share
Disallow: /sign-in
Disallow: /p/*/search
Sitemap: https://<origin>/sitemap.xml
```

## `GET /s/{itemId}` — change (D181)

| Mode | Answer |
|------|--------|
| Public | 302 `Location: https://<origin>/p/{slug}/i/{itemId}`, `public, max-age=300` |
| Private | Unchanged (generic preview, refresh to `/i/{itemId}`) |

## Caddy

```caddy
handle /p/* {
	reverse_proxy {$API_UPSTREAM:api:3000}
}
@seo path /sitemap.xml /robots.txt
handle @seo {
	reverse_proxy {$API_UPSTREAM:api:3000}
}
```
