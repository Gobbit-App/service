---

description: "Task list for 030-landing-page"
---

# Tasks: Landing page

**Input**: Design documents from `/specs/030-landing-page/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/landing-pages.md; `028-waitlist` merged (`waitlist.join`, `WaitlistJoinRequest`, per-IP waitlist limiter, confirm redirect)

**Tests**: REQUIRED (constitution V). Every row of the plan's traceability table maps to a test task below.

**Organization**: Tasks are grouped by user story.

## Format: `[ID] [P?] [Story] [Tier?] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: US1 join the waitlist, US2 previews and indexing, US3 members still open the app
- **[Tier]**: `[unit]` `*.test.ts(x)` next to code, `[int]` `apps/api/test/*.int.test.ts` (Docker), `[e2e:smoke]` `e2e/tests/smoke/`, `[e2e:full]` `e2e/tests/full/` (tier rule: constitution V, ADR-053)

---

## Phase 1: Foundational (Blocking Prerequisites)

**Purpose**: Copy, styles, URL helper, routing.

- [ ] T001 [P] `landing-copy.ts` (`LANDING_COPY_EN`: title, description ≤ 160, hero, uses, labels, kind labels, state messages, field errors, privacy line, header links) in apps/api/src/public/
- [ ] T002 [P] `landing-styles.ts` (`LANDING_CSS`: hero, form, radios ≥ 44 px, status message, off-screen honeypot class; light/dark via 017 variables) in apps/api/src/public/
- [ ] T003 [P] `landingUrl(origin)` and `LANDING_PATH` + [unit] test in apps/api/src/public/public-url.ts
- [ ] T004 `/welcome` in `LENIENT_PATHS` in apps/api/src/middleware/session-auth.ts; Caddy `@landing` + `handle /welcome` blocks in apps/web/Caddyfile (contract); `welcome` in the Vite dev proxy in apps/web/vite.config.ts

**Checkpoint**: `/welcome` reaches the API in dev and Compose; cookieless `/` reaches it through Caddy

---

## Phase 2: User Story 1 — A visitor joins the waitlist (Priority: P1) 🎯 MVP

**Goal**: The landing page with a no-JS form that hands submissions to 028.

**Independent Test**: quickstart §3.

### Tests for User Story 1

- [ ] T010 [P] [US1] [unit] `landing.test.ts`: every state renders its message (`default`, `joined`, `confirmed`, `confirm-invalid`, `invalid`); unknown query → default; no `<script`; typed values escaped (`<b>` in note); labels, `fieldset`/`legend`, `aria-invalid` + `aria-describedby` on errors; default state < 30 KB
- [ ] T011 [P] [US1] [unit] `landing-form.test.ts`: urlencoded → `WaitlistJoinRequest` input (`utm_source` → `utmSource`, blank note omitted, invalid utm dropped, unknown fields ignored); Zod issues → one copy message per field
- [ ] T012 [US1] [int] `landing.int.test.ts`: valid post → 303 `/welcome?joined=1` + one pending `landing` entry + one mail; new/pending/confirmed/existing-user/honeypot posts → identical 303 (honeypot: no row, no mail); bad email → 400 with message and values, `private, no-store`, `noindex`; foreign `Origin` → 403, app origin → 303; lowered per-IP limit → 429 HTML with `Retry-After`; JSON body → 400
- [ ] T013 [P] [US1] [e2e:full] e2e/tests/full/landing.spec.ts: fill and submit on a Pixel 7 viewport → "check your email"; invalid email → message, note kept; honeypot filled (via `page.fill` on the hidden field) → same thanks state. Local stack only

### Implementation for User Story 1

- [ ] T014 [US1] `landing-form.ts` (`parseLandingForm`) in apps/api/src/public/
- [ ] T015 [US1] `landing.ts` (`landingPage(view)`: hero, uses, form, states, privacy line; `layout()` with `LANDING_CSS`) in apps/api/src/public/
- [ ] T016 [US1] `routes/landing.ts`: `GET /welcome` (state from query, `utm_source` carried), `POST /welcome` (parse → `waitlist.join({ …, source: 'landing', ip })` → 303 / 400 / 429), headers per contract; register in apps/api/src/app.ts with the waitlist per-IP limiter on POST and the anonymous read limiter on GET

**Checkpoint**: quickstart §3 passes locally

---

## Phase 3: User Story 2 — The root URL previews well (Priority: P1)

**Goal**: Preview tags, static image, sitemap.

**Independent Test**: quickstart §2 (curl lines) and §5.2.

### Tests for User Story 2

- [ ] T020 [P] [US2] [unit] `landing.test.ts`: og:title, og:description (≤ 160), og:image `${origin}/og/landing.png` with width/height, og:url and canonical = root in every state, `twitter:card summary_large_image`, `lang="en" dir="ltr"`
- [ ] T021 [P] [US2] [unit] `seo.test.ts`: root is the first sitemap `<loc>`
- [ ] T022 [US2] [int] `landing.int.test.ts`: `/sitemap.xml` lists the root; anonymous GET `public, max-age=300` + `Vary: Cookie`; no `noindex`
- [ ] T023 [US2] [e2e:smoke] e2e/tests/smoke/landing.spec.ts: anonymous `GET /` → landing HTML with og:title/og:image/og:url, the form, no `<script>`; `GET /og/landing.png` → 200 `image/png`. GET only (runs post-deploy)

### Implementation for User Story 2

- [ ] T024 [US2] `landingTree()` + `LANDING_OG_IMAGE_PATH` in apps/api/src/share/og-template.ts; render it in apps/api/scripts/og-static.ts; run `pnpm og:static` and commit apps/web/public/og/landing.png
- [ ] T025 [US2] Root first in `sitemapXml` in apps/api/src/public/seo.ts

**Checkpoint**: quickstart §2 passes on Compose

---

## Phase 4: User Story 3 — Members still open the app (Priority: P1)

**Goal**: Cookie routing keeps members in the app; signed-out app home goes to `/welcome`.

**Independent Test**: quickstart §4.

### Tests for User Story 3

- [ ] T030 [P] [US3] [unit] apps/web/src/api/session.test.ts: 401 on `/` (and `/?utm_source=x`) → `/welcome` full navigation; 401 on `/d/x` → `/sign-in?next=/d/x`; `PUBLIC_PATHS` unchanged
- [ ] T031 [US3] [int] `landing.int.test.ts`: valid session → `signed-in` state ("Open Gobbit", no form, `private, no-store`); expired session cookie → anonymous page, not 401
- [ ] T032 [US3] [e2e:smoke] e2e/tests/smoke/landing.spec.ts: with the smoke session cookie, `GET /` → the app (deck home renders)
- [ ] T033 [P] [US3] [e2e:full] e2e/tests/full/landing.spec.ts: a stale `gobbit_session` cookie on `/` ends on `/welcome`; "Sign in" link → `/sign-in`

### Implementation for User Story 3

- [ ] T034 [US3] `unauthorizedRedirect` returns `{ href: '/welcome', full: true }` for the home in apps/web/src/api/session.ts; `onUnauthorized` uses `window.location.replace` for full targets in apps/web/src/main.tsx
- [ ] T035 [P] [US3] `/^\/welcome$/` in the navigation denylist in apps/web/src/sw.ts
- [ ] T036 [US3] `signed-in` state in `landing.ts` and the route (reads `c.var.user`)

**Checkpoint**: quickstart §4 passes

---

## Phase 5: Close-out

- [ ] T050 `pnpm lint && pnpm format:check && pnpm typecheck && pnpm test:unit && pnpm test:int && pnpm build:web && pnpm budget`
- [ ] T051 [P] docs/design/waitlist.md (new or extended with 028): landing page, Caddy cookie rule, SW denylist, form PRG, CSRF same-origin note, Deviations; docs/design/public.md: link to the landing page section
- [ ] T052 [P] docs/architecture.md: at most one line for the landing page + ADR index row; docs/adr.md: **ADR-061** from D226–D227 (number reconciled at close-out)
- [ ] T053 [P] README.md: landing page URL, after-deploy steps (WhatsApp re-scrape, Search Console); infra/README.md: Caddy `@landing` and `/welcome` routes; `.env.example`: no new variables (confirm)
- [ ] T054 [P] CLAUDE.md ground rules: one line — landing page at `/welcome` (and cookieless `/` via Caddy), no-JS form through `waitlist.join` only
- [ ] T055 PLAN.md: tick demo 3 only after quickstart §5 has run on the deployed instance
- [ ] T056 Run quickstart.md validation
- [ ] T057 `/speckit-converge` until it reports Converged

---

## Dependencies & Execution Order

- **Foundational (Phase 1)**: blocks all stories
- **US1**: after Phase 1
- **US2, US3**: after US1 (they extend its page and route); independent of each other
- **External**: `028-waitlist` merged. `029-registration-gate` links to `/welcome` from sign-in and `/auth/error?reason=closed` (plain `<a href>`, since `/welcome` is not an SPA route); `031-landing-analytics` adds its script and counts `/welcome?joined=1` on these pages
- **Close-out**: after all stories

### Within Each User Story

- Tests written and FAILING before implementation
- copy/helpers → template → route → Caddy/SPA

---

## Notes

- [P] tasks = different files, no dependencies
- Log decisions the plan did not make, and deviations, in implementation-notes.md as you go
- Commit after each task or logical group (e.g. `feat(api): landing page and waitlist form`)
- Never call `raw()` on form values or query strings; smoke must stay GET-only (no waitlist rows or mail in production)
