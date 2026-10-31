# Feature Specification: App analytics

**Feature Branch**: `033-app-analytics`

**Created**: 2026-11-01

**Status**: Draft

**Input**: User description: "Extend the Umami analytics from 031 (landing page only) to the signed-in app and the anonymous public pages (`/p/…`, `/s/…` share previews). Overturns 031's 'landing page only' scope by owner decision. Route patterns only, never real paths; signed-in members identified by their Gobbit user id; page views plus major content events (create, edit, share, delete) carrying ids only. Keep 031's guarantees: same-origin, no cookies, Do Not Track honoured, off when unconfigured, offline must not break or queue analytics. Address accountability and the privacy-notice impact of sending user ids."

Builds on [`031-landing-analytics`](../031-landing-analytics/spec.md) (self-hosted Umami, same-origin `/stats/` proxy, `ANALYTICS_SITE_ID`, the `landing.render` record). **Supersedes** 031's FR-002 and User Story 2 ("nothing tracked beyond the landing page") and the matching `PLAN.md` Phase 9 bullet; 031's other guarantees stay.

## Clarifications

### Session 2026-11-01

- Q: Which surfaces are measured, beyond the landing page? → A: The signed-in app (every SPA screen), public deck pages (`/p/…`) and share previews (`/s/…`). The sign-in flow, `/auth/error`, emails and API responses stay untracked.
- Q: What does analytics receive as the page address? → A: The route pattern only, never the real path. Deck slugs, card ids, category names, query strings and search terms are replaced by placeholders before anything is sent (e.g. `/d/:deck/i/:item`), and the page title sent is a fixed per-screen name, never a deck or card title.
- Q: Are signed-in members identified? → A: Yes, by their Gobbit user id, so analytics can be joined to database entities (decks, items, users). Anonymous visitors on public pages stay anonymous (Umami's cookieless, daily-rotating visitor hash).
- Q: What beyond page views? → A: Four content events from the app: card created, card edited, card shared, card deleted. They carry ids and fixed labels only (deck id, item id, card type, channel), never content.
- Q: Same guarantees as 031? → A: Yes: same origin, no cookies, Do Not Track honoured, nothing rendered or contacted when `ANALYTICS_SITE_ID` is unset, no third-party host. Offline use never breaks and never queues analytics.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - The operator sees how members use the app (Priority: P1)

The operator opens the analytics dashboard for the last 7 days and sees which screens members use (deck home, browse, search, editor, review, settings), how many members were active, and how often cards were created, edited, shared and deleted, so they can decide what to improve before inviting the next waitlist batch.

**Why this priority**: it is the reason the feature exists; without in-app numbers the operator only sees the landing page.

**Independent Test**: with analytics configured, sign in on two devices as two members, open a deck, search, and create one card; the dashboard for today shows two identified members, page views for `/d/:deck`, `/d/:deck/search` and `/d/:deck/new`, and one "card created" event.

**Acceptance Scenarios**:

1. **Given** analytics is configured and a member is signed in, **When** they move between screens of the app, **Then** one page view per screen is recorded under its route pattern.
2. **Given** a member saves a new card and the server accepts it, **When** the save completes, **Then** one "card created" event is recorded with the deck id, the new item id and the card type.
3. **Given** a member saves an edit (archive, restore and undelete count as edits), deletes a card, or shares a card, **When** the server accepts the action, **Then** the matching "card edited", "card deleted" or "card shared" event is recorded with ids only.
4. **Given** the server rejects an action (validation error, no permission, offline), **When** the member sees the error, **Then** no content event is recorded for it.
5. **Given** the dashboard, **When** the operator compares "card created" events for a week with the card activity log for the same week, **Then** the activity log is the authoritative number (analytics undercounts: blockers, Do Not Track, other channels).

---

### User Story 2 - Analytics rows can be joined to Gobbit data (Priority: P1)

The operator exports or queries a member's analytics sessions and joins them to Gobbit's own data by user id, deck id and item id, for example to see which decks get the most reading or which card types are created most.

**Why this priority**: the owner chose real user ids precisely for this; without it the numbers can't be tied to decks and members.

**Independent Test**: sign in as a member, open a deck and create a card; in Umami the session carries the member's user id and the event carries the deck id and item id that exist in Gobbit's database.

**Acceptance Scenarios**:

1. **Given** a member signs in, **When** the app loads, **Then** their analytics session is identified by their Gobbit user id and nothing else about them (no email, name or role label).
2. **Given** a member signs out, **When** another person signs in on the same device, **Then** later page views and events are identified by the new member's id, never the previous one's.
3. **Given** a stranger reads a public deck, **When** page views are recorded, **Then** they carry no user id.

---

### User Story 3 - Nothing private leaves Gobbit through analytics (Priority: P1)

Deck names, card titles and content, category names, search terms and email addresses never reach analytics, even though members are identified.

**Why this priority**: constitution IV (private by default). Identified sessions make any leaked name or term personal data about a known member.

**Independent Test**: with analytics configured, browse a deck named "Smith family", open a card, search "allergy", open a category; every request to `/stats/` contains only route patterns, fixed screen names, ids and fixed labels.

**Acceptance Scenarios**:

1. **Given** a member opens `/d/smith-family/i/<id>?from=search&q=allergy`, **When** the page view is sent, **Then** its address is `/d/:deck/i/:item` with no query string and its title is the fixed screen name ("Card").
2. **Given** a member opens a deck from an external link, **When** the page view is sent, **Then** the referrer is reduced to its origin (no path, no query).
3. **Given** a member with "Do Not Track" on, **When** they use the app, **Then** no page view, event or identification is sent.
4. **Given** a share preview `/s/<id>` or a public page `/p/<slug>/i/<id>`, **When** it is viewed, **Then** the address sent is `/s/:item` or `/p/:deck/i/:item`.

---

### User Story 4 - Analytics never gets in the way (Priority: P2)

Members use the app offline, on slow connections and with blockers exactly as before; self-hosters and CI run without analytics.

**Why this priority**: constitution VI (offline-first) and VII (optional).

**Independent Test**: with `ANALYTICS_SITE_ID` unset, the app, public pages and share previews make no request to `/stats/`; with it set and the analytics service down or blocked, every journey in the smoke suite passes.

**Acceptance Scenarios**:

1. **Given** `ANALYTICS_SITE_ID` is unset, **When** any page renders, **Then** it has no tracker and nothing requests `/stats/`.
2. **Given** a member is offline, **When** they browse cached decks and save drafts, **Then** no analytics request is attempted or stored for later, and nothing in the app waits on analytics.
3. **Given** the tracker is blocked or fails to load, **When** a member creates, edits, shares or deletes a card, **Then** the action behaves exactly as without analytics.
4. **Given** the app's initial load, **When** analytics is on, **Then** the initial bundle budget is unchanged and the tracker loads after the app is interactive.

### Edge Cases

- A member opens the app from the landing page: the landing visit stays anonymous (031); identification starts once the app has a session.
- A member's session expires mid-use: further page views carry no user id until they sign in again; the "unknown session" sign-in redirect itself is not tracked.
- Share previews are mostly fetched by link-preview crawlers, which run no JavaScript and are not counted; a human opening `/s/<id>` is counted once before being sent on to the app or public page.
- Public cards' share links redirect to their public page (`/p/…`); only the public page view is counted.
- Bulk publish, bulk import and review approval create many cards at once: each is one event with a count, not one event per card.
- Cards created outside the app (iPhone Shortcut, email-in, worker extraction) produce no analytics event; the activity log covers them.
- An undo (undelete within 30 days) is recorded as "card edited", not as a new creation.
- The operator's own and smoke-test traffic: smoke disables the tracker in the browser before loading pages (031's opt-out); the operator can do the same.
- Admin screens (`/admin/…`) are tracked like other app screens, with the same placeholders.
- A forged collect request to `/stats/api/send` can claim any user id; analytics numbers are therefore indicative, never used for any decision about a member.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: When analytics is configured, the signed-in app, public deck pages (`/p/…`) and share previews (`/s/…`) MUST record page views; the landing page keeps recording as in 031.
- **FR-002**: Sign-in pages, `/auth/error`, emails, API responses and any page not listed in FR-001 MUST NOT include the tracker or contact analytics.
- **FR-003**: Every page view MUST carry the route pattern instead of the real address: deck slugs, card ids, category names and every other user-chosen or generated identifier replaced by a placeholder, with no query string and no fragment.
- **FR-004**: The page title sent MUST be a fixed screen name from a known list, never deck, card or category text; referrers MUST be reduced to their origin.
- **FR-005**: A signed-in member's analytics session MUST be identified by their Gobbit user id only; identity MUST change on sign-out and sign-in, and anonymous pages MUST carry no user id.
- **FR-006**: The app MUST send "card created", "card edited", "card shared" and "card deleted" events only after the server accepted the action, each with only: deck id, item id (or a count for bulk actions), card type and channel (e.g. editor, bulk publish, review, share button).
- **FR-007**: No analytics payload MUST contain an email address, name, deck/card/category text, search terms, URL from a card, or any field a member typed.
- **FR-008**: Analytics MUST NOT set cookies, MUST honour Do Not Track (no page views, events or identification), and MUST load and send only to the app's own origin with no new host in the Content-Security-Policy.
- **FR-009**: Analytics MUST never block, delay or change a member's action or navigation; while offline nothing is sent or queued.
- **FR-010**: With analytics unconfigured, unavailable or blocked, every page and journey MUST work identically, and the system MUST run its tests without the analytics service.
- **FR-011**: The initial web bundle MUST stay within its budget; the tracker MUST load after the app is interactive.
- **FR-012**: The service MUST announce at start which surfaces analytics covers, and the operator MUST be alerted when analytics content events stop matching the card activity log (constitution VIII), extending 031's landing check.
- **FR-013**: The privacy notice MUST state, before the waitlist's first invite batch receives this change, that in-app usage is measured with the member's user id, what is and isn't collected, and that Do Not Track turns it off.

### Key Entities

- **Analytics site**: the one Umami website from 031 (same site id), now covering landing, app and public pages.
- **Page view**: route pattern, fixed screen name, referrer origin, coarse device and country, Umami's visitor hash, and for members the Gobbit user id.
- **Content event**: name (`card-created`, `card-edited`, `card-shared`, `card-deleted`), deck id, item id or count, card type, channel, time; for members the Gobbit user id.
- **Route pattern catalogue**: the fixed list of app, public and share screens with their pattern and screen name; any screen not in it is sent as a generic "other" pattern.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: For the last 7 days the operator can read active members, the most-used screens and the number of cards created, edited, shared and deleted in under 2 minutes from the dashboard.
- **SC-002**: Any member's analytics session can be matched to their user record, and any content event to its deck and card, by id.
- **SC-003**: Across the smoke suite, zero analytics requests contain a deck slug, card or category text, search term, query string or email address (verified by test).
- **SC-004**: Weekly "card created" events are within the expected undercount of the activity log for app-channel creations (no more than activity log, at least 50% of it when the operator has no blocker).
- **SC-005**: With analytics off, blocked or down, the smoke suite passes unchanged and the app makes zero requests to `/stats/`.
- **SC-006**: The initial bundle size and the app's time to interactive do not change measurably with analytics on.

## Assumptions

- The dashboard stays operator-only (031); deck owners and members don't see analytics.
- Owner decision: identifying members by user id without a consent banner is acceptable for this invite-only phase, provided the privacy notice says so (FR-013); Phase 11 revisits it with the full privacy review. Umami data stays in its own database, outside Gobbit's GDPR export, and a member's deletion does not yet erase their Umami rows (Phase 11).
- Events are sent from the browser after the server's success response; server-side channels (Shortcut, email-in, worker) are out of scope and covered by the activity log.
- "Card shared" means a member using the app's share action on a card (system share sheet or copied link) or submitting a share/paste into a deck from the app; it does not cover crawlers fetching `/s/…`.
- Event tracking beyond the four content events and page views (search queries, Ask, clicks, scroll depth) is out of scope.
- The current deployed Umami (031) is reused; no new analytics service.
