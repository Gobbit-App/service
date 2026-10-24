# Feature Specification: Deck admin screens

**Feature Branch**: `019-deck-admin`

**Created**: 2026-10-23

**Status**: Draft

**Input**: User description: "Phase 8, part 4: deck admins manage a deck from the app instead of the API: rename it, make it public, set each category's visibility, and invite, re-role and remove members, including inviting a second admin as a co-owner. Part of PLAN.md Phase 8 demo 5 (admin surface)."

Roadmap: `PLAN.md` § Phase 8 (demo 5, with [`020-item-events`](../020-item-events/spec.md) for the log). Builds on Phase 2 (memberships, roles, invites, D33 implicit owners) and [`016-public-read-api`](../016-public-read-api/spec.md) (category PATCH, owner-only public switch).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Owners and maintainers manage the deck and its categories (Priority: P1)

The owner of a communal deck opens its settings on the phone. They rename the deck, turn on "public" after a confirmation that lists what strangers will see, and set three categories to public. A maintainer sees the same screen but the public switch is read-only.

**Why this priority**: making a deck public and choosing categories is the setup step of the whole phase. Today it needs API calls.

**Independent Test**: as owner, make a deck public and a category public from the screen; the category's cards appear at the deck's public address. As maintainer, the switch is shown but disabled.

**Acceptance Scenarios**:

1. **Given** an owner, **When** they turn the public switch on, **Then** a confirmation names the public categories (or warns there are none) and the public address, and only after confirming is the deck public.
2. **Given** a public deck, **When** the owner turns the switch off, **Then** the deck is private again after a confirmation, and the public address stops working.
3. **Given** an owner or maintainer, **When** they rename the deck or a category, or change a category's visibility, **Then** the change is saved and every list in the app reflects it.
4. **Given** a maintainer, **When** they open settings, **Then** the public switch shows its state but can't be changed.
5. **Given** an editor or reader, **When** they open the deck, **Then** there is no settings entry. Opening the address directly shows "only admins can change this deck".
6. **Given** the personal deck, **When** its owner opens settings, **Then** they can rename it; there is no public switch and no members section.
7. **Given** a public deck, **When** an admin opens settings, **Then** the public address is shown with a copy button.

---

### User Story 2 - Owners manage members, including co-owners (Priority: P1)

The owner invites a neighbour as a second admin by choosing "Co-owner" in the invite form. The list shows the invite as pending until it's accepted. Later the owner changes an editor to maintainer, and removes someone who moved away.

**Why this priority**: PLAN.md demo 5 needs a second admin invited as owner. The invite API exists; the screen and role changes don't.

**Independent Test**: invite an email as co-owner from the screen; accept the link in another browser; the new co-owner can change category visibility and the public switch, but not delete the deck.

**Acceptance Scenarios**:

1. **Given** an owner, **When** they invite an email with a role (reader, editor, maintainer, co-owner), **Then** the invite is sent and listed as pending with its role.
2. **Given** a pending invite, **When** the owner invites the same email again with another role, **Then** the role is replaced and older links stop working (today's rule), and the list shows one entry.
3. **Given** an accepted member, **When** the owner changes their role, **Then** the new role applies on the member's next request.
4. **Given** an owner, **When** they try to change their own role or the role of an account owner (implicit owner), **Then** it's refused with a clear message.
5. **Given** an owner, **When** they remove a member or cancel a pending invite, **Then** the person loses access at once (their next request gets "not found" for the deck).
6. **Given** a maintainer, editor or reader, **When** they open the members section, **Then** they see the list but no invite, role or remove controls.

### Edge Cases

- Inviting yourself or an account owner: refused as today, message shown under the field.
- The last remaining owner can't be demoted or removed (implicit account owners always remain, so this can't happen for them).
- Two admins edit the same category at once: last write wins; the screen refetches after each save.
- Offline: the screen shows the cached settings read-only with "you're offline"; saving is disabled.
- A category made private while a reader has its cards cached: they disappear on the next sync (existing behaviour).
- Deck deletion stays out of the screen (API only), so a mis-tap can't delete a community deck.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Owners and maintainers MUST be able to rename a deck and its categories and change category visibility from the app.
- **FR-002**: Only owners MUST be able to change the public switch from the app, and only after a confirmation that names what becomes public.
- **FR-003**: Owners MUST be able to invite by email with any role, including co-owner.
- **FR-004**: Owners MUST be able to change an accepted member's role, except their own and implicit account owners'.
- **FR-005**: Owners MUST be able to remove members and cancel pending invites.
- **FR-006**: Members without the right role MUST NOT see controls they can't use; the server MUST refuse the action anyway.
- **FR-007**: The settings screen MUST NOT add to the app's start-up bundle.

### Key Entities

- **Deck settings**: name, public switch, public address (when public).
- **Category settings**: name and visibility (private, shared, public).
- **Member**: person, role, pending or accepted, implicit (account owner) or invited.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An owner can take a new communal deck from private to "public with three public categories" from the phone in under two minutes without the API.
- **SC-002**: A co-owner invited from the screen can publish a card and change the public switch, and can't delete the deck (with 020: the log shows both admins' actions, PLAN.md demo 5).
- **SC-003**: The app's start-up bundle stays within the 150 KB gzip budget.
- **SC-004**: Every role rule on the screen is backed by a server test.

## Assumptions

- Deck creation (including choosing `communal`) stays API-only for now; the first community deck is created once.
- "Co-owner" is the existing `owner` membership role (D33): everything except deleting the deck.
- Ownership transfer between accounts is out of scope.
