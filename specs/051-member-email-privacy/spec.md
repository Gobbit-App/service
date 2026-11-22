# Feature Specification: Member email privacy — no addresses in member data

**Feature Branch**: `051-member-email-privacy`

**Created**: 2026-11-21

**Status**: Draft

**Input**: User description: "The next phase in the community go-list plan after spec 050": H6, no email addresses in member data. No answer about a deck's members carries an email address, for any deck kind and any role, owners included: member list, role change, invite answer, reminder and event audience pickers. People appear by profile name and avatar. Inviting stays by email address or username. One exception: an invite made by typing an address keeps showing that address in the invites list to the inviter. An invite made by username never shows the address to anyone. To settle: who sees the typed address, a fallback name that does not give away the address, limits on lookups, telling two people with the same name apart.

Roadmap: the first communal deck launch, stage 3 (alpha), "getting in": [`community-go-list.md`](../../community-go-list.md) H6 (closes G17). Builds on [`046-user-profile`](../046-user-profile/spec.md) (profile names, usernames, avatars, exact lookup, invite by username). The go-list planned H6 as an amendment to 046; 046 has merged since, so it is this new feature instead (`specs/README.md`, Ageing).

## Background

Before alpha testers are invited (stage 3), people who do not know each other share decks. Today their email addresses travel with the member data:

- Every role can list a deck's members. A member who has no username has their address in that list, shown to every other member, readers included. 046 hid the address only for members with a username.
- A role change and an invite made by email answer with the member's address.
- A member's name, when they have not typed one, is made from the first part of their address ("dana.levi" for `dana.levi@example.test`). That name is shown to other members in the members list, the activity log, the review queue, share rows and the invite mail ("Dana invited you…"). Their avatar initials come from the same part ("DL").

Already settled by 046 and kept as is:

- Lookup is an exact match on a username or an email address, answered the same way for a hit and a miss, never with an address. An email lookup is answered only for people who already share a deck with the caller. Lookups are rate limited per member and each one is a decision event, with an alert on volumes that look like enumeration (D424, `docs/design/profile.md`).
- The avatar's label on a card is the username, else the profile name, else "Member" (D422).
- Card creator summaries never carry an address (D427).

## Clarifications

### Session 2026-11-21

- Q: Is anything added on top of the "Member" name for someone who typed no name? → A: Nothing, for now. A later call to action to finish one's profile (`PLAN.md` Phase 16, item 6) is what will nudge people to set a name and username; it is not part of this feature.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Members never see each other's addresses (Priority: P1)

A reader invited to the communal deck opens the deck's members. They see each person's avatar, name and role, and a username where one is set. No address appears, not for members without a username, not for owners, and not on their own row. A co-owner who changes someone's role or picks people for an event's notice sees the same: names and avatars, no addresses.

**Why this priority**: this is the privacy rule itself. Alpha testers are people we know, but they do not all know each other, and a communal deck later puts strangers side by side.

**Independent Test**: on a deck with an owner, a co-owner, a maintainer, an editor and a reader, some with a username and some without, read every answer that describes the deck's members as each role. No answer contains any member's email address, apart from the one case in User Story 3.

**Acceptance Scenarios**:

1. **Given** a member without a username, **When** any other member, of any role, lists the deck's members, **Then** that member appears by name and avatar, with no address.
2. **Given** an owner, **When** they change a member's role, **Then** the answer describes the member without their address.
3. **Given** an owner or maintainer choosing who an event or reminder notifies, **When** the list of members is shown, **Then** it shows names and avatars only.
4. **Given** a member viewing the members list, **When** they find their own row, **Then** it shows their name and avatar like everyone else's; their own address stays where it is today, in their own settings.
5. **Given** an owner who invites someone by username, **When** the invite is sent, then or at any later time, **Then** no one on the deck, the inviter included, sees that person's address.

---

### User Story 2 - A name that does not give away the address (Priority: P1)

A member who has never typed a name joins a deck. Wherever other people see them (members list, activity log, review queue, share rows, the inviter's name in an invite mail), the name and avatar shown say nothing about their address.

**Why this priority**: hiding the address field is not enough while the name is the address's first part; for most people that part is their real name or a handle they use elsewhere.

**Independent Test**: create a member with the address `dana.levi@example.test` and no profile name or username. Every place another member sees them shows a name that does not contain "dana" or "levi", and avatar initials that are not "DL".

**Acceptance Scenarios**:

1. **Given** a member with no profile name and no username, **When** other members see them anywhere, **Then** the name shown is never built from their address. Anyone with nothing else to show, a pending invitee who has never signed in included, is shown as "Member", the label 046 already uses on cards (D422). Nothing is added on top in this feature.
2. **Given** that member's avatar, **When** it is shown to others, **Then** its initials come from the same name source as the name shown, never from the address; with no letters to use, the neutral person glyph from 046 is shown on the member's own colour.
3. **Given** a member who sets a profile name or a username, **When** others next see them, **Then** they see that name, as 046 does today.
4. **Given** the member themselves, **When** they look at their own profile, **Then** nothing changes for them; they can still see their own address in their settings.

---

### User Story 3 - The inviter keeps track of the invites they sent (Priority: P2)

An owner invites `noa@example.test` by typing the address. Until Noa accepts, the owner sees the pending invite with the address they typed, so they know who it is for and can resend or cancel it. A co-owner sees the same pending invite as "invited by" the first owner, with its role and date, without the address. Readers and others who cannot manage members see the pending row as today, without the address and without "invited by". Once Noa accepts, the row is an ordinary member row for everyone, the inviter included.

**Why this priority**: without it an owner cannot manage their own invites, but it is a narrow exception to the rule and comes after it.

**Independent Test**: owner A invites by typed address, owner B lists members. A sees the address on the pending row; B sees the row with "invited by A", role and date, and no address. After acceptance, neither sees the address.

**Acceptance Scenarios**:

1. **Given** an invite made by typing an address, **When** the inviter lists members while it is pending, **Then** the pending row shows the address they typed.
2. **Given** the same invite, **When** another owner lists members, **Then** the pending row shows who invited, the role and the date, and no address; any other member sees the row without the address and without who invited.
3. **Given** an invite made by username, **When** anyone lists members, the inviter included, **Then** the pending row shows the username and never the address.
4. **Given** a pending invite that is accepted, **When** anyone lists members, **Then** it is a member row without an address.
5. **Given** an inviter who invites by address, **When** the invite answer comes back, **Then** it may contain the address they typed and nothing else of the invitee's.

---

### Edge Cases

- **Two members with the same name** (or two members with no name at all): their rows differ by avatar colour (fixed per person, 046), username when set, role and joined or invited date. Pending invites also differ by who invited and, for the inviter, the address they typed. No address is shown to break the tie.
- **The inviter leaves the deck or is removed** while their invite is pending: no one sees the typed address any more; owners see "invited by" with the departed member's placeholder name (046).
- **Re-inviting a pending member** (which replaces the invite): the address shows only to whoever sent the current invite, and only if they typed the address for it. An earlier inviter stops seeing it. Re-inviting by username shows the address to no one.
- **An owner invites an address that belongs to an existing member of another deck**: the answer and the members list behave as for any typed address; the existing person's profile name or username shows once they accept.
- **Member data already stored on a device for offline reading** (persisted from before this feature): replaced by the next successful refresh; nothing on the device keeps an address after that. Signing out already clears it.
- **An account owner listed without a membership** (the implicit owner row): follows the same rules, no address.
- **A member without a username whose name the viewer already knew from before**: nothing is done to old screenshots or memory; only the app's answers change.
- **Invite and notice mails**: the recipient's own address is in the mail's "To" as always; any other member named in the mail (the inviter, a card's creator) is named by the same rules as in the app.

## Requirements *(mandatory)*

### Functional Requirements

**No addresses in member data**

- **FR-001**: No answer that describes a deck's members or invites MUST contain any member's email address, for any deck kind (personal, shared, communal) and any role, owners included. This covers at least the members list, the role-change answer, the invite answer and every member picker (reminder and event audiences).
- **FR-002**: The only exception MUST be an invite made by typing an address: while it is pending, the address MUST be shown to the member who typed it for the current invite, in the members list and in the invite answer, and to no one else.
- **FR-003**: An invite made by username MUST NOT expose the invitee's address to anyone on the deck, at the time or later.
- **FR-004**: A member's own row MUST follow the same rules as everyone else's; their own address remains available only in their own settings.
- **FR-005**: Pending invites MUST show who sent them to the deck's owners (the people who manage members). Other roles see the pending row as today, without the address.

**Names and avatars that do not come from the address**

- **FR-006**: Wherever a member is shown to someone else (members list, activity log, review queue, share rows, member pickers, the invite mail), their name MUST be their profile name, else their username, else "Member", and MUST NOT be built from their email address.
- **FR-007**: Avatar initials shown to others MUST come from the same name; with no usable letters, the neutral person glyph from 046 MUST show on the member's own colour.
- **FR-008**: A member's own view of themselves (their profile and settings) MUST be unchanged.

**Unchanged**

- **FR-009**: Inviting by email address or by username, exact lookup, its rate limit, its decision events and its enumeration alert MUST stay as 046 defines them (D424, D425).
- **FR-010**: Who may list members, change roles and invite MUST stay as today; this feature changes what the answers contain, not who gets them.
- **FR-011**: Member data stored on devices for offline use MUST hold no address once it has been refreshed after this feature ships.

### Accountability

This feature makes no new decision about a person, their content or their experience: hiding addresses and the name rule apply to everyone alike, and who may see a typed address follows from who sent the invite. No new decision events. Lookups keep 046's events. Invites themselves still record no decision event; that gap predates this feature (046 implementation notes) and belongs to H7.

### Key Entities

- **Member row**: a person on a deck as other members see them: name, avatar (initials or photo, colour), username when set, role, joined or invited date, and who invited them while pending. No address.
- **Pending invite**: a member row not yet accepted; carries the inviter and, for the inviter only, the address they typed.
- **Shown name**: the one name others see for a member: profile name, else username, else "Member".

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A scan of every member-facing answer, made as each of the five roles on each deck kind, finds zero email addresses apart from the inviter's own pending typed-address invites.
- **SC-002**: For a member with no profile name and no username, no name or avatar initials shown to another member contain any part of their address.
- **SC-003**: An owner can tell every pending invite they sent apart from the others in the members list, without asking anyone.
- **SC-004**: Inviting by address, inviting by username, changing a role, removing a member and choosing an event or reminder audience all still complete, with the same number of steps as today.

## Assumptions

- **The typed address shows to the inviter only**, not to every owner, as the go-list assumed. A co-owner sees who sent the invite and can ask them.
- **After acceptance the address is gone for everyone**, the inviter included: the go-list's exception is about the invites list, and an accepted invite is a member.
- **Username joins the name chain.** In 046 the shown name is the profile name, else the email-derived name; the username only appears beside it. With the email-derived name gone, a username is a better name than "Member", so it comes second.
- **Nothing nudges people to set a name here.** Getting people to set a name and username is the profile-completion call to action stubbed in `PLAN.md` Phase 16, item 6.
- **"Invited by" shows to owners only.** H6 does not ask for it; it is the smallest way for a co-owner to tell pending invites apart without the address, and owners are the ones who manage invites.
- **Own row shows no address.** The rule is simpler with no exception for oneself, and a member's own address is already in their settings.
- **Lookup limits and events are 046's** (D424): exact match, uniform miss, an email lookup answered only between deck mates, a per-member hourly limit and an enumeration alert. Nothing new is needed for H6.
- **Initials follow the shown name.** 046 made initials from the address when no name was set (D420); this feature changes that, since two letters of the address are part of it.
- **The platform admin's waitlist screen is out of scope.** Addresses are what that screen works with, and it describes waitlist entries, not deck members.
- **Mails are in scope only for how other members are named.** Who receives which mail does not change.
- **Public pages and anonymous answers already carry no member data** (046, D427); nothing changes there.
