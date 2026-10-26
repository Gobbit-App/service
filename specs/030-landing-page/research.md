# Research: Landing page

Decisions continue the project-wide D numbering. Phase 9 reserves D217–D240. This feature owns **D226–D230** and **D242** (accountability, added after the range filled). D226–D227 are proposed for **ADR-063** (landing page at the root for cookieless requests) at close-out; ADR-061 is 028/029's and ADR-062 is 031's; the others stay feature-level.

## What exists today

- **Public pages** (017, D177–D181): the API renders HTML with `hono/html` (`apps/api/src/public/html.ts`, `h` escapes every value), one shell `layout(head, main)` with OG/Twitter tags, canonical, robots meta and the inline stylesheet `PUBLIC_PAGE_CSS` (`public/styles.ts`). `public/responses.ts` holds the cache headers (`PAGE_CACHE_CONTROL = public, max-age=300`, `PRIVATE_CACHE_CONTROL = private, no-store`); `public/seo.ts` builds `robots.txt` and `sitemap.xml`; routes in `routes/public-pages.ts` sit outside OpenAPI.
- **Anonymous limits** (D175): `lib/anon-rate-limiter.ts` + `middleware/public-rate-limit.ts`, with an HTML `onLimited` answer for pages (`rateLimitedHtml`).
- **Caddy** (`apps/web/Caddyfile`): `/api/*` (stripped), `/s/*`, `/p/*`, `/sitemap.xml`, `/robots.txt` → API; everything else → SPA `index.html`. CSP `default-src 'self'`, inline styles allowed.
- **SPA home** (`routes/index.tsx`): `/` lists decks or lands on the last one (`pickLanding`). Any 401 goes through `unauthorizedRedirect` (`api/session.ts`) to `/sign-in?next=…`.
- **Service worker** (`sw.ts`): navigations fall back to `/index.html` except a denylist (`/api/`, `/s/`, `/p/`, `/version.json`, `/sitemap.xml`, `/robots.txt`). Manifest `start_url: '/'`.
- **OG images**: `pnpm og:static` (`apps/api/scripts/og-static.ts`) renders static PNGs with the live Satori templates (`share/og-template.ts`) into `apps/web/public/` (committed), e.g. `/og/private.png`.
- **CSRF** (D32): `hono/csrf` checks the `Origin` of form-encoded posts against `CORS_ORIGINS` plus the origin of `API_URL`. Deployments set `API_URL` to `<app origin>/api`, so a same-origin form post passes unchanged.
- **Vite dev proxy**: `/api`, `/s`, `/p`, `sitemap.xml`, `robots.txt` → API.

## D226 — API-rendered landing page at `/welcome`, and `/` without a session cookie

- **Decision**:
  - The API serves `GET /welcome` and `POST /welcome` (outside OpenAPI) from `routes/landing.ts`, rendering with 017's `layout()` and a new `public/landing.ts` page module.
  - Caddy routes `/welcome` and `/welcome/joined` to the API, and routes `/` to the API (rewritten to `/welcome`, query kept) **only when the request has no `gobbit_session` cookie**: `@landing { path / ; not header_regexp Cookie (^|;\s*)gobbit_session= }`. With the cookie, `/` stays the SPA.
  - Canonical and `og:url` for every state and both addresses are `${APP_URL}/`, built by a new `landingUrl(origin)` next to `publicUrl()` (so Phase 12 has one more place to look, not a scattered string).
  - Responses send `Vary: Cookie`.
- **Rationale**: chat-app crawlers and first-time visitors never have a cookie, so they get real HTML with preview tags at the root, which demo 3 needs. Members always have the cookie, so they never pay for the landing page and nothing about the app's URLs or `start_url` changes. Rendering in the API reuses 017's escaping, layout and preview code and lets the form post go straight to the service that enforces the waitlist rules.
- **Alternatives considered**:
  - **Static landing HTML in the web image**: cheapest to serve, but the form would need JavaScript or a second endpoint for errors, and validation messages could not be rendered server-side.
  - **Landing page inside the SPA**: needs JavaScript and the whole app bundle for a stranger, and chat crawlers see an empty shell.
  - **Move the app off `/` (e.g. `/app`)**: changes every installed PWA's `start_url`, every bookmark and the 401/`next` logic, for no gain over the cookie matcher.
  - **Decide on session validity in Caddy (forward auth)**: one more API call per app navigation; the SPA already handles stale sessions (D227).

## D227 — Signed-out app home goes to the landing page

- **Decision**:
  - `unauthorizedRedirect` returns `/welcome` (instead of `/sign-in?next=/`) when the 401 happens on the SPA home `/` with no meaningful query, and the caller does a full navigation (`window.location.replace`, so Back does not return to the empty shell) because `/welcome` is not an SPA route. Deep links keep going to `/sign-in?next=…` (the 010 smoke test "a signed-out deep link lands on sign-in with next" is unchanged).
  - The service-worker denylist gains `/^\/welcome(\/joined)?$/`, so an installed app's navigation to `/welcome` or `/welcome/joined` reaches the network.
  - `GET /welcome` with a valid session renders the signed-in variant: the description plus an "Open Gobbit" link to `/`, no form; `Cache-Control: private, no-store`.
- **Rationale**: an installed app serves `/` from the service worker, so Caddy's cookie check never runs there; the SPA must send a signed-out user on itself. Sign-in stays one tap away on the landing page. A signed-in member who opens `/welcome` (for example from the sign-in screen's link) should not be asked to join a waitlist they are past.
- **Alternatives considered**: redirect a signed-in `/welcome` to `/` (a member checking what strangers see could not); keep `/sign-in` for the signed-out home (installed users who signed out would never see the waitlist, and a stale-cookie visitor would hit a bare sign-in form).

## D228 — No-JS form with post/redirect/get

- **Decision**:
  - `<form method="post" action="/welcome">`, `application/x-www-form-urlencoded`. Fields: `email` (`type=email`, `autocomplete=email`, `inputmode=email`, required), `kind` (four radio buttons, required: family, community, personal, other), `note` (textarea, optional, 028's limit), `utm_source` (hidden, copied from the GET query when it matches 028's pattern), `website` (honeypot: inside a block hidden with an off-screen class, `tabindex="-1"`, `autocomplete="off"`, label "Leave this empty").
  - The route maps the form fields (`utm_source` → `utmSource`) onto 028's `WaitlistJoinRequest` schema (`@pb/shared`), then calls `waitlist.join({ …, source: 'landing', ip, website })`. Every accepted outcome (new, resend, known, existing account, honeypot) → `303 Location: /welcome/joined`. Validation failure → `400` with the form re-rendered, `aria-invalid` and a message per field, values kept (escaped). Rate limit (per IP in middleware, or per email in the service) → a `429` re-render of the landing page with the visitor's values kept, an inline notice "Too many tries. Please try again in about N minutes." (N from `Retry-After`, rounded up), `Retry-After`, `private, no-store`. The notice is identical for both limits, and the reason is in 028's events (owner, 2026-10-26: a friendlier refusal than 017's bare page, without losing what was typed).
  - Anonymous per-IP limit: `public-rate-limit` on `POST /welcome` sharing 028's per-IP waitlist bucket with `POST /waitlist` (D219; the service also applies its per-email counter); `GET /welcome` shares the `/p/*` anonymous read limit.
  - Same-origin form posts already pass `hono/csrf` because the allowed list contains the origin of `API_URL`, which deployments set to the app origin + `/api`. An integration test pins this; if a deployment ever splits origins, `APP_URL`'s origin must be added to `csrfOrigins` (one line, noted in `docs/design/waitlist.md`).
  - Thanks state on its own path, `GET /welcome/joined` ("Check your email to confirm", `noindex`), so Umami funnels can match it by path (owner, 2026-10-26). Other states read from the GET query, each with its own message and the same canonical: `confirmed=1` ("You're on the list", from 028's confirm redirect), `confirm=invalid` ("That link no longer works", form shown again). Any other query → default state.
- **Rationale**: PLAN.md demo 3 asks for under 30 seconds on a phone; a plain form with three visible fields and native keyboard hints is the fastest path and works on every browser. Post/redirect/get stops double submissions on reload and gives 031 a distinct, cacheable `/welcome/joined` URL to count. Answering every accepted outcome identically keeps 028's no-enumeration rule (D22's spirit) on the web.
- **Alternatives considered**: `fetch()` to `POST /api/waitlist` with inline JS (breaks the no-JS rule and needs a CSP change); rendering the thanks message directly on the POST response (reload re-submits; harder to count); CAPTCHA (third-party script, worse for real users; the honeypot plus rate limits are enough at waitlist scale, 028).

## D242 — Landing decisions are recorded

- **Decision**: constitution VIII (ADR-060). Uses 028's `decisionLogger` (D239).
  - **`landing.render`**, one per `GET /welcome[/joined]`:
    - `state`: `default`, `joined`, `confirmed`, `confirm_invalid` or `signed_in`;
    - `via`: `root` when Caddy rewrote `/` (Caddy sets `X-Gobbit-Via: root` on that rewrite and strips any client-sent value first), `app` when the SPA sent a signed-out user here (`/welcome?from=app`), else `direct`;
    - `utmSource` when valid.
  - **`landing.form`**, one per `POST /welcome`:
    - `accepted` (the service's own `waitlist.join` event carries the real outcome);
    - `invalid`, with `fields` (field names only, never values);
    - `refused` with reason `per_ip`/`per_email`, written next to 028's refusal events so the page and the API counts can be compared.
  - Silent outcomes (honeypot, existing user) are recorded by 028, not repeated here.
- **Rationale**: the landing page makes three routing decisions about a visitor that nobody can see afterwards: Caddy's cookie rule, the SPA's signed-out redirect, and the signed-in variant. If Caddy's matcher breaks, members land on the waitlist page or strangers on the empty app shell. `via` counts show it within the hour, without waiting for a smoke run.
- **Alternatives considered**: Caddy access logs only (they live in another container, with a different format and no state); Umami only (031 is optional and blockable, so it can't be the record).

## D229 — Static preview image and indexing

- **Decision**:
  - A new Satori tree `landingTree()` in `share/og-template.ts` (brand name, one-line tagline, the card motif), rendered by `pnpm og:static` to `apps/web/public/og/landing.png` (1200×630, committed). `og:image` is `${APP_URL}/og/landing.png`; `og:type` `website`; `twitter:card` `summary_large_image`.
  - Title "Gobbit — a pocket of useful cards for your family and community"; description ≤ 160 characters (copy in D230).
  - Robots: `index` for the default and signed-out states; the root is the sitemap's first `<url>` (no `lastmod`); `robots.txt` is unchanged (`/welcome` is not disallowed, its canonical points at `/`).
  - Cache: anonymous GET states `public, max-age=300` (no per-visitor content); the 400 re-render and the signed-in variant `private, no-store`. Landing pages are not stored in 017's page cache (the page has no database reads, rendering is cheap).
- **Rationale**: the image is the same for everyone, so a static file in the web image is free to serve and already cached by Caddy (`/og/*`, one day). Reusing the OG templates keeps the look consistent with share previews.
- **Alternatives considered**: generating the image at request time (CPU for a constant image); a Cloudinary-hosted image (one more upload path for a file that belongs in the repo).

## D230 — Copy, structure and accessibility

- **Decision**:
  - All strings in `public/landing-copy.ts` (one exported object, English), with `lang="en" dir="ltr"`; a later Hebrew version adds a second object and a language choice, without template changes.
  - Structure: header (brand, "Sign in" or "Open Gobbit"), hero (`h1` + two sentences), three short points (for a family, for a community, just for you), the form, a privacy line ("We use your email only to let you in. No tracking cookies."), footer.
  - Draft hero: "A pocket of useful cards" / "Gobbit keeps the things your family or community keeps asking about — phone numbers, how-tos, links, recipes — as short cards anyone can find in seconds, even offline."
  - Kind labels: "My family", "A community I'm part of", "Just me", "Something else".
  - Accessibility: every input has a visible `<label>`; radios in a `<fieldset>` with `<legend>`; errors linked by `aria-describedby`; a status message container with `role="status"` for the joined/confirmed states; tap targets ≥ 44 px; colours from `PUBLIC_PAGE_CSS` variables (light and dark).
  - Extra CSS for the form and hero is appended to the landing page only (`LANDING_CSS`), keeping 017's stylesheet unchanged and the page under 30 KB.
- **Rationale**: one copy module makes translation a data change. Native form controls are the fastest to fill on a phone and need no script.
- **Alternatives considered**: reuse the SPA's `SignInForm` styles (the page ships no app CSS); copy inline in templates (translation would mean editing markup).
