# Feature Specification: Registration gate

**Feature Branch**: `029-registration-gate`

**Created**: 2026-10-26

**Status**: Draft

**Input**: User description: "Phase 9, part 2: close the door properly. An unknown email that asks for a sign-in link lands on the waitlist instead of getting an account; an email invited to a deck can still sign in. Part of PLAN.md Phase 9 demo 1."

Roadmap: `PLAN.md` § Phase 9 (demo 1). Builds on Phase 2 (magic links, invites create the invitee's user, D22, D25, D37), Phase 3B (personal deck ensured on every sign-in) and [`028-waitlist`](../028-waitlist/spec.md) (waitlist entries, confirmation mail). [`032-waitlist-admin`](../032-waitlist-admin/spec.md) uses the same guarded entry point to let invited waitlist entries in. Phase 13's OAuth `/connect` sign-in will reuse the same gate, so MCP never becomes a way around the waitlist.

## Clarifications

### Session 2026-10-26

- Q: Where is the door? → A: At user creation. Today anyone who requests a sign-in link gets an account on first click. With the gate on, only an existing user can sign in; new users come only from a deck invite or (032) a waitlist invite.
- Q: What does an unknown email see? → A: The sign-in screen answers exactly as it does for a known email (no account enumeration, D22). The inbox gets a "you're not on Gobbit yet" mail with a link that confirms a waitlist entry (028's confirmation, source `sign_in`), never a sign-in link.
- Q: Can the gate be switched off? → A: Yes, `REGISTRATION_MODE=open` restores today's behaviour for self-hosters and local experiments. The default is `waitlist`, in every environment, so a missing variable never opens the door.
- Q: Does a deck invite still create an account? → A: Yes. A deck owner inviting someone is the trusted way in; that person signs in as today.
- Q: What about a sign-in link that was sent before the gate turned on? → A: Clicking it for an email with no user fails with a "Gobbit is invite-only for now" page that links to the waitlist. No account, deck or session is created.
- Q: Which public wording? → A: Keep it simple: "Gobbit is invite-only for now" (title) and the plain body in the auth-gate contract; no further variants for now.
- Q: How do we know who got in and why? → A: Every sign-in request, callback and registration is a decision event. Each user row stores how it was created (deck invite, waitlist invite, open sign-in) and who invited them. The configured mode is announced at start-up, and `open` in production raises an alert (constitution VIII).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A stranger asks for a sign-in link and ends up on the waitlist (Priority: P1)

Someone hears about Gobbit, opens the sign-in screen and types their email. The screen says the same thing it says to everyone. Their inbox gets a mail saying Gobbit is invite-only for now, with a button to join the waitlist. They click it and are on the waitlist. There is no way for them to sign in.

**Why this priority**: PLAN.md demo 1. Before the landing page goes live the app must stop creating accounts for anyone who types an email.

**Independent Test**: with the gate on, request a link for a new `@example.test` address: the response is the same as for a known user, no sign-in link is stored, a waitlist entry with source `sign_in` exists, and the captured mail is the waitlist mail.

**Acceptance Scenarios**:

1. **Given** the gate is on and no user has the email, **When** a sign-in link is requested, **Then** the response is identical to a known user's, no sign-in link is created, and the address receives a "not on Gobbit yet" mail whose link confirms a waitlist entry.
2. **Given** that mail, **When** the person clicks its link, **Then** their waitlist entry is confirmed (028) and they are shown the confirmed state, not signed in.
3. **Given** the same unknown email asks again within the hour, **When** the sign-in per-email limit is reached, **Then** the answer is the same `429` a known email gets and no further mail is sent.
4. **Given** a sign-in link created before the gate turned on for an email with no user, **When** it is clicked, **Then** the person lands on "Gobbit is invite-only for now" with a link to join the waitlist, and no account, personal deck or session exists afterwards.
5. **Given** a person who already has a confirmed or invited waitlist entry, **When** they request a sign-in link, **Then** they get no new mail (the waitlist doesn't resend for confirmed entries) and the screen answers as usual.

---

### User Story 2 - Existing and invited people sign in as before (Priority: P1)

A family member who has used Gobbit for months signs in on a new phone. A neighbour invited to the community deck yesterday opens their invite link today, and next week signs in again from the sign-in screen. Neither notices the gate.

**Why this priority**: the gate must not lock out anyone who is already in.

**Independent Test**: with the gate on, an existing user and a pending invitee both receive sign-in links and the callback opens a session; a deck owner can invite an email that has no account yet, and that person can accept and sign in.

**Acceptance Scenarios**:

1. **Given** an existing user, **When** they request a link and click it, **Then** they are signed in exactly as today.
2. **Given** an owner invites an email that has no account, **When** the invite is sent, **Then** the invitee's account is created as today and the invite link signs them in and lands them in the deck.
3. **Given** a pending invitee, **When** they use the sign-in screen instead of the invite link, **Then** they get a normal sign-in link (their account exists since the invite).
4. **Given** `REGISTRATION_MODE=open`, **When** an unknown email requests a link, **Then** behaviour is exactly today's: a sign-in link, and an account plus personal deck on first click.

---

### User Story 3 - Newcomers find the way in (Priority: P2)

On the sign-in screen a newcomer sees "New here? Join the waitlist". After asking for a link, the confirmation tells everyone, in one sentence, what to expect whether or not they have an account.

**Why this priority**: without it the gate is a dead end for curious visitors; it doesn't affect who can sign in.

**Independent Test**: the sign-in screen links to `/welcome`; after submitting, the "Check your inbox" copy covers both outcomes and is the same for a known and an unknown email.

**Acceptance Scenarios**:

1. **Given** the sign-in screen, **When** it renders, **Then** a "New here? Join the waitlist" link points at the landing page.
2. **Given** any well-formed email submitted, **When** the request succeeds, **Then** the message reads the same for every email: a sign-in link if you have an account, otherwise a link to join the waitlist.
3. **Given** the "invite-only" error page, **When** it renders, **Then** it offers "Join the waitlist" and "I have an account — get a new link".

### Edge Cases

- A malformed email still gets `400`; rate limits on the sign-in request still run first and still answer `429` the same for everyone.
- The waitlist step fails (database or mail error): it fails the request the same way a mail failure for a known user does today, so the outcome doesn't reveal whether an account exists.
- An email that was invited to a deck, then removed from it: the account still exists, so they can sign in (and see only their personal deck). Unchanged from today.
- Two sign-in requests for the same unknown email at once: the waitlist keeps one entry (028's uniqueness).
- Sign-in for an email whose waitlist entry is `invited` but who has no user yet can't happen: 032 creates the user in the same transaction as the invite.
- Switching from `open` to `waitlist`: accounts created while open keep working; unused sign-in links for emails with no user stop working (story 1, scenario 4).
- The seeded owner and the smoke session are existing users; nothing changes for them or for e2e.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: With registration closed (the default), the system MUST NOT create a user from a sign-in request or a sign-in link.
- **FR-002**: With registration closed, a sign-in request for an email with no user MUST create no sign-in link and MUST add (or refresh) a waitlist entry for that email, sending the waitlist mail instead.
- **FR-003**: The response to a sign-in request MUST be the same for an existing user, an unknown email, a listed email and a rate-limited waitlist step.
- **FR-004**: A sign-in link for an email with no user MUST fail with a distinct "registration closed" outcome and MUST leave no user, deck or session behind.
- **FR-005**: Deck invites MUST keep creating the invitee's user, and invitees MUST be able to sign in with an invite link or a sign-in link.
- **FR-006**: All user creation MUST go through one guarded entry point that states why the user is created (deck invite, waitlist invite, open sign-in); open sign-in MUST be refused unless registration is open.
- **FR-007**: Operators MUST be able to open registration with a single setting; an unset or invalid setting MUST NOT open it (invalid fails at start-up).
- **FR-008**: The sign-in screen MUST link to the waitlist, and the error page for the closed outcome MUST explain it and link to the waitlist.
- **FR-009**: Every sign-in request outcome (link sent, waitlisted, rate-limited with which limit), every callback outcome (signed in, failed with its reason) and every registration decision (created, existing, refused) MUST be recorded as a decision event identifying people only by id or keyed hash, never by email address.
- **FR-010**: Every user created from now on MUST store how it was created (deck invite, waitlist invite, open sign-in) and, for invites, who invited them.
- **FR-011**: The registration mode in effect MUST be recorded at start-up, and an `open` mode in production MUST be raised for alerting.

### Key Entities

- **Registration mode**: `waitlist` (closed, default) or `open`.
- **Registration reason**: why a user is being created — deck invite, waitlist invite, or open sign-in.
- **Waitlist entry** (from 028): created or refreshed with source `sign_in`.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: With the gate on, an unknown email requesting a link ends up on the waitlist and cannot sign in by any sign-in link (PLAN.md demo 1).
- **SC-002**: An email invited to a deck can accept the invite and later sign in from the sign-in screen with the gate on (PLAN.md demo 1).
- **SC-003**: Response status, body and timing class of `POST /auth/magic-link` don't distinguish existing from unknown emails (asserted by test on status and body).
- **SC-004**: Every path that creates a user is covered by a test proving the gate's decision for both modes.

## Assumptions

- 028 provides the waitlist service and its confirmation mail, including a wording variant for source `sign_in`; this feature only calls it.
- 030 provides the landing page at `/welcome`; the links added here point there. If 029 merges before 030, the links are added in 030 instead (see plan, "Settle before starting").
- Inviting someone to a deck stays open to every deck owner; limiting who can invite is out of scope.
- Phase 13 (`/connect` sign-in) is not built yet; it will call the same entry point.
