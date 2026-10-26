# Feature Specification: Waitlist admin and invite

**Feature Branch**: `032-waitlist-admin`

**Created**: 2026-10-26

**Status**: Draft

**Input**: User description: "Phase 9, part 5: a platform operator sees the waitlist, invites one confirmed entry, and that person signs in to their own empty personal deck with the `general` category. The waitlist gate must not bypass Phase 3B onboarding. PLAN.md Phase 9 demo 5."

Roadmap: `PLAN.md` § Phase 9 (demo 5). Builds on [`028-waitlist`](../028-waitlist/spec.md) (the `waitlist_entries` table and its statuses) and [`029-registration-gate`](../029-registration-gate/spec.md) (the guarded registration entry point and `REGISTRATION_MODE`). Phase 3B's `ensurePersonalDeck` gives the new user their deck. Phase 12 reuses the platform-admin rule introduced here for `/admin/domains`.

## Clarifications

### Session 2026-10-26

- Q: Who is a platform admin? → A: an email listed in the `PLATFORM_ADMINS` environment variable (comma-separated, normalized). No database role and no UI to change it; Phase 12 reuses the same list.
- Q: What does a non-admin see at the admin addresses? → A: "not found" (404), the same as a deck they can't see (ADR-004). The app shows no admin entry to them.
- Q: Which entries can be invited? → A: only `confirmed` ones. `pending` (email never confirmed) and `removed` entries are refused. Inviting an `invited` entry again resends the email.
- Q: What does the invited person receive? → A: a "You're in" email with a sign-in link that lives longer than a normal sign-in link (`WAITLIST_INVITE_TTL_DAYS`, default 7). The account exists from the moment of the invite, so a fresh sign-in link from the sign-in screen also works afterwards.
- Q: Is the personal deck created at invite time? → A: no. The account is created at invite time; the deck is ensured on first sign-in by the existing Phase 3B step, the same as for every user. The demo checks exactly this.
- Q: Can an admin invite many entries at once? → A: not in this feature. One at a time keeps the early community deliberate; bulk invite can come later.

### Open questions for the owner

- Should removing an entry delete its row (erasure) instead of marking it `removed`? The plan marks it `removed` so the email can't re-join silently; full erasure is Phase 11 (GDPR).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - The operator reviews the waitlist (Priority: P1)

The operator opens Settings on their phone, taps "Waitlist", and sees confirmed entries oldest first: email, who it's for (family, community, personal, other), their note, and when they confirmed. They filter by status or kind to see, for example, only community entries.

**Why this priority**: inviting needs a list to pick from; today the only view is SQL.

**Independent Test**: with three entries in different statuses, an admin sees them with the right filters; a signed-in non-admin opening the address gets "not found".

**Acceptance Scenarios**:

1. **Given** a platform admin, **When** they open Settings, **Then** a "Waitlist" entry is shown; for anyone else it is not.
2. **Given** a platform admin on the waitlist screen, **When** it loads, **Then** confirmed entries are listed oldest-confirmed first with email, kind, note, source and dates, and the list pages when it is long.
3. **Given** the screen, **When** the admin filters by status (pending, confirmed, invited, removed) or by kind, **Then** only matching entries are listed, with a count.
4. **Given** a signed-in user who is not a platform admin, **When** they open `/admin/waitlist` or call the admin API, **Then** they get "not found", with nothing revealing that the screen exists.
5. **Given** the device is offline, **When** the admin opens the screen, **Then** it says the waitlist needs a connection (waitlist data is never stored on the device).

---

### User Story 2 - The operator invites one entry, who signs in to their own deck (Priority: P1)

The operator taps "Invite" on a confirmed entry. The entry turns "Invited". The person gets a "You're in" email, taps the link, and lands in their own empty deck, "My deck", with the `general` category. Signing in again later from the sign-in screen works like for any member.

**Why this priority**: this is PLAN.md demo 5 — the waitlist is only useful if the door opens for the people on it, and the gate must not skip onboarding.

**Independent Test**: invite one confirmed entry; consume the link from the email; the new session's `GET /decks` lists exactly one deck, the personal one, whose categories are just `general`.

**Acceptance Scenarios**:

1. **Given** a confirmed entry, **When** the admin invites it, **Then** an account is created for that email, the entry shows "Invited" with the time and the admin, and a "You're in" email with a sign-in link is sent.
2. **Given** the invited person, **When** they open the link within its lifetime, **Then** they are signed in and land in their personal deck, which has the `general` category and no cards.
3. **Given** an invited person whose link expired, **When** they request a sign-in link from the sign-in screen, **Then** they get a normal sign-in link (they have an account now, so the gate lets them in).
4. **Given** an invited entry, **When** the admin taps "Resend", **Then** a new "You're in" email is sent and the entry stays "Invited".
5. **Given** a pending or removed entry, **When** the admin tries to invite it, **Then** it is refused with a message saying why ("hasn't confirmed their email" / "was removed").
6. **Given** an entry whose email already belongs to an account (for example, a deck owner invited them meanwhile), **When** the admin invites it, **Then** no second account is made; the entry is linked to the existing account and marked invited, and the email still goes out.

---

### User Story 3 - The operator removes an entry (Priority: P2)

Someone asks to be taken off the list, or an entry is obviously junk. The operator taps "Remove"; after a confirmation the entry is marked removed and drops out of the default list.

**Why this priority**: housekeeping, not part of the demo, but needed before the list is shown to anyone.

**Independent Test**: remove a confirmed entry; it disappears from the default view and appears under the "removed" filter; inviting it is refused.

**Acceptance Scenarios**:

1. **Given** a pending or confirmed entry, **When** the admin removes it, **Then** it is marked removed and no email is sent.
2. **Given** an invited entry, **When** the admin tries to remove it, **Then** it is refused: the person already has an account (account deletion is Phase 11).
3. **Given** a removed entry, **When** the same email submits the waitlist form again, **Then** the visitor sees the usual "check your email" answer and nothing changes (028's rule for existing entries).

### Edge Cases

- Two admins invite the same entry at the same moment: one wins; the other gets the "already invited" answer and no second account or second email is created by the losing request.
- Email sending fails after the invite is saved: the entry is still invited and the account exists; the admin sees "Invited, but the email couldn't be sent — resend" and can resend.
- `PLATFORM_ADMINS` is empty: no one is an admin; the admin addresses answer 404 for everyone; nothing else changes.
- An admin is removed from `PLATFORM_ADMINS` and the app is redeployed: their next request to the admin API gets 404.
- `REGISTRATION_MODE=open`: the screen still works (the operator may still want to invite people who asked), invites behave the same.
- An entry's note contains markup or right-to-left text: shown as plain text, with direction detected per line.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Platform admins MUST be defined only by a configured list of emails; everyone else, signed in or not, MUST get "not found" from every admin address.
- **FR-002**: Platform admins MUST be able to list waitlist entries, filtered by status and kind, newest-relevant first, in pages.
- **FR-003**: Platform admins MUST be able to invite a confirmed entry; inviting MUST create the account through the same single registration entry point the gate uses (029), record who invited and when, and send a "You're in" email with a sign-in link.
- **FR-004**: An invite MUST NOT create the personal deck itself; the first sign-in MUST go through the normal onboarding, so the person lands in their own personal deck with the `general` category.
- **FR-005**: Pending and removed entries MUST NOT be invitable; an invited entry MAY be re-sent the email; at most one account per email MUST ever exist.
- **FR-006**: Platform admins MUST be able to remove pending and confirmed entries; invited entries MUST NOT be removable here.
- **FR-007**: The app MUST tell the client whether the signed-in user is a platform admin, and MUST show the waitlist entry only to them.
- **FR-008**: The admin screen MUST NOT add to the app's start-up bundle, and waitlist data MUST NOT be stored on the device.
- **FR-009**: Every invite and removal MUST leave a trace: who did it and when on the entry, and one log line.

### Key Entities

- **Platform admin**: a signed-in user whose email is on the configured list. Not a deck role.
- **Waitlist entry** (from 028): email, kind, note, source, status, confirmed/invited times, inviter, linked account.
- **"You're in" email**: a sign-in link with a longer lifetime, sent at invite and on resend.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: From opening Settings to a sent invite takes the operator under 30 seconds on a phone.
- **SC-002**: The invited person goes from tapping the email link to seeing their own empty deck with `general` in one step, with no extra form (PLAN.md demo 5).
- **SC-003**: No non-admin request to an admin address returns anything but "not found" (covered by tests for signed-out, member, and deck-owner callers).
- **SC-004**: The app's start-up bundle stays within the 150 KB gzip budget.

## Assumptions

- The operator is one or two people; there's no admin role management, audit screen or bulk action.
- The waitlist is small (hundreds to low thousands of entries); simple paging is enough.
- English UI only, like the rest of the app today.
- Analytics (031) and the landing page (030) are independent of this screen.
