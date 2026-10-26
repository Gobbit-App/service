# Contract: Landing analytics

No OpenAPI route. The contract is the proxy surface, the tag and the configuration.

## 1. Caddy proxy (`apps/web/Caddyfile`)

| Request | Upstream | Notes |
|---------|----------|-------|
| `GET /stats/script.js` | `{$ANALYTICS_UPSTREAM:umami:3000}` `/script.js` | Tracker; `Cache-Control: public, max-age=86400` |
| `POST /stats/api/send` | `{$ANALYTICS_UPSTREAM:umami:3000}` `/api/send` | Collect endpoint; request headers (incl. `cf-connecting-ip`) passed through |
| any other `/stats/*` | — | `404`; the dashboard and Umami's API are never served on the app origin |

Placed before the SPA `handle`, after `/p/*` and `@seo`. The CSP header is unchanged: `default-src 'self'` already allows a same-origin script and `connect-src 'self'` the collect call.

Sketch:

```caddyfile
@stats path /stats/script.js /stats/api/send
handle @stats {
	uri strip_prefix /stats
	reverse_proxy {$ANALYTICS_UPSTREAM:umami:3000}
}
handle /stats/* {
	respond 404
}
```

With no `umami` service running (CI, local without the profile) the two paths answer 502; nothing requests them because no tag is rendered.

## 2. Tracker tag

Rendered in `<head>` by `layout()` only when `head.analytics` is set:

```html
<script defer src="/stats/script.js"
        data-website-id="{ANALYTICS_SITE_ID}"
        data-host-url="/stats"
        data-domains="{public host}"
        data-do-not-track="true"></script>
```

| Page | Tag |
|------|-----|
| `/` without a session (landing), `/welcome` and its `?joined=1`, `?confirmed=1`, `?confirm=invalid` states, form re-render with errors | yes, when `ANALYTICS_SITE_ID` is set |
| SPA (`index.html`, every app route), `/p/…`, `/s/…`, `/sitemap.xml`, `/robots.txt`, `/auth/error`, API error pages, emails | never |

All attribute values are escaped by `h`. `src` and `data-host-url` are relative (same origin).

## 3. Environment

| Variable | Service | Required | Default | Validation |
|----------|---------|----------|---------|------------|
| `ANALYTICS_SITE_ID` | api, worker (shared `x-api-env`) | no | empty | UUID when set, else boot fails |
| `ANALYTICS_UPSTREAM` | web | no | `umami:3000` | — |
| `UMAMI_DATABASE_URL` | umami | when the service runs | — | Dokploy secret |
| `UMAMI_APP_SECRET` | umami | when the service runs | — | Dokploy secret |
| `STATS_HOST` | umami (Traefik label) | no | dashboard hostname | — |

## 4. Opt-out

Setting `localStorage.setItem('umami.disabled', '1')` in a browser stops that browser from sending events. Smoke sets it with `page.addInitScript` before loading the landing page; the operator sets it once on their own devices.
