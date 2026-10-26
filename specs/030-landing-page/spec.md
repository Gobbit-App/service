# Feature Specification: Landing page

**Feature Branch**: `030-landing-page`

**Created**: 2026-10-26

**Status**: Draft

**Input**: User description: "Phase 9, part 3: the root URL becomes a landing page for people who aren't signed in. It explains Gobbit, previews well when pasted into a chat app, and has a short waitlist form that works on a phone without JavaScript. Signed-in members still open the app at the root URL. Completes PLAN.md Phase 9 demo 3 (paste the root URL into WhatsApp and get a proper preview; complete the form on a phone in under 30 seconds)."

Roadmap: `PLAN.md` § Phase 9 (demo 3). Builds on [`028-waitlist`](../028-waitlist/spec.md) (waitlist entries, double opt-in, honeypot, rate limits: the form only calls that service) and the server-rendered public pages of [`017-public-pages`](../017-public-pages/spec.md) (layout, escaping, preview tags, no-JS rule). [`029-registration-gate`](../029-registration-gate/spec.md) links here from sign-in and its "closed" error; [`031-landing-analytics`](../031-landing-analytics/spec.md) adds visit and conversion counting to these pages only.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A visitor understands Gobbit and joins the waitlist (Priority: P1)

Someone gets the Gobbit address from a friend and opens it on their phone. The page says in a few lines what Gobbit is: a pocket of useful cards for a family or a community, shared and searchable. Below that is a short form: their email, who it is for (my family, a community, just me, something else) and an optional note. They submit and see "Check your email to confirm". The whole thing takes under 30 seconds.

**Why this priority**: PLAN.md demo 3. Registration is closed (029), so this form is the only way a stranger can ask to join.

**Independent Test**: on a phone-sized browser with JavaScript disabled, open the root URL signed out, fill the form and submit: the "check your email" state appears and the confirmation email arrives.

**Acceptance Scenarios**:

1. **Given** a visitor with no session, **When** they open the root URL, **Then** they see the landing page with the description and the waitlist form, not the app.
2. **Given** the form, **When** they enter a valid email, choose who it is for and submit, **Then** they see a "check your email to confirm" state, and a confirmation email is sent through the waitlist service.
3. **Given** the form, **When** they submit an invalid email or no choice of who it is for, **Then** the form comes back with a message next to the field and everything they typed kept.
4. **Given** an email already on the waitlist, already confirmed, or belonging to an existing account, **When** it is submitted, **Then** the visitor sees the same "check your email" state (nothing reveals whether the email is known).
5. **Given** a bot that fills the hidden field, **When** it submits, **Then** it sees the same "check your email" state and nothing is stored or sent.
6. **Given** too many submissions from one network, **When** another arrives, **Then** the visitor sees a plain "try again later" page.
7. **Given** the visitor clicks the confirmation link in the email, **When** it is valid, **Then** they land on the landing page's "you're on the list" state; **When** it has expired or was already used, **Then** they land on a "this link no longer works" state with the form to try again.

---

### User Story 2 - The root URL previews well in chat apps (Priority: P1)

A member pastes the Gobbit address into a WhatsApp group to tell friends about it. The preview shows the name, a one-line description and an image.

**Why this priority**: PLAN.md demo 3. Word of mouth in chat groups is how the waitlist will grow.

**Independent Test**: fetch the root URL as a link-preview crawler would (no cookie): the response has title, description, image and canonical-address tags, and the image loads.

**Acceptance Scenarios**:

1. **Given** a crawler with no cookie, **When** it fetches the root URL, **Then** it gets complete HTML with title, description (≤ 160 characters), a 1200×630 image and the root as canonical address.
2. **Given** the alternative address of the landing page, **When** a crawler reads it, **Then** its canonical address is the root, so previews and search engines treat both as one page.
3. **Given** a search engine, **When** it reads the sitemap, **Then** the root is listed.

---

### User Story 3 - Members still open the app (Priority: P1)

A member opens the Gobbit address or the installed app. They go straight to their decks as today; they never see the landing page while signed in. A member who signs out and opens the address sees the landing page.

**Why this priority**: the landing page must not get in the way of the people already using Gobbit.

**Independent Test**: with a session, open the root URL: the app opens on the last deck. Sign out, open the root URL: the landing page.

**Acceptance Scenarios**:

1. **Given** a browser with a session, **When** it opens the root URL, **Then** the app opens as today.
2. **Given** an installed app whose session has expired, **When** it opens at the root, **Then** it shows the landing page (not the bare sign-in screen).
3. **Given** a signed-in member who opens the landing page's own address, **When** it renders, **Then** it offers "Open Gobbit" instead of the form's sign-in link.
4. **Given** the landing page, **When** an existing member taps "Sign in", **Then** they reach the sign-in screen.

### Edge Cases

- A visitor whose browser still holds an expired session cookie: the root shows the app shell for a moment, which sends them to the landing page.
- The form is submitted with a note longer than allowed: field message, values kept.
- The form is submitted from another site (cross-site post): refused, as for every other form-encoded post.
- `?utm_source=` on the root URL is carried into the form and stored with the entry (028); other query parameters are ignored.
- Reloading the "check your email" state does not submit again (the submission answered with a redirect).
- A narrow phone screen and a large desktop screen both show the form without horizontal scrolling; tap targets are at least 44 px.
- The page works with JavaScript disabled and in a browser that blocks third-party content.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Requests for the root URL without a session cookie MUST get the landing page; requests with one MUST get the app as today.
- **FR-002**: The landing page MUST also be reachable at a fixed address that is never the app, and the app MUST send a visitor without a valid session who opens its home to that address.
- **FR-003**: The landing page and its form MUST work without JavaScript and MUST NOT load any script in this feature.
- **FR-004**: The form MUST collect email, who it is for (family, community, personal, other) and an optional note, plus a hidden honeypot field, and MUST submit through the 028 waitlist service only.
- **FR-005**: A valid submission MUST end on a "check your email" state reached by redirect; invalid input MUST re-show the form with field messages and the typed values.
- **FR-006**: The page MUST NOT reveal whether an email is known: known, listed, confirmed and honeypot submissions get the same answer as a new one.
- **FR-007**: The page MUST show distinct states after joining, after confirming, and for a confirmation link that no longer works.
- **FR-008**: The page MUST carry title, description, image and canonical-address tags; the canonical address MUST be the root URL for every state and address of the page.
- **FR-009**: The root URL MUST be indexable and listed in the sitemap.
- **FR-010**: The page MUST link to sign-in for existing members, and to "Open Gobbit" when the viewer is signed in.
- **FR-011**: The page's text MUST live in one place so a translated version can be added later.
- **FR-012**: Submissions MUST be rate limited per network, answering a plain "try again later" page when exceeded.

### Key Entities

- **Landing page**: the public HTML page that explains Gobbit and hosts the waitlist form; the same for every visitor except the signed-in variant.
- **Landing state**: which message the page shows: default, joined, confirmed, or link no longer works.
- **Waitlist submission**: email, who it is for, optional note, optional campaign source and the honeypot value, handed to the 028 service.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: The root URL pasted into WhatsApp shows the Gobbit name, a description and the image (PLAN.md Phase 9 demo 3).
- **SC-002**: A first-time visitor completes the form on a phone in under 30 seconds (demo 3).
- **SC-003**: The landing page weighs under 30 KB of HTML and CSS with no JavaScript, and answers in under 50 ms server time when cached.
- **SC-004**: A signed-in member opening the root URL reaches their deck with no extra step or redirect visible to them.
- **SC-005**: A form submission with the honeypot filled creates no waitlist entry and sends no email.

## Assumptions

- The page is English. Its text is kept in one module so a Hebrew version can follow; translation is out of scope.
- The page is served by the API like the public pages, on the app's origin, so the existing preview, escaping and no-JS rules apply.
- One API instance, as in 017; the landing page uses the same short public cache.
- The decision between landing page and app at the root is made from the presence of the session cookie only; its validity is checked by the app, which then sends the visitor on.
- Visit and conversion counting is 031's scope; this feature adds no tracking.

## Clarifications

### Session 2026-10-26

- Q: Where does the landing page live? → A: Server-rendered by the API at `/welcome`, and at `/` for requests without a session cookie (Caddy decides on the cookie); with a cookie `/` stays the app (D226, D227).
- Q: Does the form need JavaScript? → A: No. A plain same-origin form post, answered with a redirect to the "check your email" state (D228).
- Q: Which preview image? → A: A static 1200×630 image rendered by the existing `pnpm og:static` script and served by the web image (D229).
- Q: Which language? → A: English now; copy in one module, `lang`/`dir` ready for Hebrew later (D230).

### Open questions for the owner

- Should the landing page link to a public communal deck as a live example once one exists?
- Hero copy and the "who is it for" labels: are the draft wordings in D230 acceptable, or will the owner supply final copy before implementation?
