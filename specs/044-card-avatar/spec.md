# Feature Specification: Card cover image

**Feature Branch**: `feat/044-card-avatar` | **Created**: 2026-11-10 | **Status**: Draft

**Input**: Add an optional image to text, reminder, event, table and calc cards, shown as a round "profile" image (avatar) for that card in list and browse modes. *(Clarified 2026-11-12: the image represents the card's content, not a person, and shows as a bar below the title like a link's preview; the feature folder keeps its original "avatar" name.)*

## User Scenarios & Testing

Cards without a picture all look alike in a list: a recipe, a babysitter's number and a gym timetable are the same block of text. Link and photo cards already carry a visual; text-based cards don't. A cover image (the dish, the gym's logo, the school's building, a screenshot of the timetable) gives a text-based card a visual of its own, so a list or Browse reads less like a wall of text and a member spots the card they want at a glance, without turning it into a photo card.

### User Story 1 — Add, replace or remove a card's cover image (P1)

A member who can edit a card opens it in the editor and, for a text, reminder, event, table or calc card, adds a cover image by picking a file, dragging an image onto the field or pasting one. They see it in the editor preview as it will show on the card, can replace it or remove it, and save.

**Why this priority**: without a way to set it there is nothing to show.

**Independent test**: create a text card, add a cover image, save; reopen, replace it, save; reopen, remove it, save. Each save shows the expected state on the card page.

**Acceptance**:
1. The editor of a text, reminder, event, table or calc card offers "Add image"; link and photo cards don't (they already carry a visual).
2. An image can be added by picking a file, by dragging and dropping an image file onto the field, or by pasting an image from the clipboard.
3. Adding an image uploads it with the same limits and progress as a photo card's upload; the preview shows the bar as it will look on the card.
4. "Replace" and "Remove" are offered once a cover image is set; Remove clears it on save.
5. Saving a card without a cover image behaves exactly as today (the field is optional).
6. A failed upload shows an error, keeps the previous image (or none) and doesn't block saving the rest of the card.
7. A draft restored from the device keeps its cover image choice.

---

### User Story 2 — See cover images in card lists (P1)

A member reading a deck's card list (All, Favorites, a category, search results, Archived, Review) sees each card's cover image as a bar below its title and above its body, the way a link card shows its preview. Cards without one look as they do today.

**Why this priority**: spotting cards in a list is the point of the feature.

**Independent test**: a deck with one card with a cover image and one without; the list shows the bar only on the first.

**Acceptance**:
1. The cover image is a full-width bar below the title and above the body, in the same shape as a link card's preview image, filled without squashing or letterboxing.
2. The bar never pushes the card wider than the list.
3. The image is decorative: screen readers read the title, not an image description.
4. Until the image loads the bar holds its space (no layout shift).

---

### User Story 3 — See cover images in Browse (P1)

A member swiping through cards in Browse (and its full view) sees the current card's cover image below its title.

**Independent test**: open Browse on the deck above and swipe between the two cards.

**Acceptance**:
1. The cover image appears below the title on the browse card and in the full view.
2. Swiping to a card loads its cover image without a visible jump.

### Edge cases

- A card's type changes to link or photo in the editor (where allowed): the cover image is dropped on save, and the editor says so before saving.
- The cover image is deleted from the media store or fails to load: the card still renders, without the bar, as a link card does when its preview image fails.
- A member offline sees cover images they have already loaded; others render without the bar.
- A cover image must belong to the card's deck: an image recorded for another deck is refused.
- A card whose only image is its cover image keeps that image from being cleaned up as unused; removing it makes the image eligible for clean-up after the usual grace period.
- An event with a link: a cover image supersedes the link's preview image, so the card shows the cover bar below the title and the link box without its image. Without a cover image the event looks as today.
- On an event card, which already has a photo field for its link, a paste goes to the cover image when that field has focus; otherwise it goes where it goes today. Drag and drop always goes to the field it's dropped on.
- Proposals (ingested cards awaiting review) can be given a cover image by a publisher while reviewing, like any other edit.
- Sharing a card that isn't public: the share preview stays generic, with no image, title or other content, as today. Sharing a public card with a cover image: the preview shows the card's content together with the image. A member-set cover image wins over any image Gobbit picked up automatically, such as an event's link preview image. Removing it changes later previews only; already-unfurled messages keep what chat apps cached.
- Bulk import and existing cards are unaffected: no card gains a cover image unless someone sets one.

## Clarifications

### Session 2026-11-10

- Q: Besides lists and Browse, where else does the image show? → A: In the app (card page, editor preview) and as the share preview image; not on public deck pages or public search.
- Q: Should ingestion ever set one? → A: No, people only; a publisher can add one while reviewing.

### Session 2026-11-11

- Q: Does a share preview of a non-public card show the image? → A: No. Nothing about a non-public card leaks through a share preview; it stays generic. For public cards, a richer preview (more content and visuals) is better.
- Q: When a card has both a member-set image and an automatically gathered image (an event's or link's preview image), which one represents the card? → A: The member-set image always supersedes automatically gathered images.

### Session 2026-11-12

- Q: What is the image for? → A: A visual representation of the card's content, so text-based cards are easier to spot and lists less textual. It is not a person's picture; the "avatar" name is historical.
- Q: Should link and photo cards get one too? → A: No. The feature gives a visual to text-based cards that don't have one natively; link and photo cards already do.
- Q: Where and in what shape does it show? → A: As a bar below the title and above the body, like a link card's preview image, not a circle beside the title.
- Q: How can it be added? → A: Any image input the editor supports: pick a file, drag and drop, paste.

## Requirements

- **FR-001** Text, reminder, event, table and calc cards have an optional cover image; link and photo cards don't. Any later card type opts in explicitly (checklists, `042-checklists`, are expected to).
- **FR-002** Members who can edit a card can add, replace and remove its cover image from the card editor, by picking a file, dragging and dropping an image or pasting one; nobody else can.
- **FR-003** Cover image uploads use the existing photo upload path, limits and per-deck rules: the image is recorded for the card's deck, and a card may only reference an image recorded for its own deck.
- **FR-004** A cover image counts as a use of its image, so unused-image clean-up never removes an image that a live, archived or recently deleted card still shows.
- **FR-005** Wherever a card renders in a list (deck lists, search results, review queue) or in Browse (cards and full view), its cover image shows as a bar below the title and above the body, in the shape of a link card's preview image; without one the card renders as today.
- **FR-006** Cover images fill the bar without distortion, load at the size they're shown, reserve their space before loading and are left out when they fail to load.
- **FR-007** The cover image is decorative (no alt text to write); the card title remains the accessible name.
- **FR-008** Adding, replacing or removing a cover image is a card edit: it appears in the deck's activity log like other field changes and follows the same permission and validation errors.
- **FR-009** The cover image stays within the existing card size limits; one on a type that doesn't support it is refused with a field error, never silently dropped by the server.
- **FR-010** The cover image also shows on the card page and in the editor preview. A member-set cover image supersedes any automatically gathered image (an event's link preview image), in the app and in share previews. A public card's share preview (the link a member sends to someone) shows the card's content with its cover image. A non-public card's share preview stays generic and reveals nothing about the card, image included. Public deck pages and public search don't show cover images in this feature.
- **FR-011** Only people set cover images. Ingestion never sets one on a proposed card; a publisher may add one while reviewing (FR-002).

### Key Entities

- **Card cover image**: an optional reference from a text, reminder, event, table or calc card to one image stored for the card's deck, with the image's dimensions. At most one per card. It represents the card's content. Not a separate card or a gallery.

## Success Criteria

- **SC-001** A member can add a cover image to an existing card in under 30 seconds on a phone (open editor, pick or paste an image, save).
- **SC-002** In a list of 20 cards at 360 px wide, mixing cards with and without cover images, the page shows no layout shift as images load.
- **SC-003** No image used only as a cover image is removed by clean-up while its card exists (live, archived or within the 30-day undelete window).
- **SC-004** Cards without a cover image render identically to before the feature (no visual regression in lists or Browse).
- **SC-005** Sharing a public card with a cover image produces a preview showing that image with the card's content in chat apps that unfurl links; sharing a non-public card produces the same generic preview as before the feature.

## Assumptions

- The image comes from the member's device (file picker, drag and drop or clipboard), using the existing upload; picking an existing deck image or pasting an image URL is out of scope.
- Cropping is automatic, the same as link previews; there is no manual crop or zoom control in this feature.
- The cover image doesn't change search, ranking, embeddings or Ask: it carries no text.
- Bulk import and the notes import CLI don't gain a cover image column in this feature.
- Public deck pages (`/p/…`) and public search are unchanged; showing cover images there is a later feature.
- Cover images follow the same visibility as the card itself; nothing about the image is visible to anyone who can't see the card.
