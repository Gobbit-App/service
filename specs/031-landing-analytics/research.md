# Research: Landing page analytics

Decisions continue the project-wide D numbering. Phase 9 reserves D217–D240. This feature owns **D231–D233** and **D243** (accountability, added after the range filled). D231 and D232 together become **ADR-062 (landing analytics: self-hosted, same-origin, landing only)** at close-out; D233 is feature-local.

## What exists today

- One origin: Caddy in the web image (`apps/web/Caddyfile`) routes `/api/*` (stripped), `/s/*`, `/p/*`, `/sitemap.xml`, `/robots.txt` to the API and serves the SPA for everything else (D51). Its CSP is `default-src 'self'` with Cloudinary allowed only in `connect-src` and `img-src https:`; no third-party script is allowed anywhere.
- Public HTML pages are API-rendered with `hono/html` through `layout(head, main)` in `apps/api/src/public/layout.ts`: "one inline stylesheet, no script" (D177).
- 030 adds the landing page through the same layout at `/welcome` and at `/` for requests without a `gobbit_session` cookie, with a no-JS form that redirects to `/welcome/joined` and a confirm redirect to `/welcome?confirmed=1`.
- 028's `waitlist_summary` view counts sign-ups by kind, status, source and week: the server-side truth for conversions.
- Deployment: one Dokploy Compose project (`infra/docker-compose.yml`, pasted into Dokploy as raw YAML), shared Postgres outside it (ADR-039), secrets only in Dokploy env (D52). `CLIENT_IP_HEADER=cf-connecting-ip` because Cloudflare fronts the tunnel.
- No analytics of any kind today.

## D231 — Self-hosted Umami for landing analytics

- **Decision**: run [Umami](https://umami.is) (MIT licence, cookieless, no IP storage, daily-rotating visitor hash) as an `umami` service in the deck's Compose project, using the official PostgreSQL image pinned to a released tag, with its own role and database (`umami`) on the shared Postgres. Secrets in Dokploy: `UMAMI_DATABASE_URL`, `UMAMI_APP_SECRET`. One Umami "website" for the landing page; its id is `ANALYTICS_SITE_ID` for the API. Umami's dashboard gives visitors, views, referrers, UTM, country/device and query filters over any range, including "Last 7 days".
- **Rationale**: demo 4 asks for a dashboard with visits and conversion; building one would be custom code for a solved problem (constitution VII prefers an established tool). Umami needs no cookie banner, keeps data on infrastructure we already run and back up, runs on Postgres (no new database engine) and serves its tracker from our origin, which keeps the CSP unchanged. Its tracker is small (~2 KB) and loads deferred.
- **Alternatives considered**:
  - **Plausible, hosted**: equally privacy-friendly and polished, but data leaves our infrastructure and the browser would talk to a third party unless proxied; adds an external account to the deployment. Self-hosted Plausible needs ClickHouse, a second database engine for one page.
  - **GoatCounter**: lightweight and privacy-friendly; hosted is third-party, self-hosted brings SQLite/its own Postgres schema and a weaker funnel/UTM view than Umami.
  - **Our own counter table** (API logs a row per landing view, SQL view for the week): no new service, but no dashboard, no referrer/UTM/device breakdown without reimplementing them, and visit de-duplication without cookies is exactly the part worth not writing ourselves. `waitlist_summary` already covers the server-side side of conversion.
  - **Cloudflare Web Analytics**: free and cookieless, but it injects a third-party beacon (`static.cloudflareinsights.com`) and measures the whole host, app included.
- **New dependency**: one container image (Umami); no npm dependency. Recorded here as constitution VII requires.

## D232 — Same origin, landing pages only, off by default

- **Decision**:
  - Caddy proxies exactly two paths to `{$ANALYTICS_UPSTREAM:umami:3000}`: `/stats/script.js` → `/script.js` and `/stats/api/send` → `/api/send` (`handle_path /stats/*` with a matcher that allows only those two; anything else under `/stats/` is 404). The Umami dashboard is **not** reachable through the app origin.
  - The tracker tag `<script defer src="/stats/script.js" data-website-id="…" data-host-url="/stats" data-do-not-track="true" data-domains="<public host>">` is rendered by the shared public `layout()` only when the page head carries `analytics` (`{ siteId, host }`, set only when `ANALYTICS_SITE_ID` is configured). Only 030's landing renderer sets it; public deck pages, error pages and the SPA's `index.html` never do.
  - API env: `ANALYTICS_SITE_ID` (optional UUID). Unset → no tag (off). `ANALYTICS_BASE_PATH` is not configurable: `/stats` is a constant shared by the layout and the Caddyfile.
  - Umami env: `CLIENT_IP_HEADER=cf-connecting-ip` (country lookup and visitor hash use the real client; Umami stores neither IP), `DISABLE_TELEMETRY=1`, `DISABLE_UPDATES=1`.
  - The service worker's navigation denylist gains `^/stats/` (defensive; navigations never target it).
  - Dashboard access: a separate Traefik router on the `umami` service for a stats hostname (`STATS_HOST`), protected by Umami's own login (default admin password changed at first boot). Owner confirmed this (2026-10-26).
- **Rationale**: same origin keeps CSP `'self'`, avoids a third-party request the visitor never agreed to, and makes the tracker survive most blocklists that match on analytics domains. Proxying only two paths keeps the app origin from exposing Umami's login or API. Rendering the tag from the layout with an explicit opt-in per page makes "landing only" a reviewable property with one test per page type. The landing page breaks D177's "no script" rule for public pages with one deferred, optional, same-origin script; the form and content never depend on it.
- **Alternatives considered**: Umami on its own subdomain loaded directly by the browser (third-party request, CSP change, blocklist-prone); inline tracker code in the page (needs `'unsafe-inline'` or a nonce for scripts); a Caddy-side, cookie-based switch to inject the tag (routing logic in the proxy instead of the page that owns it); `BASE_PATH` on Umami to serve the whole app under `/stats` (needs a custom Umami build and exposes the dashboard on the app origin).

## D233 — Conversion measurement and the operator's view

- **Decision**: conversion for a period = page views of the path `/welcome/joined` ÷ unique visitors to `/` and `/welcome` (excluding the thanks and confirmed states) in the same period, read in Umami as a two-step funnel `/` or `/welcome` → `/welcome/joined` (funnels match paths, hence the own path; owner, 2026-10-26). Confirmed sign-ups (`/welcome?confirmed=1`) are visible the same way. The authoritative sign-up count is `waitlist_summary` (028); the quickstart compares the two. The tracker records the URL with its query, which carries only `confirmed`, `confirm=invalid` and UTM parameters: no token or email is ever in a landing URL (confirm tokens live on `/api/waitlist/confirm`, which redirects). Smoke tests and the operator opt out in the browser with Umami's `localStorage` switch (`umami.disabled = 1`) so they don't inflate counts.
- **Rationale**: page views of a distinct state need no JavaScript events and no change to the no-JS form; the thanks state renders only after the server accepted the submission, so it is a real conversion, not a click. Undercounting from blockers is acceptable because the waitlist table is exact.
- **Alternatives considered**: a `data-umami-event` click event on the submit button (counts clicks, including invalid submissions); a server-to-server event from the API on each successful join (exact, but sends traffic from the server's IP that skews visitor stats, and couples the waitlist service to analytics); keeping the thanks state on `/welcome?joined=1` (no 030 change, but Umami's funnel can't match it; the owner chose the own path, 2026-10-26).

## D243 — Analytics is checked against the record, never the record

- **Decision**: constitution VIII (ADR-060). Analytics makes no decision about a person, so it adds no per-visitor event. Its one decision is whether the tag is on, and two checks keep it honest:
  - **Start-up**: the API emits `analytics.config` once, with `enabled` (bool) and `host` when enabled, never the site id. The worker doesn't render pages, so it doesn't emit.
  - **Cross-check**: Umami's daily landing visitors are compared with 030's `landing.render` count (`state` `default`, `via` ≠ `app`). Alert when renders are > 0 and Umami shows 0 for 24 hours while `enabled` (tag broken, CSP regression, proxy down), or when Umami shows less than 20% of renders over 7 days (blocking or a broken script).
  - The `/stats/*` proxy is Caddy's; Caddy's access log is the record of tracker traffic, and Umami's 4xx/5xx on `/stats/api/send` are watched as a rate.
- **Rationale**: Umami undercounts by design (blockers, DNT), so it is never the record of what happened. 030's events and `waitlist_summary` are. But a tag that silently stops sending looks just like "nobody came". Comparing it with the record is the only way to tell them apart.
- **Alternatives considered**: a server-side event from the API to Umami per render (couples the API to analytics, skews visitor stats; rejected in D233); no check (an outage of the tag would be invisible until someone looks at the dashboard).
