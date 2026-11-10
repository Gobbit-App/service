# Feature Specification: Card avatar

**Feature Branch**: `feat/044-card-avatar` | **Created**: 2026-11-10 | **Status**: Draft

**Input**: Add an optional image to text, reminder, event, table and calc cards, shown as a round "profile" image (avatar) for that card in list and browse modes.

## User Scenarios & Testing

Cards without a picture all look alike in a list: a recipe, a babysitter's number and a gym timetable are the same block of text. A small round image beside the title lets a member recognise a card at a glance (the babysitter's face, the dish, the gym's logo) without turning it into a photo card.

### User Story 1 — Add, replace or remove a card's avatar (P1)

A member who can edit a card opens it in the editor and, for a text, reminder, event, table or calc card, picks a photo from their device as the card's avatar. They see it as a circle in the editor preview, can replace it with another photo or remove it, and save.

**Why this priority**: without a way to set it there is nothing to show.

**Independent test**: create a text card, add an avatar, save; reopen, replace it, save; reopen, remove it, save. Each save shows the expected state on the card page.

**Acceptance**:
1. The editor of a text, reminder, event, table or calc card offers "Add image"; link and photo cards don't (they already carry an image).
2. Picking a photo uploads it with the same limits and progress as a photo card's upload; the preview shows it cropped to a circle.
3. "Replace" and "Remove" are offered once an avatar is set; Remove clears it on save.
4. Saving a card without an avatar behaves exactly as today (the field is optional).
5. A failed upload shows an error, keeps the previous avatar (or none) and doesn't block saving the rest of the card.
6. A draft restored from the device keeps its avatar choice.

---

### User Story 2 — See avatars in card lists (P1)

A member reading a deck's card list (All, Favorites, a category, search results, Archived, Review) sees each card's avatar as a small circle at the start of its title row. Cards without one look as they do today.

**Why this priority**: recognising cards in a list is the point of the feature.

**Independent test**: a deck with one card with an avatar and one without; the list shows a circle only on the first, and both titles line up.

**Acceptance**:
1. The avatar is a fixed-size circle before the title, cropped to its subject (faces first) rather than squashed or letterboxed.
2. Long titles still truncate or wrap as today; the avatar never pushes the card wider than the list.
3. The avatar is decorative: screen readers read the title, not an image description.
4. Until the image loads the circle holds its space (no layout shift); if it fails to load, a neutral empty circle stays.

---

### User Story 3 — See avatars in Browse (P1)

A member swiping through cards in Browse (and its full view) sees the current card's avatar beside its title, at a size suited to the larger card.

**Independent test**: open Browse on the deck above and swipe between the two cards.

**Acceptance**:
1. The avatar appears beside the title on the browse card and in the full view.
2. Swiping between cards loads the next card's avatar without a visible jump in the title row.

### Edge cases

- A card's type changes to link or photo in the editor (where allowed): the avatar is dropped on save, and the editor says so before saving.
- The avatar image is deleted from the media store or fails to load: the card still renders, with an empty circle.
- A member offline sees avatars they have already loaded; others show the empty circle.
- An avatar must belong to the card's deck: an image recorded for another deck is refused.
- A card whose only image is its avatar keeps that image from being cleaned up as unused; removing the avatar makes the image eligible for clean-up after the usual grace period.
- An event with a link preview image keeps both: the preview in the card body, the avatar in the title row.
- Proposals (ingested cards awaiting review) can be given an avatar by a publisher while reviewing, like any other edit.
- Bulk import and existing cards are unaffected: no card gains an avatar unless someone sets one.

## Requirements

- **FR-001** Text, reminder, event, table and calc cards have an optional avatar image; link and photo cards don't. Any later card type opts in explicitly (checklists, `042-checklists`, are expected to).
- **FR-002** Members who can edit a card can add, replace and remove its avatar from the card editor; nobody else can.
- **FR-003** Avatar uploads use the existing photo upload path, limits and per-deck rules: the image is recorded for the card's deck, and a card may only reference an avatar image recorded for its own deck.
- **FR-004** An avatar counts as a use of its image, so unused-image clean-up never removes an image that a live, archived or recently deleted card still shows as its avatar.
- **FR-005** Wherever a card renders in a list (deck lists, search results, review queue) or in Browse (cards and full view), its avatar shows as a circle at the start of the title row; without an avatar the row renders as today.
- **FR-006** Avatars are cropped to a circle around the image's subject, load at the size they're shown, reserve their space before loading and degrade to an empty circle on failure.
- **FR-007** The avatar is decorative (no alt text to write); the card title remains the accessible name.
- **FR-008** Adding, replacing or removing an avatar is a card edit: it appears in the deck's activity log like other field changes and follows the same permission and validation errors.
- **FR-009** The avatar stays within the existing card size limits; an avatar on a type that doesn't support it is refused with a field error, never silently dropped by the server.
- **FR-010** [NEEDS CLARIFICATION: Besides lists and Browse, where else does the avatar show? Card page (`/i/:id`) and editor preview only, or also public deck pages, public search and share previews?]
- **FR-011** [NEEDS CLARIFICATION: Should ingestion ever set an avatar on a proposed card (e.g. a shared page's image or a contact photo for a text card), or is it set by people only in this feature?]

### Key Entities

- **Card avatar**: an optional reference from a text, reminder, event, table or calc card to one image stored for the card's deck, with the image's dimensions. At most one per card. Not a separate card or a gallery.

## Success Criteria

- **SC-001** A member can add an avatar to an existing card in under 30 seconds on a phone (open editor, pick photo, save).
- **SC-002** In a list of 20 cards at 360 px wide, cards with and without avatars keep their titles aligned and the page shows no layout shift as avatars load.
- **SC-003** No image used only as an avatar is removed by clean-up while its card exists (live, archived or within the 30-day undelete window).
- **SC-004** Cards without an avatar render identically to before the feature (no visual regression in lists or Browse).

## Assumptions

- The avatar source is a photo from the member's device, using the existing upload; picking an existing deck image or pasting an image URL is out of scope.
- Cropping is automatic (subject/face-aware); there is no manual crop or zoom control in this feature.
- The avatar doesn't change search, ranking, embeddings or Ask: it carries no text.
- Bulk import and the notes import CLI don't gain an avatar column in this feature.
- Avatars follow the same visibility as the card itself; nothing about the image is visible to anyone who can't see the card.
