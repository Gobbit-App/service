# Contract: App analytics (033)

Extends [031's contract](../../031-landing-analytics/contracts/analytics.md). The Caddy proxy (§1 there), the environment (§3) and the opt-out (§4) are unchanged.

## 1. `GET /config`

```jsonc
{ "…": "…", "analytics": { "siteId": "<uuid>", "host": "gobbit.example" } } // or "analytics": null
```

It is public like the rest of `/config`; the site id is already public in the landing tag. `pnpm api:openapi` regenerates the client.

## 2. SPA tracker tag (appended by the lazy `analytics/tracker` chunk)

```html
<script defer src="/stats/script.js"
        data-website-id="{siteId}" data-host-url="/stats" data-domains="{host}"
        data-do-not-track="true" data-auto-track="false"
        data-exclude-search="true" data-exclude-hash="true"
        data-before-send="__gobbitAnalyticsBeforeSend"></script>
```

The tag is appended only when all of these hold: `config.analytics` is set, a member is signed in, and the first route has resolved. It is appended on idle. `index.html` never references `/stats/`.

## 3. Public page and share preview tags

When `ANALYTICS_SITE_ID` is set, these pages render the tags below: `/p/{slug}`, `/p/{slug}/c/{category}`, `/p/{slug}/i/{id}`, `/p/{slug}/search` and `/s/{id}`.

```html
<script defer src="/analytics/page.js" data-pattern="/p/:deck/i/:item" data-screen="Public card"></script>
<script defer src="/stats/script.js" data-website-id="{siteId}" data-host-url="/stats" data-domains="{host}"
        data-do-not-track="true" data-exclude-search="true" data-exclude-hash="true"
        data-before-send="__gobbitAnalyticsBeforeSend"></script>
```

The web image serves `page.js` from `apps/web/public/analytics/page.js`. The script defines the global before-send hook from its own `data-` attributes. The landing tag (031) is unchanged. These never carry a tag: error pages (404/400/429), `/sitemap.xml`, `/robots.txt`, `/sign-in` and `/auth/error`.

| Surface | Tags |
|---------|------|
| Landing (`/welcome`, signed-out `/`) | 031 tag, unchanged |
| SPA, member signed in | §2 (lazy) |
| SPA `/sign-in`, `/auth/error`, no member | none |
| `/p/…` pages, `/s/…` | §3 |
| Public error pages, sitemap, robots, emails, API JSON | none |

## 4. Payloads (after the before-send hook)

See [data-model.md](../data-model.md).

- **Page view:** `url` = the pattern, `title` = the screen name, `referrer` = the external origin or empty, `id` = the member id (SPA only).
- **Events:** `name` is one of the four content events, and `data` is limited to `deckId`, `itemId`, `count`, `type` and `channel`.

## 5. Decision event

```jsonc
{ "event": "analytics.config", "outcome": "enabled", "host": "gobbit.example",
  "surfaces": ["landing", "app", "public", "share"], "bootId": "…" }
```

`disabled` carries no host and no surfaces.

## 6. Web facade (internal API for app code)

```ts
trackContent(name: ContentEventName, props: ContentEventProps): void // never throws; no-op until loaded or while offline
```
