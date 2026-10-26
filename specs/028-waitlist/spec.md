# Feature Specification: Waitlist with double opt-in

**Feature Branch**: `028-waitlist`

**Created**: 2026-10-26

**Status**: Draft

**Input**: User description: "Phase 9, part 1: a visitor can join a waitlist with their email and who Gobbit would be for, confirms it from an email, and the team can see the demand by kind, status and week. Bot submissions are dropped silently. Completes PLAN.md Phase 9 demo 2 (sign up, click the confirmation email, see the row confirmed; a bot-style submission with the honeypot filled is silently dropped) and demo 6 (a SQL view `waitlist_summary` returns counts by kind, status and week)."

Roadmap: `PLAN.md` § Phase 9 (demos 2 and 6). First feature of the phase: [`029-registration-gate`](../029-registration-gate/spec.md) sends unknown sign-in emails here, [`030-landing-page`](../030-landing-page/spec.md) puts the form on the root URL, and [`032-waitlist-admin`](../032-waitlist-admin/spec.md) invites confirmed entries. This feature is the waitlist itself: storage, the join and confirm endpoints, spam controls, retention and the summary view. It has no screen of its own.

## Clarifications

### Session 2026-10-26

- Q: Single or double opt-in? → A: Double. An entry counts only after its owner clicks the emailed link; unconfirmed entries are pruned.
- Q: What does the visitor tell us besides the email? → A: Who it is for (family, community, just me, other) and an optional short note. A campaign tag (`utm_source`) is kept when present.
- Q: Does the response reveal whether an email is already listed or already has an account? → A: No. Every well-formed request gets the same answer; the difference shows up only in the email the address owner receives (same rule as sign-in, D22).
- Q: How are bots stopped? → A: A hidden honeypot field plus per-IP and per-email limits. No CAPTCHA.
- Q: Who reads the summary? → A: The operator, in SQL (`waitlist_summary`). An admin screen is [`032-waitlist-admin`](../032-waitlist-admin/spec.md).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Join the waitlist and confirm (Priority: P1)

A parent hears about Gobbit from a neighbour, leaves their email, says it's for their family, and adds a note ("school and clinic numbers"). They get an email within a minute, tap the link, and see that they are confirmed. Their row now reads `confirmed`.

**Why this priority**: PLAN.md demo 2. Every other Phase 9 feature (gate, landing page, admin invites) writes to or reads this list.

**Independent Test**: `POST /waitlist` with a test address; open the confirmation link from the captured mail; the row is `confirmed`.

**Acceptance Scenarios**:

1. **Given** a new email and a kind, **When** the visitor submits, **Then** the answer is "check your email", a `pending` entry exists, and one confirmation email is sent.
2. **Given** a pending entry, **When** the link in the email is opened within 7 days, **Then** the entry becomes `confirmed` and the visitor lands on a "you're on the list" page.
3. **Given** a confirmation link that was already used, has expired or is unknown, **When** it is opened, **Then** the visitor lands on a "link no longer works, join again" page and nothing changes.
4. **Given** a pending entry, **When** the same email submits again, **Then** the answer is the same, the kind and note are updated, and a fresh confirmation link replaces the old one.
5. **Given** a confirmed or invited entry, **When** the same email submits again, **Then** the answer is the same and no email is sent.
6. **Given** an email that already has a Gobbit account, **When** it submits, **Then** the answer is the same, no entry is created, and the email received says "you already have an account" with the sign-in address.

---

### User Story 2 - Bots and floods don't fill the list (Priority: P1)

A form-filling bot submits the hidden `website` field. It receives the same "check your email" answer, but nothing is stored and no email goes out. A script submitting from one address many times an hour is refused after the limit.

**Why this priority**: demo 2's second half. Without it the list (and the mail budget) fills with junk, and confirmation emails to strangers' addresses become a spam vector.

**Independent Test**: submit with `website` filled → `202`, no row, no mail; submit 11 times from one IP within an hour → the 11th gets `429`.

**Acceptance Scenarios**:

1. **Given** a submission with the honeypot filled, **When** it arrives, **Then** it is answered like a real one, nothing is stored, no email is sent, and one log line records the drop (no email address in the log).
2. **Given** more submissions from one IP than the hourly limit, **When** the next arrives, **Then** it is refused with "too many requests" and a retry time.
3. **Given** more submissions for one email than the hourly limit, **When** the next arrives, **Then** it is refused the same way, checked before any lookup so it reveals nothing.

---

### User Story 3 - See the demand (Priority: P2)

The operator runs `SELECT * FROM waitlist_summary` and sees, per ISO week, how many people joined for families, communities or themselves, how many confirmed, how many were invited and how many have since signed in.

**Why this priority**: demo 6. It decides who to invite first and whether the landing copy works; it needs no screen.

**Independent Test**: create entries in several kinds, statuses and weeks; the view's counts match.

**Acceptance Scenarios**:

1. **Given** entries of different kinds, statuses, sources and weeks, **When** the view is queried, **Then** it returns one row per (week, kind, source, status) with the count.
2. **Given** an invited entry whose user has signed in, **When** the view is queried, **Then** it is counted as `joined`, not `invited`.
3. **Given** removed entries, **When** the view is queried, **Then** they are counted under `removed` until pruned.

---

### User Story 4 - Unconfirmed emails don't linger (Priority: P2)

An address someone typed by mistake never confirms. Thirty days after its link expired, the entry is gone.

**Why this priority**: an email address is personal data; we keep only what people confirmed.

**Independent Test**: run the prune job with a clock 38 days after a pending entry was created; the entry is deleted, a confirmed one is not.

**Acceptance Scenarios**:

1. **Given** a pending entry whose confirmation expired more than 30 days ago, **When** the weekly prune runs, **Then** the entry is deleted.
2. **Given** a removed entry older than 30 days, **When** the prune runs, **Then** it is deleted.
3. **Given** confirmed or invited entries, **When** the prune runs, **Then** they are kept.

### Edge Cases

- Upper-case or padded email (`  Parent@Example.TEST `) is stored normalized and matches the same entry.
- A note over 500 characters, an unknown kind or a malformed email is a `400` with field errors (the form shows them); this reveals nothing about existing entries.
- `utm_source` that is too long or has characters outside `a-z 0-9 _ -` is dropped, not rejected.
- A removed entry's email may join again; it starts a new `pending` entry.
- Two submissions for the same new email at the same moment produce one entry (unique index; the loser updates the winner's row).
- Mail delivery fails: the entry stays `pending`, the failure is logged, the visitor still gets the same answer (a retry from the form resends).
- Confirming twice from two tabs: the second sees "link no longer works", the entry stays `confirmed`.
- The confirmation link is opened by a mail scanner that prefetches links: confirming is a single `GET` that is safe to repeat (idempotent outcome), so a prefetch confirming the address is acceptable (the scanner belongs to the address owner).
- No AI is involved; the feature works with no AI key.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Visitors MUST be able to join the waitlist with an email, a kind (family, community, personal, other) and an optional note; the system MUST also accept a campaign tag.
- **FR-002**: An entry MUST count as confirmed only after its owner opens a single-use, expiring link sent to that email.
- **FR-003**: Every well-formed join request MUST receive the same answer regardless of whether the email is new, already listed, already a user, or a bot submission.
- **FR-004**: Submissions with the honeypot filled MUST be dropped without storing anything or sending mail.
- **FR-005**: Join requests MUST be limited per IP and per email per hour; over the limit MUST be refused with a retry time.
- **FR-006**: The waitlist service MUST be callable by other features (the sign-in gate, the landing page form) with a source of `landing` or `sign_in`, applying the same rules.
- **FR-007**: Entries MUST move only along `pending → confirmed → invited`, with `removed` reachable from any state; the database MUST reject rows whose timestamps contradict their status.
- **FR-008**: Unconfirmed entries MUST be deleted 30 days after their link expired, and removed entries 30 days after removal.
- **FR-009**: A database view MUST report entry counts by ISO week, kind, source and effective status (including `joined`).
- **FR-010**: Confirmation tokens MUST be stored only as hashes, as sign-in tokens are.

### Key Entities

- **Waitlist entry**: one email's request to join: kind, optional note, source, campaign tag, status, confirmation token hash and expiry, timestamps for confirmed/invited, the inviting admin and the created user (set by 032).
- **Waitlist summary**: a read-only view of counts per week, kind, source and effective status.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Sign up, click the confirmation email, and the row is `confirmed` (PLAN.md Phase 9 demo 2).
- **SC-002**: A submission with the honeypot filled produces no row and no email, and its answer is byte-identical to a real one (demo 2).
- **SC-003**: `SELECT * FROM waitlist_summary` returns counts by kind, status and week (demo 6).
- **SC-004**: A join request answers in under 500 ms at the 95th percentile with mail sending included (Resend call is in the request, as for magic links).
- **SC-005**: No unconfirmed email is kept longer than 37 days after it was submitted.

## Assumptions

- The landing form and its confirmation pages are [`030-landing-page`](../030-landing-page/spec.md). Until 030 merges, the confirm redirect targets (`/welcome?confirmed=1`, `/welcome?confirm=invalid`) fall through to the app; this feature is testable through the API and the captured mail.
- Admin listing, invites and removal are [`032-waitlist-admin`](../032-waitlist-admin/spec.md); this feature only defines the `invited` and `removed` states and their columns.
- GDPR export/delete of a waitlist entry on request is handled by the operator in SQL until Phase 11 adds the privacy tooling.
- Copy is English only.
