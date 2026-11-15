# Feature Specification: Member profile and card creator avatar

**Feature Branch**: `feat/046-user-profile` | **Created**: 2026-11-16 | **Status**: Draft

**Input**: A profile page where a member sets their first name, last name, profile photo and location (free text), all optional. Every card in a shared or communal deck (not personal decks, which have a single owner) shows a small round avatar of the card's creator at the bottom of the card. Without a photo the avatar shows the member's initials on an attractive coloured background; with no name, initials come from the email address, split on the period.

## User Scenarios & Testing

In a family or community deck, a card is just text on a page: nobody can tell at a glance whether the school pickup note came from Dad or from the neighbour, or who added the boiler instructions. Members are known today only by a name Gobbit makes up from their email address, and there is nowhere to say who you are. A profile gives each member a face and a name; a small avatar on each card says who added it.

### User Story 1 — Set up my profile (P1)

A signed-in member opens their profile page from Settings (or from their own avatar) and fills in any of: first name, last name, a profile photo and a location written as free text ("Haifa", "Grandma's street"). Every field is optional and can be left empty or cleared later. They save and see the result straight away.

**Why this priority**: without a profile there is nothing to show on cards; it's also useful by itself, because members' names in the members list and elsewhere become real names.

**Independent test**: sign in, open the profile, enter a first name, a last name and a location, save, reload; the values are still there. Clear one field, save; it is gone and the others remain.

**Acceptance**:
1. The profile page is reachable from the signed-in app's settings area and shows the member's current values, with a preview of their avatar as others will see it.
2. First name, last name and location can each be empty. Each has a generous length limit with a clear message when exceeded; leading and trailing blanks are trimmed; a field containing only blanks is stored as empty.
3. Saving shows a confirmation and the change is visible everywhere the member's name or avatar appears without signing out.
4. A failed save keeps what the member typed and says what went wrong.
5. Unsaved edits are not lost by an accidental tab switch, and leaving the page with unsaved edits asks first.
6. The page works for a member who has never filled anything in: they see their email-derived avatar and name, and every field empty.

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

The location text is shown with the member's name on a small profile card that opens when a member taps another member's avatar on a card or in the members list ("Dana Levi · Haifa"). It is free text and optional; nothing is geocoded or validated.

**Why this priority**: it's the lightest part of the request and has no downstream dependency.

**Independent test**: set a location; another member in a shared deck taps the avatar on one of your cards and sees the name, location and larger avatar.

**Acceptance**:
1. Tapping an avatar opens a small card with the larger avatar, the display name and the location if set. It closes with a tap outside, the close action, or Escape, and returns focus to where it was.
2. The card is shown only to signed-in members who share a deck with that person; nobody else can read the profile.
3. An empty location shows nothing, not a blank line or a placeholder.

### Edge cases

- A member's name is changed: initials update on every card, colour stays.
- First and last name both cleared: the avatar and name fall back to the email-derived values on the next view.
- The photo file is deleted from the media store, or fails to load: initials are shown instead, never a broken image.
- Very long names, names with emoji, right-to-left names, names with a leading honorific or lower-case letters: the initials are one or two real letters, never a broken character, and the circle never overflows.
- Two members with the same initials and colour in one deck: both are still distinguishable by the name on tap or hover; colour alone is never the only identifier.
- A member is removed from a deck but their cards stay: the cards keep showing them (it's authorship, not membership), but their profile card is no longer reachable by deck members who no longer share a deck with them.
- A member in a communal deck they've only joined as a reader sees creators' avatars like anyone else; avatars follow the same visibility as the card itself (a card hidden by category visibility is hidden along with its avatar).
- Offline: avatars already seen render from the offline cache; those not yet loaded show initials without error.
- A deck changes kind (a shared deck becomes personal, if allowed): avatars follow the deck's current kind.
- Browse swiping, the card's action bar and its source line are unchanged by the avatar's presence; on narrow screens it never wraps onto the action bar.
- A member deleting their account: the photo is removed with the account's data and cards fall back to the placeholder avatar.

## Requirements

### Functional Requirements

- **FR-001**: A signed-in member MUST be able to view and edit their own profile: first name, last name, profile photo and location. All four are optional and clearable.
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
- **FR-012**: A member's profile (name, photo, location) MUST be readable only by signed-in members who share at least one deck with them, and by themselves; it MUST NOT appear on public pages, in public search, in share previews or in any anonymous response (see Assumptions).
- **FR-013**: Wherever the app shows a member's display name today, it MUST show the profile-derived name when set (Story 5) and the current email-derived name otherwise.
- **FR-014**: The avatar MUST follow the card's own visibility: any view that doesn't show the card doesn't show its creator's avatar, and a hidden card never discloses its creator.
- **FR-015**: The avatar MUST NOT cause layout shift, MUST be keyboard-reachable only when it opens the profile card, and MUST have an accessible name of the creator's display name.
- **FR-016**: Existing members MUST need no action: before they edit anything, every member has an avatar (initials from their email) and the same display name they have today.
- **FR-017**: Profile and photo changes MUST be recorded as audit events (who, when, which fields changed — field names only, never values, as for card events), in the same transaction as the change.
- **FR-018**: Avatars and profile data MUST work offline through the app's existing offline reading cache, and MUST NOT add to the web app's initial load beyond the agreed bundle budget.
- **FR-019**: The profile page and avatars MUST meet the app's accessibility conventions (labels, focus management, touch target size, reduced motion) and use the app's own button and icon components.

### Key Entities

- **Member profile**: optional first name, optional last name, optional photo (an image the member owns), optional location text. Belongs to exactly one member; created implicitly empty for every member.
- **Avatar**: the display form of a member: photo, or initials plus a stable colour, or a neutral glyph. Derived, not stored (apart from the photo).
- **Card creator**: the existing record of which member created a card; unchanged, now surfaced to readers.
- **Profile card**: the small read-only view of a member's avatar, name and location shown to members who share a deck with them.

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
- **SC-009**: Existing members and cards need no data entry or migration step by a person: after release every card in a shared deck shows an avatar.

## Assumptions

- **Public pages stay anonymous.** Anonymous readers of public decks and public pages do not see creator avatars, names or photos (constitution IV: private by default; the anonymous DTO stays an allow-list). "Public" in the request is read as decks marked public that members also read in the app; members see avatars there like in any non-personal deck. Showing creators on public pages would be a separate, opt-in decision per member and is out of scope.
- **"Personal" means the deck kind.** Avatars are hidden by the deck's kind (personal), not by member count: a shared deck that currently has one member still shows avatars.
- **Initials source.** When both names are empty, initials come from the email local part; when only one name is set, that one letter is used and the email is not mixed in.
- **Name length limits** (60/60/100) are defaults, adjustable in the plan.
- **Display name today** is derived from the email at sign-up; this feature keeps that as the fallback and doesn't rewrite stored values for existing members. Whether the stored name is retained or computed is a plan decision.
- **Location is plain text** shown only on the profile card: no map, no geocoding, no search, no filtering by location.
- **Creator = original creator.** For cards created by sharing, email-in, import or approval from the review queue, the creator is the member the card is attributed to today (the one who shared or imported it); the AI/agent is never shown as a creator.
- **Avatar library.** A well-maintained initials/generated-avatar library may be used for the coloured background if it fits the bundle budget, works without scripts on the server and in the reader, and gives stable results; otherwise a small in-house palette hashed from the member id is acceptable. The plan decides and records it.
- **Photo storage** reuses the existing media storage and asset lifecycle; the photo belongs to the member rather than a deck, and so isn't removed when a deck is deleted.
- **Out of scope**: cover/banner images, bios, birthdays, social links, pronouns, presence or "last seen", per-deck nicknames, showing last editor, profile pages visible to people outside shared decks, email or push notifications about profile changes, admin editing of members' profiles, and importing a photo from an external identity provider.
- **E2E tier** (for the plan to confirm): smoke for "set profile name and see it on a card in a shared deck"; photo upload and cross-surface consistency at the full tier, with Cloudinary faked as for other media tests.
