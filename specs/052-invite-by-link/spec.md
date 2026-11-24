# Feature Specification: Invite by link

**Feature Branch**: `052-invite-by-link`

**Created**: 2026-11-23

**Status**: Draft

**Input**: User description: "The next step in the community go-list plan after spec 051": H12, invite by link. An owner can send a deck invite through WhatsApp or any chat instead of by mail. The new link only invites and never signs in. The owner gives a name for their own reference and a role, with no address. The link is personal and single use (the first person to accept claims it); it expires and can be revoked. The invites list shows "link for <name>: waiting / accepted by <profile name>". It is shared through the phone's share sheet with a prefilled message the owner can edit. Pasted into a chat, the invite page shows the deck name and the inviter's name, and it never shows anything private. A link lets an unregistered person register while registration is waitlist-only. Decision events: created, shared, accepted, expired, revoked, refused. Owners can have only a limited number of open links per deck, and an operator can change that limit. Out of scope: a reusable group link, H7's single registration flow, and L4's sign-in without mail.

Roadmap: the first communal deck launch, stage 3 (alpha), "getting in": [`community-go-list.md`](../../community-go-list.md) H12. Builds on [`051-member-email-privacy`](../051-member-email-privacy/spec.md) (no addresses in member data, the shown name) and [`046-user-profile`](../046-user-profile/spec.md) (profile names, usernames, avatars). H7 (one registration flow) and L4 (sign-in without magic links) come later and are not part of this feature.

## Background

Today an owner invites someone by typing an email address or a username, and Gobbit mails that person an invite link. That has three problems for the alpha, where invites go out one person at a time and mostly by WhatsApp:

- **It costs a mail per person**, and mail sends are a limited resource (Track K, mail headroom).
- **It is impersonal.** People we know expect a message from us, not a mail from a service they have not heard of.
- **Today's invite link must never be copied into a chat.** The mailed link is a single-use sign-in link bound to the invitee's address: whoever opens it first is signed in *as that person*. Chats get forwarded and are read by groups, so a "copy invite" button on today's link would hand out someone's account.

What already exists and stays as is:

- Inviting by email address or username, the invite mail, re-invites replacing older ones, and `INVITE_TTL_DAYS` for how long an invite lasts.
- A deck invite registers an unregistered address even while registration is waitlist-only (`deck_invite`, D241).
- 051's rules: no answer about a deck's members carries an email address, and people appear by their shown name (profile name, else username, else "Member") and avatar.
- The personal deck is never shared.

## Clarifications

### Session 2026-11-24

- Q: May a link invite grant the owner role? → A: No. A link never makes someone an owner; owners are still invited by address or username (FR-002).
- Q: A brand-new person still gets one sign-in mail until L4. Is that enough? → A: Yes, accept it as is. The link saves the invite mail; the sign-in mail goes away with L4 (FR-012).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - An owner sends an invite through a chat (Priority: P1)

An owner of the communal deck wants Dana in the alpha. In the deck's members settings they choose to invite by link, type "Dana" as a name only they will see, pick the reader role and tap Share. The phone's share sheet opens with a short message ("Join <deck> on Gobbit" and the link). The owner picks WhatsApp, edits the message if they like and sends it to Dana. On a computer without a share sheet, the link and message are copied instead.

**Why this priority**: this is the feature. Without it the alpha invites go out by mail, one mail per person.

**Independent Test**: as an owner, create a link invite with a name and a role. The share action offers the link with a prefilled message, and the invites list shows "link for Dana: waiting" with its role and expiry date.

**Acceptance Scenarios**:

1. **Given** an owner on a shared or communal deck, **When** they create a link invite with a name and a role, **Then** they get a link they can share or copy, and the invite appears in the members settings as a link for that name, waiting, with its role and expiry date.
2. **Given** a phone with a share sheet, **When** the owner taps Share, **Then** the share sheet opens with a prefilled message containing the deck name and the link, which the owner can edit in the chat app before sending.
3. **Given** a device without a share sheet, **When** the owner taps Share, **Then** the message with the link is copied and the owner is told so.
4. **Given** a waiting link invite, **When** the owner comes back to the members settings later, **Then** they can share the same link again without creating a new invite.
5. **Given** a member who is not an owner, **When** they open the deck's members, **Then** they cannot create link invites and do not see waiting link invites.
6. **Given** the personal deck, **When** its owner looks for invites, **Then** there is no link invite, as there is no invite of any kind today.

---

### User Story 2 - The invited person opens the link and joins (Priority: P1)

Dana taps the link in WhatsApp. The chat shows a preview first: the deck's name and that the owner invited her, with nothing from inside the deck. The link opens an invite page saying who invited her, to which deck and as what. If Dana is already signed in to Gobbit, she taps Join and lands on the deck. If she is not, she signs in or registers there, through the usual sign-in, and comes back to the same invite page to tap Join. From then on she is a member with the link's role, and the owner's invites list shows "accepted by <Dana's shown name>".

**Why this priority**: the other half of the feature. A link that cannot be accepted is useless.

**Independent Test**: a second user, signed out, opens the link, signs in, accepts and lands on the deck as a member with the link's role. The owner's list shows the invite as accepted by that user's shown name.

**Acceptance Scenarios**:

1. **Given** a waiting link invite, **When** anyone opens the link, signed in or not, **Then** they see an invite page naming the deck, the inviter (by shown name) and the role, and nothing else from the deck: no cards, categories, members or counts.
2. **Given** the link pasted into a chat, **When** the chat shows a preview, **Then** the preview names the deck and the inviter and shows nothing private.
3. **Given** a signed-in person who is not a member, **When** they tap Join on the invite page, **Then** they become a member with the link's role and land on the deck.
4. **Given** a signed-out person, **When** they choose to join, **Then** they sign in or register through the usual sign-in and come back to the same invite page, where Join completes as above.
5. **Given** a person with no Gobbit account while registration is waitlist-only, **When** they come through a waiting link invite, **Then** they can register and join instead of being put on the waitlist, and their registration records that a deck invite brought them in and who sent it.
6. **Given** a person who joined through a link, **When** the owner opens the members settings, **Then** the invite shows as accepted by that person's shown name, and the person is listed as a member like any other.
7. **Given** opening the link, at any point, **When** nobody has tapped Join, **Then** no one has been signed in and no membership exists; opening the link never signs anyone in.

---

### User Story 3 - A link works once and the owner stays in control (Priority: P2)

Dana forwards the message to her partner, who taps the link after Dana has joined. The partner sees that the invite has already been used and is told to ask the deck's owner. The owner meanwhile sees who actually came in through each link. If the wrong person joined, the owner removes them as they would any member and sends a new link. A link nobody used expires after the usual invite period, and the owner can revoke a waiting one at any time.

**Why this priority**: it is what keeps a personal link personal once it leaves the owner's hands. It comes after the two halves that make the feature work.

**Independent Test**: after one person accepts, a second person opening the same link is refused, and no membership is created for them. A revoked link and an expired link are refused the same way.

**Acceptance Scenarios**:

1. **Given** a link invite already accepted, **When** anyone else opens it, **Then** they see that it was already used and cannot join with it.
2. **Given** a waiting link invite, **When** an owner revokes it, **Then** opening the link shows that it is no longer valid, and it disappears from the waiting invites.
3. **Given** a link invite older than the invite period, **When** anyone opens it, **Then** it shows as expired and cannot be accepted.
4. **Given** a person who is already a member of the deck, or who belongs to the account that owns it, **When** they open a waiting link and tap Join, **Then** they are told they are already in, and the link stays waiting for the person it was meant for.
5. **Given** a deck at its limit of waiting link invites, **When** an owner tries to create another, **Then** they are told the limit is reached and to revoke or wait for an existing one, and no link is created.
6. **Given** an owner who sees the wrong person accepted a link, **When** they remove that member, **Then** the member is removed as today, and the used link stays used.

---

### Edge Cases

- **Two people open a waiting link at the same moment**: exactly one becomes a member; the other is told the link was already used.
- **The person signs in through the invite page, but the link is used, revoked or expires before they come back**: they are told on return, and no membership is created. If they were new, they are not registered through the link either (FR-011): with registration waitlist-only, they reach the waitlist as any unknown address would.
- **Someone signed in on a shared phone as another person opens the link**: the invite page says who they are signed in as, so they can sign out first and join as themselves.
- **An inviter who leaves the deck or is removed**: their waiting link invites stop working; anyone opening them is told the link is no longer valid. Accepted ones are untouched.
- **A deck that is deleted or archived while a link waits**: the link stops working the same way.
- **The deck name changes after the link was sent**: the invite page and new previews show the current name; a preview a chat app already stored is out of Gobbit's hands.
- **The owner types a name that is a full name or a nickname**: it is shown to the deck's owners only and never on the invite page or in the preview, so the invitee does not see what they were filed as.
- **Mixing ways of inviting**: someone already invited by address or username who opens a link and joins becomes a member through the link, and the earlier pending invite is closed with it; there is never more than one membership per person per deck.
- **Guessing links**: a link cannot be found by trying values; opening invite pages anonymously is limited per visitor like other anonymous pages.

## Requirements *(mandatory)*

### Functional Requirements

**Creating and sharing**

- **FR-001**: An owner of a shared or communal deck MUST be able to create a link invite by giving a name for their own reference and a role. No email address or username is asked for.
- **FR-002**: A link invite MUST NOT grant the owner role. It may grant any other role an owner can invite with today; owners are still invited by address or username.
- **FR-003**: The owner MUST be able to share a waiting link through the device's share sheet, with a prefilled message naming the deck that they can edit in the chat app, or copy it where there is no share sheet. They MUST be able to share the same waiting link again later.
- **FR-004**: The number of waiting link invites per deck MUST be limited. The limit MUST be changeable by an operator without a code change. Creating a link beyond it MUST be refused with a message saying what to do.

**Opening and accepting**

- **FR-005**: Opening a link MUST NOT sign anyone in, create an account or create a membership. Only an explicit Join by a signed-in person does.
- **FR-006**: The invite page and the preview a chat shows for the link MUST show only the deck's name, the inviter's shown name (051) and the role. They MUST NOT show cards, categories, members, counts, the reference name or any address.
- **FR-007**: A signed-out person MUST be able to sign in or register from the invite page and come back to it to join.
- **FR-008**: A link invite MUST be single use. The first person to join claims it; every later attempt is refused.
- **FR-009**: A link invite MUST stop working when it is accepted, revoked, expired (after the same invite period as mailed invites) or when its inviter is no longer an owner of the deck or the deck is gone.
- **FR-010**: A person who is already a member, or who belongs to the owning account, MUST be told so on Join. The link MUST stay waiting.
- **FR-011**: While registration is waitlist-only, a waiting link invite MUST let one unregistered person register and join, recorded as brought in by a deck invite and by the inviter. A link MUST never register more than one person, and it MUST register no one once it has stopped working.
- **FR-012**: A person who signs in or registers from the invite page MUST do so through the usual sign-in, including its mail, until L4 brings sign-in without mail. A link saves the invite mail; a brand-new person still gets one sign-in mail, and someone already signed in gets none.

**Owner view**

- **FR-013**: The deck's owners MUST see each link invite with its reference name, role, who created it, its state (waiting, accepted, revoked, expired) and, once accepted, the shown name of the person who joined. Other members MUST NOT see link invites.
- **FR-014**: Any owner of the deck MUST be able to revoke a waiting link invite.
- **FR-015**: No answer about link invites MUST carry an email address. The person who joined is shown by their shown name and avatar (051).

**Unchanged**

- **FR-016**: Inviting by email address or username, the invite mail, re-invites and who may invite MUST stay as today.
- **FR-017**: Roles, removing members and changing roles MUST work for members who joined by link exactly as for any other member.

### Accountability

Each of these is a decision about a person's access and leaves a record (constitution VIII), identifying people and invites by id only:

- **Link created** (owner, deck, role) and **refused at creation** (limit reached).
- **Link shared**: the owner used Share or Copy (sent by the app, as other in-app actions are).
- **Link accepted** (who joined, which invite) and **registration through a link** (alongside the existing registration record).
- **Link refused on Join**, with the reason: already used, revoked, expired, no longer valid, already a member.
- **Link revoked** (by which owner) and **link expired**.

The plan names which of these warrant an alert, for example a burst of refusals on one link (a forwarded link) or one deck creating links at its limit.

### Key Entities

- **Link invite**: a personal, single-use invitation to one deck. It carries the reference name (owners only), the role, who created it, when it was created, when it expires and its state. Once accepted it also names the member who joined.
- **Invite page**: the page a link opens. It is public in the sense that anyone with the link can read it, and it holds only the deck name, the inviter's shown name and the role.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An owner can create a link invite and have it open in a chat app in under 30 seconds and at most four taps from the members settings.
- **SC-002**: Someone already signed in joins a deck from a link with one tap after opening it; someone signed out joins after a single sign-in.
- **SC-003**: Of any number of people who try the same link, exactly one becomes a member.
- **SC-004**: Opening a link, before Join, leaves zero new sessions, accounts and memberships.
- **SC-005**: The invite page and its chat preview show nothing beyond the deck name, the inviter's shown name and the role, checked on a deck with private categories and cards.
- **SC-006**: Every created, shared, accepted, refused, revoked and expired link leaves a record an operator can count.
- **SC-007**: A deck's alpha readers can all be invited without sending a single invite mail; only people new to Gobbit get one sign-in mail each.

## Assumptions

- **Owners create links**: the same people who may invite today. Maintainers, editors and readers cannot.
- **Link invites are visible to owners only.** A waiting link has no person behind it yet, and the reference name is the owner's own note; other members see the person once they join.
- **The invite period is the existing one** (`INVITE_TTL_DAYS`); links do not get their own.
- **The reference name is required**, short, and never leaves the owners' view. It is not checked against anything.
- **Join is an explicit tap** even for a signed-in person, so opening a link by mistake never adds someone to a deck.
- **The inviter must still be an owner** for a waiting link to work. That is the simplest rule that stops a removed owner's links from letting people in.
- **Removing the wrong person is the existing remove.** No new "undo a link" action.
- **Registration rule as today's deck invite**: a link lets a person register past the waitlist, as a mailed deck invite does (D241). Whether deck invites should skip waitlist approval at all is H7's open question, and this feature follows today's answer.
- **No group link.** A reusable "anyone with this link can join" deck link is out of scope: on a communal deck it would be forwarded beyond the community at once, and public reading (stage 5) serves that audience. Revisit with suggesting (H5).
- **Out of scope**: one registration flow with invites riding along (H7), the first-run welcome for invited people (H8a), sign-in without mail (L4), inviting by link on a custom host (H10, Track J).
- **E2E tier**: smoke, per the go-list. An owner creates a link, a second user opens it, joins and lands on the deck; a second use of the same link is refused.
