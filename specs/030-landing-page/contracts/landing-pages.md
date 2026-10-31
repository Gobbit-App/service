# Contract: Landing page

`/welcome` is API-rendered HTML outside OpenAPI, like 017's `/p/*` pages. Public URLs are on the app origin; Caddy forwards `/welcome` and `/welcome/joined` to the API without stripping a prefix.

## Routes

| Method | Path | Auth | Answer |
|--------|------|------|--------|
| GET | `/welcome` | lenient session (invalid cookie ignored) | 200 HTML in the state chosen by [data-model](../data-model.md#page-states-publiclandingts) |
| GET | `/welcome/joined` | lenient session | 200 HTML, state `joined` (its own path so Umami funnels can match it, 031); a valid session still renders `signed-in` |
| POST | `/welcome` | none (session ignored) | 303 / 400 / 403 / 429, below |
| GET | `/` without `gobbit_session` cookie | — | Caddy rewrites to `GET /welcome` (query kept); the browser's URL stays `/` |

### `GET /welcome`

| Query | State |
|-------|-------|
| `confirmed=1` | `confirmed` (target of 028's confirm redirect) |
| `confirm=invalid` | `confirm-invalid` |
| `utm_source=<s>` | copied into the hidden form field when it matches 028's pattern; otherwise ignored |
| anything else | ignored → `default` |

A valid session wins over every query and renders `signed-in`.

### `POST /welcome`

Body `application/x-www-form-urlencoded`: `email`, `kind`, `note`, `utm_source`, `website` (see data-model).

| Outcome | Status | Headers / body |
|---------|--------|----------------|
| Accepted by `waitlist.join` (new, pending resend, confirmed, invited, existing user, honeypot) | 303 | `Location: /welcome/joined`, `Cache-Control: no-store` |
| Validation failed | 400 | landing page, state `invalid`, field messages, values kept; `private, no-store` |
| Cross-site `Origin` | 403 | `hono/csrf` (as for every form-encoded post) |
| Per-IP or per-email limit | 429 | landing page re-rendered with values kept and the notice "Too many tries. Please try again in about N minutes."; `Retry-After`; `private, no-store`; same notice for both limits |
| Wrong content type (e.g. JSON) | 400 | same as validation failed with an empty form |

The `Location` is relative so it stays on whichever origin served the form.

## Headers

| Response | `Cache-Control` | Other |
|----------|-----------------|-------|
| GET, anonymous, any state | `public, max-age=300` | `Vary: Cookie`; `Content-Type: text/html; charset=utf-8` |
| GET, signed-in | `private, no-store` | `Vary: Cookie` |
| POST 400 | `private, no-store` | `Vary: Cookie` |
| POST 303 | `no-store` | |
| `/og/landing.png` | Caddy's existing static rule for `/og/*` | served by the web image |

CSP is unchanged (Caddy): the page uses only inline styles (`style-src 'self' 'unsafe-inline'`) and a same-origin image.

## Head tags (every state)

```html
<html lang="en" dir="ltr">
<title>Gobbit — a deck of useful cards for your family and community</title>
<meta name="description" content="…≤ 160 characters…">
<link rel="canonical" href="https://app.example.test/">
<meta name="robots" content="index">                      <!-- noindex for the 400 re-render -->
<meta property="og:site_name" content="Gobbit">
<meta property="og:type" content="website">
<meta property="og:title" content="Gobbit — a deck of useful cards for your family and community">
<meta property="og:description" content="…">
<meta property="og:url" content="https://app.example.test/">
<meta property="og:image" content="https://app.example.test/og/landing.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:locale" content="en_US">
<meta name="twitter:card" content="summary_large_image">
```

No `<script>` element in any state.

## Sitemap and robots

- `/sitemap.xml`: `<url><loc>https://app.example.test/</loc></url>` first, before 017's public deck URLs.
- `/robots.txt`: unchanged. `/welcome` is not disallowed; its canonical points at `/`.

## Session auth

`/welcome` and `/welcome/joined` join `LENIENT_PATHS` in `middleware/session-auth.ts`: a valid session sets the user (for the `signed-in` state), an invalid or expired one is ignored instead of answering 401.

## Decision events (D242)

| Request | Event | Fields |
|---------|-------|--------|
| `GET /welcome`, `/welcome/joined` | `landing.render` | `state`, `via` (`root` / `app` / `direct`), `utmSource?` |
| `POST /welcome` accepted | `landing.form` `accepted` | (028's `waitlist.join` carries the outcome) |
| `POST /welcome` invalid | `landing.form` `invalid` | `fields` (names only) |
| `POST /welcome` limited | `landing.form` `refused` · `per_ip`/`per_email` | `retryAfterSec` |

## Caddy (`apps/web/Caddyfile`)

Placed before the SPA fallback, next to the existing `/p/*` block:

```caddyfile
@landing {
	path /
	not header_regexp Cookie (^|;\s*)gobbit_session=
}
handle @landing {
	rewrite * /welcome?{query}
	reverse_proxy {$API_UPSTREAM:api:3000}
}

handle /welcome /welcome/joined {
	reverse_proxy {$API_UPSTREAM:api:3000}
}
```

- The matcher looks only at cookie presence; validity is the SPA's job (D227).
- HEAD requests follow the same rules (crawlers).
- The response at `/` carries the API's `Vary: Cookie`, so shared caches keep the two variants apart.

## Service worker (`apps/web/src/sw.ts`)

The navigation route's denylist gains `/^\/welcome(\/joined)?$/` (query strings are not part of the pathname matched), so `/welcome` and `/welcome/joined` navigations reach the network instead of `index.html`. `/` stays served from the precached shell for installed apps.

## SPA (`apps/web/src/api/session.ts`, `main.tsx`)

| 401 while on | Target | Navigation |
|--------------|--------|------------|
| `/` (no query other than `utm_*`) | `/welcome` | full (`window.location.replace`) |
| any other app path | `/sign-in?next=<path>` (unchanged, D66) | router `history.replace` |
| `PUBLIC_PATHS` (`/sign-in`, `/auth/error`) | none (unchanged) | — |

## Vite dev proxy (`apps/web/vite.config.ts`)

The public-pages entry becomes `'^/(p/.*|welcome(/joined)?|sitemap\\.xml|robots\\.txt)$'` (plus `/welcome?…` via Vite's path match). Dev does not emulate the cookie rule for `/`.
