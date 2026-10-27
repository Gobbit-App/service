# Data Model: Landing page analytics

No Gobbit migration and no Gobbit table. Gobbit stores nothing about visits; Umami stores page views in its own database.

## Umami database (shared Postgres)

| Item | Value |
|------|-------|
| Role / database | `umami` / `umami`, owned by the role; no extensions needed |
| Connection | `UMAMI_DATABASE_URL` (Dokploy secret), same host as Gobbit's `DATABASE_URL`; `?sslmode=require` once the connection leaves a trusted network (as for Gobbit) |
| Schema | Owned and migrated by Umami on start; Gobbit code never reads or writes it |
| What it holds | Per page view: website id, path, query, referrer, UTM parameters, browser, OS, device type, country, and a session id derived from a salted hash that rotates daily. No IP address, no cookie, no user id |
| Backup | Dokploy schedule, database `umami`, prefix `umami/`, keep 30 (optional; history loss is acceptable) |
| Retention | Umami default (kept until deleted); revisit with Phase 11 privacy work |

## Gobbit configuration

| Name | Where | Default | Meaning |
|------|-------|---------|---------|
| `ANALYTICS_SITE_ID` | API env (`x-api-env`) | empty | Umami website id (UUID). Empty → no tag anywhere (analytics off). Non-UUID → API refuses to boot |
| `STATS_BASE_PATH` | constant in `apps/api/src/public/analytics.ts` | `/stats` | Same-origin prefix for the tracker; mirrored in the Caddyfile (unit-checked) |
| `ANALYTICS_UPSTREAM` | web image env (Caddy) | `umami:3000` | Where Caddy proxies the two `/stats/` paths |

## Umami service configuration

| Name | Where | Value |
|------|-------|-------|
| `DATABASE_URL` | `umami` service | `${UMAMI_DATABASE_URL}` (secret) |
| `APP_SECRET` | `umami` service | `${UMAMI_APP_SECRET}` (secret, random) |
| `CLIENT_IP_HEADER` | `umami` service | `cf-connecting-ip` (country and visitor hash from the real client; not stored) |
| `DISABLE_TELEMETRY`, `DISABLE_UPDATES` | `umami` service | `1` |
| `STATS_HOST` | Traefik label on `umami` | dashboard hostname (non-secret default in `docker-compose.yml`) |

## `PageHead` (TypeScript)

```ts
type PageHead = {
  // …existing fields (D177)
  /** D232: set only by the landing renderer, and only when ANALYTICS_SITE_ID is configured. */
  analytics?: { siteId: string; host: string };
};
```

`host` is the public host from `publicUrl()` and becomes `data-domains`, so the tracker ignores copies of the page served elsewhere.

## Tracked URLs

| URL | Meaning | Personal data |
|-----|---------|---------------|
| `/` (no session), `/welcome` | landing visit | none |
| `/welcome/joined` | form accepted (conversion, D233) | none |
| `/welcome?confirmed=1`, `/welcome?confirm=invalid` | email confirmed / bad link | none (the token stays on `/api/waitlist/confirm`) |
| `?utm_source=…` etc. | campaign attribution | none |
