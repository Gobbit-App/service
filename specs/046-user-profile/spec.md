# Feature Specification: Member profile and card creator avatar

**Feature Branch**: `feat/046-user-profile` | **Created**: 2026-11-16 | **Status**: Draft

**Input**: A profile page where a member sets their first name, last name, profile photo, location (free text) and a username that is unique across the whole of Gobbit, all optional. Members can be found by username or by email (for example to invite them to a deck). Until a member chooses a username, their username is their email address, implicitly: it is never shown or stored as a username, it only means they can still be found by email. Every card in a shared or communal deck (not personal decks, which have a single owner) shows a small round avatar of the card's creator at the bottom of the card. Without a photo the avatar shows the member's initials on an attractive coloured background; with no name, initials come from the email address, split on the period. Hovering (or tapping, on touch) the avatar shows the member's username when set, never the email. The avatar is not a link and navigates nowhere.

## User Scenarios & Testing

In a family or community deck, a card is just text on a page: nobody can tell at a glance whether the school pickup note came from Dad or from the neighbour, or who added the boiler instructions. Members are known today only by a name Gobbit makes up from their email address, and there is nowhere to say who you are. A profile gives each member a face and a name; a small avatar on each card says who added it.

### User Story 1 — Set up my profile (P1)

A signed-in member opens their profile page from Settings and fills in any of: a username, first name, last name, a profile photo and a location written as free text ("Haifa", "Grandma's street"). Every field is optional and can be left empty or cleared later. They save and see the result straight away.

**Why this priority**: without a profile there is nothing to show on cards; it's also useful by itself, because members' names in the members list and elsewhere become real names.

**Independent test**: sign in, open the profile, enter a first name, a last name and a location, save, reload; the values are still there. Clear one field, save; it is gone and the others remain.

**Acceptance**:
1. The profile page is reachable from the signed-in app's settings area and shows the member's current values, with a preview of their avatar as others will see it.
2. First name, last name and location can each be empty. Each has a generous length limit with a clear message when exceeded; leading and trailing blanks are trimmed; a field containing only blanks is stored as empty.
3. Saving shows a confirmation and the change is visible everywhere the member's name or avatar appears without signing out.
4. A failed save keeps what the member typed and says what went wrong.
5. Unsaved edits are not lost by an accidental tab switch, and leaving the page with unsaved edits asks first.
6. The page works for a member who has never filled anything in: they see their email-derived avatar and name, and every field empty (the username field shows a hint that others can currently find them only by email).
7. The username is set and checked as described in Story 7.

---

### User Story 2 — See who added each card (P1)

A member reading a card in a shared or communal deck sees a small round avatar at the bottom of the card, showing who created it. It appears in every place the card is shown in the app: deck lists, favorites, category and search results, Browse and its full view, the card page, and the review queue. Cards in a personal deck never show it.

**Why this priority**: it is the reason for the feature; the profile fields exist to feed it.

**Independent test**: in a shared deck with two members, each creates a card; both cards show the right member's avatar in the list, in Browse and on the card page. A card in the same member's personal deck shows no avatar.

**Acceptance**:
1. A card in a shared or communal deck shows a circular avatar at the bottom of the card, small enough not to compete with the content, aligned the same on every card type.
2. The avatar is the card's creator, not the last editor. Editing a card does not change it.
3. Cards in a personal deck show no avatar, and take no space for one.
4. A card whose creator is unknown or has left (account removed, or no creator recorded) shows a neutral placeholder avatar, never an empty gap or an error.
5. The avatar is decorative for people using a screen reader unless it carries information: its accessible name is the creator's name ("Added by Dana Levi"), read once, not repeated as an image description.
6. A card shared into the deck from outside (a share, an email-in, a pasted link) and approved from the review queue shows the member who shared it.
7. The avatar never moves or resizes a card as it loads (no layout shift).
8. Hovering the avatar (pointer devices) or tapping it (touch) shows a small label with the creator's username when they have one. Without a username it shows their display name (profile name, else the email-derived name used today). It never shows an email address. The label closes on pointer leave, a second tap, a tap elsewhere, or Escape, and is also reachable by keyboard focus.
9. The avatar is not clickable: it is not a link or a button, opens nothing and navigates nowhere. The label in 8 is the only interaction.

---

### User Story 3 — Profile photo (P2)

A member adds a photo to their profile by picking a file, taking one with the camera, or dragging one onto the page, crops it to a circle on the page, and saves. They can replace or remove it. Their photo then appears as their avatar on their cards.

**Why this priority**: initials already work as an avatar (Story 4), so the photo is a refinement, but it is the most personal and most requested part of a profile.

**Independent test**: add a photo to the profile, save; open a shared deck with a card created by this member; the card shows the photo. Remove the photo; the card shows initials again.

**Acceptance**:
1. A photo can be chosen from the device, captured with the camera where the device offers it, or dropped onto the page. Large photos are accepted and reduced for display; the size and file-type limits are the same as for card photos, with a clear message when refused.
2. The member sees the circular crop before saving and can move or zoom it within the circle.
3. "Replace" and "Remove" are offered once a photo is set. Remove returns the avatar to initials.
4. A failed upload keeps the previous photo (or none) and doesn't lose the other edits.
5. A removed or replaced photo no longer appears anywhere in the app, and its stored file is cleaned up like other unused images.
6. Only the member can set or change their own photo; deck owners can't change another member's.
7. Photos render crisp at the avatar size on high-density screens and load without blocking the card text.

---

### User Story 4 — A good-looking avatar without a photo (P1)

A member with no photo still gets a nice avatar: their initials on a coloured circle. The colour (or small graphic pattern) is stable for that member, so the same person always looks the same to everyone, on every device and every visit, and different members usually look different from each other.

**Why this priority**: most members will never upload a photo; for them this is the avatar.

**Independent test**: three members with different names/emails; each card shows two-letter initials on a colour that is the same across reloads and across other members' devices.

**Acceptance**:
1. Initials come from the first and last name when present: first letter of first name plus first letter of last name ("Dana Levi" → "DL"). With only a first name or only a last name, one letter ("D"). Names in any script work, using the first letter of each name (a letter, not a half of a character); initials are shown in upper case where the script has case.
2. With no name, initials come from the email address's part before the "@", split on periods, hyphens and underscores: "dana.levi@example.test" → "DL"; "dana@example.test" → "D"; "dana.m.levi@example.test" → "DL" (first and last part). Digits-only or symbol-only parts are skipped; if nothing usable remains, a neutral person glyph is shown instead of letters.
3. The background is derived from a stable value of the member (not the display name, so renaming doesn't flip the colour) and drawn from a curated palette whose every colour keeps the initials readable (text and background contrast meets the app's accessibility bar in light and dark themes).
4. Others never see a member's email address because of their avatar: the initials are computed for them without exposing the address.
5. The same member shows identical colour and initials in the list, Browse, the card page, the profile preview and the members list.

---

### User Story 5 — Real names across the app (P2)

Where Gobbit already shows a member's name (the members list in deck settings, the activity log, reminder and event notices, share rows, the review queue), it shows the profile name when there is one, and the email-derived name as today when there is not. Member rows also show the avatar.

**Why this priority**: the profile is only coherent if a name set in one place is not contradicted elsewhere; it can follow the first slice.

**Independent test**: set a first and last name; the members list, activity log and a reminder notice each show the new name; clear the names; each reverts to the previous email-derived name.

**Acceptance**:
1. "First name Last name" is the display name when either is set; with one only, that one alone; otherwise the current email-derived name.
2. A name change applies to past activity entries and notices too (they reference the member, not a copy of the old text).
3. Emails are still shown only where they're shown today (e.g. to deck owners for invites).

---

### User Story 6 — Location on the profile (P3)

A member can save a location as free text on their profile. For now it is stored and editable only; nothing in the app shows it to other members, because avatars do not open anything (Story 2). It is kept so a later feature can display it without asking everyone to re-enter it.

**Why this priority**: lightest part of the request and has no downstream dependency; showing it is deferred.

**Independent test**: set a location, save, reload; it is still there. Clear it; it is gone.

**Acceptance**:
1. The location can be set, changed and cleared on the profile page.
2. No response available to other members contains it (it is readable only by the member themselves until a display surface is specified).

---

### User Story 7 — Choose a username and find people by it (P1)

A member picks a username that is unique in the entire Gobbit system. Anyone signed in can find a member by typing that username or their email, for instance when inviting them to a deck. A member who never picks one is still found by their email, as today.

**Why this priority**: the username is what avatars show on hover/tap, and finding people is the way a shared deck grows.

**Independent test**: member A sets username `dana`; member B opens invite in a deck and types `dana`; A is offered and invited. B types A's email; the same member is offered. Member C tries to take `dana`; refused.

**Acceptance**:
1. A username is optional, unique across all members regardless of case (`Dana` and `dana` conflict), 3–30 characters from letters, digits, period, underscore and hyphen, starting with a letter or digit. It cannot contain "@", so it can never be mistaken for an email, and a short list of reserved words (such as `admin`, `gobbit`, `support`) is refused. It is stored and shown as typed, compared case-insensitively.
2. A taken or invalid username is refused with a clear message at save; the page also checks availability as the member types without revealing who holds it.
3. A member can change or clear their username. A released username can be taken by someone else only after a short hold period, so it cannot be sniped to impersonate; the plan sets the period.
4. Until a username is set, the member's username is their email, implicitly: it is not displayed as a username anywhere, and no one can claim an email-shaped value.
5. Inviting to a deck (and any other place that picks a member) accepts either an email or a username. Input with "@" is treated as an email, anything else as a username. A username match is exact, not partial or fuzzy: there is no browsing or autocomplete listing of members.
6. A lookup result shows the member's avatar and display name, and never an email address, except to a deck owner for the invite they are sending, as today. An email lookup for someone not yet registered behaves as the invite flow does today.
7. Lookups are for signed-in members only, rate limited per member, and answer the same way for "no such username" whether or not it ever existed. They are not available anonymously.
8. Existing members need no action; they stay findable by email exactly as today.

### Edge cases

- A member changes or clears their username: avatars and labels update everywhere, invites already sent are unaffected (they point at the member, not the text), and their old username is held before reuse.
- Two members try to claim the same username at once: exactly one succeeds, the other gets the "taken" message.
- A member types an email-shaped or reserved value as a username: refused with a clear message.
- A member's name is changed: initials update on every card, colour stays.
- First and last name both cleared: the avatar and name fall back to the email-derived values on the next view.
- The photo file is deleted from the media store, or fails to load: initials are shown instead, never a broken image.
- Very long names, names with emoji, right-to-left names, names with a leading honorific or lower-case letters: the initials are one or two real letters, never a broken character, and the circle never overflows.
- Two members with the same initials and colour in one deck: both are still distinguishable by the username or name on hover or tap; colour alone is never the only identifier.
- A member is removed from a deck but their cards stay: the cards keep showing them (it's authorship, not membership).
- A member in a communal deck they've only joined as a reader sees creators' avatars like anyone else; avatars follow the same visibility as the card itself (a card hidden by category visibility is hidden along with its avatar).
- Offline: avatars already seen render from the offline cache; those not yet loaded show initials without error.
- A deck changes kind (a shared deck becomes personal, if allowed): avatars follow the deck's current kind.
- Browse swiping, the card's action bar and its source line are unchanged by the avatar's presence; on narrow screens it never wraps onto the action bar.
- A member deleting their account: the photo is removed with the account's data and cards fall back to the placeholder avatar.

## Requirements

### Functional Requirements

- **FR-001**: A signed-in member MUST be able to view and edit their own profile: username, first name, last name, profile photo and location. All five are optional and clearable.
- **FR-002**: The system MUST trim each text field, treat blank as empty, and refuse values over a stated length (first and last name 60 characters each, location 100), with a clear message.
- **FR-003**: Only the member themselves MUST be able to change their profile; no deck role, including owner and co-owner, grants editing someone else's profile or photo.
- **FR-004**: Every card in a shared or communal deck MUST show the creator's avatar at the bottom of the card in every list, Browse, card page and review view in the app; cards in personal decks MUST NOT.
- **FR-005**: The avatar MUST identify the card's creator and MUST NOT change when the card is edited, archived or restored by someone else.
- **FR-006**: A card with no known creator, or whose creator no longer exists, MUST show a neutral placeholder avatar.
- **FR-007**: The avatar MUST show the profile photo when one is set, otherwise initials on a coloured circle, otherwise (nothing usable) a neutral person glyph.
- **FR-008**: Initials MUST come from first and last name when set, otherwise from the email's local part split on periods, hyphens and underscores, using the rules in Story 4; the algorithm MUST be one shared definition used by every surface, and MUST be covered by tests with a table of names, scripts and emails.
- **FR-009**: The avatar background colour MUST be stable per member, independent of their name, chosen from a palette that keeps text readable in light and dark themes, and MUST NOT depend on the viewer.
- **FR-010**: The system MUST NOT expose any member's email address to other members as a result of this feature; initials for other members MUST be supplied without the address.
- **FR-011**: A profile photo MUST go through the app's existing image pipeline: same file-type and size limits, upload only through the app's own signed flow, stored with an asset record, delivered resized for the avatar sizes, and cleaned up when replaced, removed or the account is deleted.
- **FR-012**: A member's name, username and photo MUST be readable only by signed-in members who share at least one deck with them, or who find them through an exact username or email lookup (FR-021), and by themselves; location MUST be readable only by the member themselves; it MUST NOT appear on public pages, in public search, in share previews or in any anonymous response (see Assumptions).
- **FR-013**: Wherever the app shows a member's display name today, it MUST show the profile-derived name when set (Story 5) and the current email-derived name otherwise.
- **FR-014**: The avatar MUST follow the card's own visibility: any view that doesn't show the card doesn't show its creator's avatar, and a hidden card never discloses its creator.
- **FR-015**: The avatar MUST NOT cause layout shift, MUST NOT be a link or button (no navigation, no click action), MUST show the label of Story 2.8 on hover, tap and keyboard focus, and MUST have an accessible name of the creator's display name.
- **FR-016**: Existing members MUST need no action: before they edit anything, every member has an avatar (initials from their email) and the same display name they have today.
- **FR-017**: Profile and photo changes MUST be recorded as audit events (who, when, which fields changed — field names only, never values, as for card events), in the same transaction as the change.
- **FR-018**: Avatars and profile data MUST work offline through the app's existing offline reading cache, and MUST NOT add to the web app's initial load beyond the agreed bundle budget.
- **FR-020**: A username MUST be unique across the whole system, case-insensitively, enforced by the database so concurrent claims cannot both succeed; format and reserved words per Story 7.
- **FR-021**: A signed-in member MUST be able to find another member by exact username or by email (input with "@" is an email). Members without a username MUST remain findable by email only. Lookups MUST NOT return anyone's email to a non-owner, MUST NOT reveal whether a given value ever existed, and MUST be rate limited per member.
- **FR-022**: The avatar label MUST show the username when set, otherwise the display name, and MUST NEVER show or leak an email address, including in the accessible name, tooltips, the DOM, the offline cache and API payloads for other members.
- **FR-023**: Username changes, releases and rate-limited lookups MUST be recorded as decision events or audit rows (ids or keyed hashes only, never the typed text), per constitution VIII.
- **FR-019**: The profile page and avatars MUST meet the app's accessibility conventions (labels, focus management, touch target size, reduced motion) and use the app's own button and icon components.

### Key Entities

- **Member profile**: optional username (unique system-wide), optional first name, optional last name, optional photo (an image the member owns), optional location text. Belongs to exactly one member; created implicitly empty for every member.
- **Avatar**: the display form of a member: photo, or initials plus a stable colour, or a neutral glyph. Derived, not stored (apart from the photo).
- **Card creator**: the existing record of which member created a card; unchanged, now surfaced to readers.

## Success Criteria

### Measurable Outcomes

- **SC-001**: A member can set their name and location and see the result in under one minute from opening the app, without help.
- **SC-002**: A member can add a profile photo in under 90 seconds on a phone, including picking and cropping.
- **SC-003**: In a shared deck with three members, a reader correctly says who created a card from its avatar alone in at least 9 of 10 cases once they've seen each member's avatar once (the same person always looks the same).
- **SC-004**: 100% of cards in shared and communal decks show an avatar in every in-app view, and 0% of cards in personal decks do.
- **SC-005**: Avatar initials and colours are identical for the same member across every surface and device in 100% of a test matrix covering lists, Browse, card page, members list and profile.
- **SC-006**: No response available to other members, to anonymous visitors or in any share preview contains another member's email address because of this feature.
- **SC-007**: All avatar colour/initial combinations meet the app's text-contrast requirement in both light and dark themes.
- **SC-008**: Adding avatars adds no visible layout shift to card lists and Browse, and doesn't cause the existing web bundle budget to be exceeded.
- **SC-010**: A member can pick a username and be found by it from another account in under one minute; looking up a taken, free or never-used username gives a non-member no information about who holds it.
- **SC-009**: Existing members and cards need no data entry or migration step by a person: after release every card in a shared deck shows an avatar.

## Assumptions

- **Public pages stay anonymous.** Anonymous readers of public decks and public pages do not see creator avatars, names or photos (constitution IV: private by default; the anonymous DTO stays an allow-list). "Public" in the request is read as decks marked public that members also read in the app; members see avatars there like in any non-personal deck. Showing creators on public pages would be a separate, opt-in decision per member and is out of scope.
- **"Personal" means the deck kind.** Avatars are hidden by the deck's kind (personal), not by member count: a shared deck that currently has one member still shows avatars.
- **Initials source.** When both names are empty, initials come from the email local part; when only one name is set, that one letter is used and the email is not mixed in.
- **Name length limits** (60/60/100) are defaults, adjustable in the plan.
- **Display name today** is derived from the email at sign-up; this feature keeps that as the fallback and doesn't rewrite stored values for existing members. Whether the stored name is retained or computed is a plan decision.
- **Location is plain text**, stored and visible only to its owner for now: no map, no geocoding, no search, no filtering, and no display to others until a later feature gives it a surface (avatars open nothing).
- **Username is an addition, not a replacement for email sign-in.** Sign-in stays by magic link to the email; the username is never a credential. The "implicit email username" means lookup by email keeps working; no username value is created for it.
- **Hover label without a username** falls back to the display name already shown today (derived from the email local part, as in the members list). If the plan judges that too revealing for avatars of other members, it shows a neutral "Member" label instead. Plan to decide.
- **Username hold period** (Story 7.3) and lookup rate limits are defaults for the plan to set and make env-tunable.
- **Creator = original creator.** For cards created by sharing, email-in, import or approval from the review queue, the creator is the member the card is attributed to today (the one who shared or imported it); the AI/agent is never shown as a creator.
- **Avatar library.** A well-maintained initials/generated-avatar library may be used for the coloured background if it fits the bundle budget, works without scripts on the server and in the reader, and gives stable results; otherwise a small in-house palette hashed from the member id is acceptable. The plan decides and records it.
- **Photo storage** reuses the existing media storage and asset lifecycle; the photo belongs to the member rather than a deck, and so isn't removed when a deck is deleted.
- **Out of scope**: cover/banner images, bios, birthdays, social links, pronouns, presence or "last seen", per-deck nicknames, browsing or autocompleting a member directory, partial or fuzzy username search, a profile card or page opened from avatars, showing location to others, showing last editor, profile pages visible to people outside shared decks, email or push notifications about profile changes, admin editing of members' profiles, and importing a photo from an external identity provider.
- **E2E tier** (for the plan to confirm): smoke for "set profile name and see it on a card in a shared deck"; photo upload and cross-surface consistency at the full tier, with Cloudinary faked as for other media tests.
