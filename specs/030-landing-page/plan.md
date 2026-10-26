# Implementation Plan: Landing page

**Branch**: `030-landing-page` | **Date**: 2026-10-26 | **Spec**: [spec.md](./spec.md) | **Roadmap**: `PLAN.md` § Phase 9 (demo 3)

**Input**: Feature specification from `/specs/030-landing-page/spec.md`

Project override of the core template. Written for outside readers: the repository is public.

## Summary

**Page.** The API renders the landing page at `/welcome` with 017's `layout()` (`hono/html`, auto-escaped, one inline stylesheet, no script). It explains Gobbit in a few lines and holds the waitlist form. Copy lives in one module, ready for a later Hebrew version (D230).

**Root URL.** Caddy sends `/` to the API (rewritten to `/welcome`, query kept) when the request carries no `gobbit_session` cookie; with the cookie `/` stays the SPA. Crawlers and first-time visitors get real HTML with preview tags at the root; members never see the landing page (D226).

**Signed-out app.** An installed app serves `/` from the service worker, so the SPA itself sends a 401 on its home to `/welcome` with a full navigation; the service worker lets `/welcome` through to the network. A signed-in member opening `/welcome` sees an "Open Gobbit" variant without the form (D227).

**Form.** A plain urlencoded `POST /welcome` validated with 028's `WaitlistJoinRequest` schema and handed to `waitlist.join({ …, source: 'landing' })`. Every accepted outcome redirects 303 to `/welcome?joined=1`; invalid input re-renders the form with messages and values (400); limits answer a 429 page. A hidden honeypot field `website` and 028's per-IP and per-email limits keep bots out (D228).

**Preview and indexing.** A static 1200×630 image `/og/landing.png` rendered by `pnpm og:static`; canonical and `og:url` are always the root; the root is indexable and first in the sitemap (D229).

## Starting point

- `028-waitlist` merged: `waitlist.join`, `WaitlistJoinRequest` (`@pb/shared`), `WAITLIST_*` limits, the per-IP waitlist limiter (D219), `GET /waitlist/confirm` → `/welcome?confirmed=1` or `/welcome?confirm=invalid`.
- `017-public-pages`: `apps/api/src/public/` (`layout`, `styles`, `html`, `responses`, `seo`, `public-url`), `routes/public-pages.ts` (`send()` with `Vary: Cookie`, `rateLimitedHtml`), sitemap and robots from the API.
- Caddy (`apps/web/Caddyfile`): `/api/*` (stripped), `/s/*`, `/p/*`, `/sitemap.xml`, `/robots.txt` → API; else SPA; CSP `default-src 'self'`, `style-src 'self' 'unsafe-inline'`.
- Web: `routes/index.tsx` (home, `pickLanding`); `api/session.ts` (`PUBLIC_PATHS`, `unauthorizedRedirect`); `main.tsx` (query client `onUnauthorized` → `router.history.replace`); `sw.ts` navigation denylist; Vite dev proxy for `/api`, `/s`, `/p`, sitemap, robots.
- `apps/api/scripts/og-static.ts` + `share/og-template.ts` (Satori trees, `OG_WIDTH`/`OG_HEIGHT`), output committed in `apps/web/public/`.
- `middleware/csrf.ts` (origins = `CORS_ORIGINS` + origin of `API_URL`); `middleware/session-auth.ts` (`LENIENT_PATHS`, `LENIENT_PREFIXES`).

## Technical Context

**Language/Version**: TypeScript (strict, ESM, no build step) on Node ≥ 22

**Primary Dependencies**: Hono (`hono/html`), existing Satori/resvg pipeline. No new dependency.

**Storage**: none. No migration (028 owns `waitlist_entries`).

**Testing**: Vitest unit (page states, form parsing, escaping, head tags, size, `unauthorizedRedirect`); integration with Testcontainers (routes, PRG, 400/429, CSRF, cache headers, sitemap, honeypot); Playwright `@smoke` and `@full`

**E2E tier**: smoke — the root URL now crosses Caddy's cookie routing and the CSP, a deployment boundary only a real stack shows (constitution V). One smoke test, GET only: anonymous `/` → landing HTML with OG tags, the form and no `<script>`; `/og/landing.png` → 200 `image/png`; with the smoke session cookie, `/` → the app. Form submissions (happy path, invalid email with values kept, honeypot) and the stale-cookie redirect run in `@full` against the local stack only — post-deploy smoke must not write waitlist rows or send mail.

**Target Platform**: Docker Compose on Dokploy; Caddy in front; one API instance

**Project Type**: pnpm monorepo — API, PWA, shared packages

**Performance Goals**: landing page < 50 ms server time (no database read on GET); HTML + CSS < 30 KB; form completed on a phone in < 30 s (demo 3)

**Constraints**: no JavaScript on the page (031 may later add its optional analytics script); every interpolation escaped; CSP unchanged; no enumeration through the form; post-deploy checks are read-only

**Scale/Scope**: crawler and chat-preview traffic plus a few hundred visitors a week

## Constitution Check

| Principle | How this plan complies |
|-----------|------------------------|
| I. Layered API | `routes/landing.ts` (parse form, headers, PRG) → 028's `waitlist.join` (rules) → `waitlist.repo`; page templates in `public/landing.ts` |
| II. One source of truth | The form validates with 028's `WaitlistJoinRequest` and limits from `@pb/shared`; no second copy of the rules |
| III. Invariants in the DB | No new data; 028's constraints apply unchanged |
| IV. Private by default | No per-visitor content in public cached responses; 400 and signed-in variants `private, no-store`; identical answer for known/unknown/honeypot emails; nothing about members on the page |
| V. Tests at the right tier | Unit (states, escaping, tags, size), int (routes, PRG, CSRF, limits, sitemap), smoke (Caddy cookie routing + CSP + preview tags), full (form journeys) |
| VI. Lean web | The page ships no JavaScript; the SPA change is a few lines in `api/session.ts`, `main.tsx` and `sw.ts` (`pnpm budget` unchanged) |
| VII. Simple, optional | No new env var or dependency; uses `APP_URL`; works with mail off (Console mailer) like 028 |

No violations.

## Decisions this plan pins down

Full reasoning in [research.md](./research.md).

| ID | Decision | ADR? |
|----|----------|------|
| D226 | API-rendered landing page at `/welcome` (`hono/html`, 017 layout, outside OpenAPI); Caddy rewrites `/` to it when no `gobbit_session` cookie is present, else SPA; canonical and `og:url` = root via `landingUrl(origin)`; `Vary: Cookie` | yes → **ADR-061** (proposed) |
| D227 | SPA home 401 → full navigation (`location.replace`) to `/welcome`, deep links keep `/sign-in?next=`; SW denylist `/^\/welcome$/`; `/welcome` with a valid session → "Open Gobbit" variant, `private, no-store` | yes → **ADR-061** (proposed) |
| D228 | No-JS urlencoded `POST /welcome` → `WaitlistJoinRequest` → `waitlist.join`; accepted → 303 `/welcome?joined=1`; invalid → 400 re-render with values; 429 page; honeypot `website`; per-IP bucket shared with `POST /waitlist`; CSRF passes as same origin; states `joined`, `confirmed`, `confirm=invalid` | no |
| D229 | Static `/og/landing.png` 1200×630 from `og:static`'s `landingTree()`; root indexable and first in the sitemap; anonymous GET `public, max-age=300`, not in the page cache | no |
| D230 | Copy in `public/landing-copy.ts` (English, `lang`/`dir` ready for Hebrew); hero, three uses, form, privacy line; native labelled controls, ≥ 44 px targets; `LANDING_CSS` appended only on this page | no |

## Project Structure

### Documentation (this feature)

```text
specs/030-landing-page/
├── spec.md
├── checklists/requirements.md
├── plan.md
├── research.md
├── data-model.md
├── contracts/landing-pages.md
├── quickstart.md
├── tasks.md
└── implementation-notes.md   # created during /speckit-implement
```

### Source Code (repository root)

```text
apps/api/src/
├── public/
│   ├── landing.ts                # NEW: landingPage(view) for default, joined, confirmed, confirm-invalid, signed-in; form with errors
│   ├── landing-copy.ts           # NEW: all strings (English), kind labels, field messages
│   ├── landing-form.ts           # NEW: parse urlencoded body → WaitlistJoinRequest input; map Zod issues to field messages
│   ├── landing-styles.ts         # NEW: LANDING_CSS (hero, form, radios, status message)
│   ├── public-url.ts             # + landingUrl(origin)
│   └── seo.ts                    # sitemap: root first
├── share/og-template.ts          # + landingTree()
├── routes/landing.ts             # NEW: GET/POST /welcome (not in OpenAPI)
├── middleware/session-auth.ts    # LENIENT_PATHS + '/welcome'
└── app.ts                        # register landing routes; rate limits on /welcome
apps/api/scripts/og-static.ts     # + /og/landing.png
apps/api/test/landing.int.test.ts # NEW
apps/web/
├── Caddyfile                     # @landing matcher for /, handle /welcome → API
├── public/og/landing.png         # NEW (generated, committed)
├── vite.config.ts                # dev proxy + welcome
└── src/
    ├── sw.ts                     # denylist + /^\/welcome$/
    ├── api/session.ts            # unauthorizedRedirect: home → /welcome (full navigation)
    └── main.tsx                  # onUnauthorized: location.replace for full-navigation targets
e2e/tests/smoke/landing.spec.ts   # NEW: GET-only root routing + preview tags
e2e/tests/full/landing.spec.ts    # NEW: form journeys, stale cookie
```

**Structure Decision**:

- The landing page sits in `apps/api/src/public/` beside 017's pages and reuses their shell, so escaping, head tags and styles have one implementation. Separate modules for copy, form parsing and styles keep `landing.ts` a pure template.
- Its own route file, not `public-pages.ts`: the landing page has a POST, no deck lookup and no page cache.
- The cookie decision is in Caddy, not in the API, so a member's `/` never makes an extra hop and the SPA keeps its cache-first start.
- Dev (`pnpm dev`, Vite :5173) proxies `/welcome` only; `/` stays the SPA there, which sends a signed-out visitor to `/welcome` through D227. The cookie rule itself is exercised by the Compose stack (`pnpm compose:up`, Caddy on :8080) and by smoke.

## Invariant → test traceability

| Invariant / rule | Enforced in | Test (file, tier) |
|------------------|-------------|-------------------|
| FR-001 root without cookie → landing, with cookie → app | Caddyfile `@landing` | `e2e/tests/smoke/landing.spec.ts` (smoke: anonymous `/` landing; smoke session `/` app) |
| FR-002 `/welcome` always landing; signed-out SPA home → `/welcome` | `routes/landing.ts`, `api/session.ts`, `sw.ts` | `session.test.ts` (unit: `/` → `/welcome` full navigation; `/d/x` → `/sign-in?next=`); `e2e/tests/full/landing.spec.ts` (full: stale cookie on `/` ends on `/welcome`) |
| FR-003 no script | `layout.ts`, `landing.ts` | `landing.test.ts` (unit: no `<script` in any state); smoke |
| FR-004 fields, honeypot, 028 service only | `landing-form.ts`, route | `landing-form.test.ts` (unit: field mapping, `utm_source` → `utmSource`, unknown fields dropped); `landing.int.test.ts` (int: valid post creates a pending `landing` entry and one mail) |
| FR-005 PRG; errors keep values | route | `landing.int.test.ts` (int: 303 `/welcome?joined=1`; bad email → 400 with message, `aria-invalid`, typed note kept and escaped); full |
| FR-006 no enumeration | route + 028 service | `landing.int.test.ts` (int: new, pending, confirmed, existing user and honeypot posts → identical 303) |
| FR-007 states | `landing.ts` | `landing.test.ts` (unit: `joined`, `confirmed`, `confirm=invalid` messages; unknown query → default) |
| FR-008 head tags, canonical = root | `layout.ts`, `landingUrl` | `landing.test.ts` (unit: og:title/description ≤ 160/image/url, twitter:card, canonical root for every state); smoke |
| FR-009 indexable + sitemap | `seo.ts` | `seo.test.ts` (unit: root first in sitemap); `landing.int.test.ts` (int: `/sitemap.xml` contains root; no `noindex`) |
| FR-010 sign-in / open-app link | `landing.ts` | `landing.int.test.ts` (int: anonymous → "Sign in" `/sign-in`; valid session → "Open Gobbit", no form, `private, no-store`) |
| FR-011 copy in one module | `landing-copy.ts` | `landing.test.ts` (unit: templates read only from copy; `lang`/`dir` from copy) |
| FR-012 rate limited | `public-rate-limit` + 028 per-email | `landing.int.test.ts` (int: lowered limit → 429 HTML with `Retry-After`) |
| Cross-site posts refused | `hono/csrf` | `landing.int.test.ts` (int: foreign `Origin` → 403; app origin → 303) |
| Cache headers | route | `landing.int.test.ts` (int: anonymous GET `public, max-age=300` + `Vary: Cookie`; 400 `private, no-store`) |
| SC-003 size | `landing.ts` + styles | `landing.test.ts` (unit: rendered default state < 30 KB) |

## Rollout

- **Migrations**: none.
- **Env / config**: none new. `APP_URL` already set in production.
- **API client**: no change (`/welcome` is outside OpenAPI).
- **Deploy order / flags**: after 028 is deployed. API and web images deploy together (Caddy routes `/welcome` and the cookieless `/`; the SW update ships the denylist). Installed apps pick up the new service worker on their next start; until then a signed-out installed app falls back to `/sign-in` as today.
- **After deploy**: paste the root URL into WhatsApp (demo 3); re-scrape with the Facebook sharing debugger if an old preview is cached; resubmit the sitemap in Search Console (owner actions, noted in README).

## Risks

| Risk | Likelihood / impact | Mitigation |
|------|---------------------|------------|
| A member with an expired cookie sees the app shell briefly before the landing page | M / L | D227 redirect on the first 401; accepted in the spec's edge cases |
| A CDN or proxy caches the landing page for members | L / M | `Vary: Cookie` on every `/welcome` response; members never reach `/welcome` through `/` (cookie rule) |
| Bots fill the form | M / L | Honeypot, per-IP and per-email limits (028), double opt-in means no unconfirmed address is ever invited |
| Chat apps cache an old preview of the root | M / L | Static image URL; re-scrape tool after deploy |
| The Caddy cookie matcher is wrong in production (e.g. Cookie header rewritten upstream) | L / H | Smoke checks both branches on the deployed stack after every deploy |
| CSRF check rejects the form if `API_URL` ever moves to another origin | L / M | Int test pins same-origin behaviour; note in `docs/design/waitlist.md` |

## Settle before starting

- [ ] Final hero copy and kind labels (D230 drafts) — owner to confirm or replace.
- [ ] Link to a public example deck on the page: now, later, or never?

## Complexity Tracking

None.
