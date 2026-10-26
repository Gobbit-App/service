# Feature Specification: Landing page analytics

**Feature Branch**: `031-landing-analytics`

**Created**: 2026-10-26

**Status**: Draft

**Input**: User description: "Phase 9, part 4: privacy-friendly analytics for the landing page only. The operator sees visits and waitlist form conversion for the last 7 days on a dashboard. No cookies, no consent banner, nothing tracked inside the app. PLAN.md Phase 9 demo 4."

Roadmap: `PLAN.md` § Phase 9 (demo 4). Builds on [`030-landing-page`](../030-landing-page/spec.md) (the landing page at `/` and `/welcome`, its `/welcome/joined` thanks state) and [`028-waitlist`](../028-waitlist/spec.md) (`waitlist_summary`, the server-side count of sign-ups). Runs in parallel with [`032-waitlist-admin`](../032-waitlist-admin/spec.md).

## Clarifications

### Session 2026-10-26

- Q: Which pages are measured? → A: Only the landing page (`/` for visitors without a session, and `/welcome` with its thanks and confirmed states). Never the app, public deck pages (`/p/…`), share previews (`/s/…`) or emails.
- Q: Hosted product or self-hosted? → A: Self-hosted Umami on the same Dokploy host, with its own database on the shared Postgres (D231).
- Q: Does the browser talk to a third-party host? → A: No. The tracker script and its collect endpoint are served on the app's own origin under `/stats/` through Caddy, so the Content-Security-Policy stays `'self'` (D232).
- Q: What counts as a conversion? → A: A view of the thanks state (`/welcome/joined`) divided by landing visitors in the same period; the waitlist table stays the source of truth for sign-up counts (D233).
- Q: Is analytics required to run Gobbit? → A: No. With `ANALYTICS_SITE_ID` unset no tag is rendered and nothing is proxied or contacted (constitution VII).
- Q: Cookie or consent banner? → A: Neither. Umami sets no cookies and stores no IP address; the tracker honours "Do Not Track".
- Q: How is the dashboard reached? → A: Its own hostname (`STATS_HOST`) behind Umami's login.
- Q: Query or path for the thanks state? → A: Its own path, `/welcome/joined` (030), so Umami funnels match it.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - The operator sees how the landing page performs (Priority: P1)

A week after the waitlist opens, the operator opens the analytics dashboard, picks "Last 7 days" and sees how many people visited the landing page, where they came from (referrer, UTM source), and how many reached the "you're on the list" state.

**Why this priority**: it is PLAN.md demo 4 and the only reason the feature exists: deciding whether the landing copy works before inviting people in batches.

**Independent Test**: with analytics configured, open the landing page from two devices, submit the form on one; the dashboard for the last 7 days shows two visitors and one view of the thanks state.

**Acceptance Scenarios**:

1. **Given** analytics is configured, **When** a visitor opens `/` without a session, **Then** one page view for the landing page is recorded.
2. **Given** a visitor submits the waitlist form successfully, **When** the thanks state renders, **Then** a page view of `/welcome/joined` is recorded, and the dashboard can show it next to the landing visits for the same period.
3. **Given** a visitor arrives from a link with `utm_source=whatsapp`, **When** the dashboard is filtered to the last 7 days, **Then** the visit shows under that source.
4. **Given** the dashboard, **When** the operator compares the count of thanks views with `waitlist_summary` for the same week, **Then** the waitlist number is the authoritative one (analytics may undercount: blockers, Do Not Track).

---

### User Story 2 - Visitors and members are not tracked beyond the landing page (Priority: P1)

A visitor reads the landing page with no cookie banner and nothing loaded from another company's server. A signed-in member using the app, a stranger reading a public deck, and anyone opening a share link are never measured.

**Why this priority**: privacy by default is a constitution principle (IV); measuring the app would change what Gobbit is.

**Independent Test**: with analytics configured, load the app, a public deck page and a share preview; the browser makes no request to `/stats/` and the HTML contains no tracker tag.

**Acceptance Scenarios**:

1. **Given** analytics is configured, **When** any page other than the landing page renders (SPA, `/p/…`, `/s/…`, `/auth/error`), **Then** it contains no tracker tag.
2. **Given** a visitor with "Do Not Track" on, **When** they open the landing page, **Then** no page view is sent.
3. **Given** the landing page, **When** it loads, **Then** every request goes to the app's own origin, no cookie is set by analytics, and no email, name or note typed in the form is ever sent to analytics.
4. **Given** the tracker is blocked or fails to load, **When** the visitor submits the form, **Then** the form still works (it never needed JavaScript).

---

### User Story 3 - Analytics is optional for anyone running Gobbit (Priority: P2)

Someone self-hosting Gobbit, CI and local development run without an analytics service.

**Why this priority**: constitution VII (simple, optional, deployable).

**Independent Test**: with `ANALYTICS_SITE_ID` unset, the landing page has no tracker tag and the API boots; CI e2e passes without an Umami container.

**Acceptance Scenarios**:

1. **Given** `ANALYTICS_SITE_ID` is unset, **When** the landing page renders, **Then** it has no tracker tag and nothing requests `/stats/`.
2. **Given** `ANALYTICS_SITE_ID` is set to something that is not a UUID, **When** the API starts, **Then** it refuses to boot with a clear env error.
3. **Given** the Umami service is down, **When** a visitor opens the landing page, **Then** the page renders normally; only the script request fails.

### Edge Cases

- Ad blockers that block `/stats/script.js` or any path named `script.js`: visits are undercounted; the waitlist table remains the source of truth (US1 scenario 4). The script name can be changed in Umami if blocking is heavy.
- Smoke tests and the operator's own visits would inflate counts: smoke disables the tracker in the browser before loading the page; the operator can do the same (Umami's documented local opt-out).
- A visitor with a session opening `/` gets the app, not the landing page, so it is never counted; `/welcome` opened by a signed-in member is counted (it is the landing page).
- Confirmation links (`/api/waitlist/confirm?token=…`) never render the tracker; they redirect to `/welcome?confirmed=1`, so no token reaches analytics.
- Crawlers fetching the page for previews (WhatsApp, search engines) don't run JavaScript and are not counted.
- A burst of fake collect requests to `/stats/api/send` can inflate numbers; it cannot reach any app data. Abuse controls for it belong to Phase 11.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The landing page (`/` for visitors without a session and `/welcome` in all its states) MUST include the analytics tracker when, and only when, analytics is configured.
- **FR-002**: No other page, response or email produced by Gobbit MUST include the tracker or contact the analytics service.
- **FR-003**: The browser MUST load the tracker and send its events to the app's own origin; the Content-Security-Policy MUST NOT gain a third-party host.
- **FR-004**: Analytics MUST NOT set cookies, store IP addresses, or receive any value typed into the waitlist form; it MUST honour Do Not Track.
- **FR-005**: The operator MUST be able to see, for the last 7 days, landing visitors, page views, referrers and UTM sources, and the number of thanks-state views.
- **FR-006**: The landing page and the waitlist form MUST work identically when analytics is unconfigured, unavailable or blocked.
- **FR-007**: Analytics MUST be optional: with no analytics settings the system runs and passes its tests without the analytics service.

### Key Entities

- **Analytics site**: the one website registered in Umami for the landing page, identified by a site id.
- **Page view**: path, query, referrer, UTM parameters, coarse device and country, and a daily-rotating anonymous visitor hash (held by Umami, not by Gobbit).
- **Conversion**: a page view of the thanks state (`/welcome/joined`) in a period, relative to landing visitors in the same period.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: For the last 7 days the dashboard shows landing visitors and thanks-state views, from which the conversion rate is read in under a minute (PLAN.md demo 4).
- **SC-002**: The app, public pages and share previews make zero requests to `/stats/` (verified by test and in the browser's network panel).
- **SC-003**: The landing page sets zero cookies and loads zero resources from other origins.
- **SC-004**: The landing page's time to first render does not change measurably with analytics on (the tracker is deferred and same-origin).
- **SC-005**: With analytics unset, CI and a fresh local setup run without the analytics service.

## Assumptions

- The analytics dashboard is for the operator only; deck owners and members don't see it.
- Umami's own data (visitor hashes, page views) stays in its own database, separate from Gobbit's, and is not part of Gobbit's GDPR export (Phase 11 decides whether it needs mention in the privacy notice).
- Hebrew landing copy and its own measurement are out of scope (030 ships English).
- Event tracking beyond page views (clicks, scroll depth) is out of scope.
