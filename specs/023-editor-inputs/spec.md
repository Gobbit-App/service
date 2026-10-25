# Feature Specification: Friendlier editor inputs

**Feature Branch**: `023-editor-inputs`

**Created**: 2026-10-25

**Status**: Draft

**Input**: User description: "Fill in https:// automatically in URL fields; image alt text is not mandatory; save automatically when a card's categories change, with undo. Source: docs/usability-backlog.md items 1, 2, 6."

Roadmap: `PLAN.md` § Usability pass. Changes rules set in [`007-card-editor`](../007-card-editor/spec.md) (URL validation, categories saved with the form) and [`008-card-media`](../008-card-media/spec.md) FR-006 (alt text required). Full auto-save of every field with undo/redo is a later feature.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Type an address without the "https://" (Priority: P1)

A member adds a link card on the phone and types `example.org/recipes`. The field already shows `https://` when they tap into it, and if they paste or type an address without a scheme it becomes `https://example.org/recipes` when they leave the field. They never see "Enter a full http:// or https:// address" for an ordinary address.

**Why this priority**: typing a scheme on a phone keyboard is slow, and the current error blocks the most common way people write addresses.

**Independent Test**: in each URL field (link URL, source URL, share form URL), type `example.org` and save: the stored address is `https://example.org`. Leave the optional source URL untouched: nothing is stored.

**Acceptance Scenarios**:

1. **Given** an empty URL field, **When** the member focuses it, **Then** it contains `https://` with the cursor at the end.
2. **Given** a field that still holds only `https://`, **When** the member leaves it, **Then** it is empty again (an optional field stays unset; a required one shows "required", not "invalid").
3. **Given** the member typed or pasted an address with no scheme (e.g. `www.example.org/a?b=1`), **When** they leave the field or save, **Then** it becomes `https://www.example.org/a?b=1`.
4. **Given** the member pasted `https://example.org` into a field that already showed `https://`, **When** the paste lands, **Then** the field holds a single `https://example.org` (no doubled scheme).
5. **Given** an address that starts with `http://`, **When** the member leaves the field, **Then** it is kept as `http://` (not upgraded).
6. **Given** something that is not an address after adding the scheme (e.g. `hello world`, `mailto:a@b`), **When** the member saves, **Then** the existing "not a valid address" error shows.

---

### User Story 2 - Image cards without alt text (Priority: P1)

A member snaps a photo of a school notice and saves it with a title. They are not forced to write a description. If they do write one, it is used as the image's text alternative.

**Why this priority**: required alt text blocks the quickest capture flow (photo + title). The card title already names the image in nearly every case.

**Independent Test**: create an image card with a photo and a title but no alt text; it saves and renders. A screen reader announces the card title for the image.

**Acceptance Scenarios**:

1. **Given** an image draft with a finished upload and no alt text, **When** the member saves, **Then** the card is created.
2. **Given** an image card with no alt text, **When** it renders in a list, on its card page, in browse mode or on a public page, **Then** the image's text alternative is the card title, or empty (decorative) when the title is shown right next to it.
3. **Given** an image card with alt text, **When** it renders, **Then** the alt text is used as today.
4. **Given** the alt field, **When** the editor shows it, **Then** it is labelled "Description (optional)" with a short hint about who it helps.
5. **Given** an API or import client, **When** it creates or updates an image card with no alt or an empty alt, **Then** the request is accepted.

---

### User Story 3 - Category changes save themselves, with undo (Priority: P2)

A member opens an existing card's editor only to move it from "General" to "School". They tap the chips; each tap is saved at once and a small "Categories saved · Undo" notice appears. They leave without pressing Save and nothing is lost. If the tap was a mistake, Undo puts the previous categories back.

**Why this priority**: re-filing a card is the most common edit, and today it needs a full Save. Full auto-save of every field comes later; categories are the safe first step because each change is small and reversible.

**Independent Test**: edit an existing card, toggle a category, leave via the header back control without saving: the card shows the new category and no unsaved-changes prompt appears. Toggle again and tap Undo: the card is back as before.

**Acceptance Scenarios**:

1. **Given** the editor for an existing card, **When** the member toggles a category chip, **Then** the change is saved right away and a notice "Categories saved" with an Undo action appears for about 6 seconds.
2. **Given** that notice, **When** the member taps Undo, **Then** the previous categories are restored and saved, and the chips show them.
3. **Given** several quick taps, **When** they settle, **Then** the result is the last chosen set and Undo returns to the set from before the first tap of the burst.
4. **Given** a published card with one category, **When** the member removes it, **Then** the chip doesn't toggle off and a message says a published card needs at least one category.
5. **Given** a category save fails (offline, conflict, lost access), **When** the error returns, **Then** the chips revert to the saved state and an error notice explains it; nothing else in the form is lost.
6. **Given** a new card (not yet saved), **When** the member toggles chips, **Then** nothing is saved until they save the card (today's behaviour).
7. **Given** a category change was saved instantly, **When** the member leaves the editor, **Then** it does not count as an unsaved change ([`022-editor-navigation`](../022-editor-navigation/spec.md)).
8. **Given** other fields have unsaved edits, **When** the member toggles a category, **Then** only the categories are saved; the other edits stay unsaved until Save.

### Edge Cases

- A category is created inline from the editor (007): for an existing card, it is created and then applied with the same instant save and undo.
- Undo after the card was changed elsewhere in the meantime: the undo applies only to categories, last write wins (same as any edit today).
- A proposed card in the review queue: instant save applies; the at-least-one rule doesn't (it applies only to published cards).
- The member cannot see some of the card's categories (category visibility): the save keeps those hidden categories as they are.
- Each instant save is one entry in the deck's activity log (020), as a normal edit would be; Undo is another entry.
- An address with leading/trailing spaces is trimmed before the scheme is added.
- Pasting a full address with uppercase scheme (`HTTPS://…`) is accepted as is.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Every URL input in the app (link URL, source URL, share form URL) MUST show `https://` when focused while empty, and MUST clear itself on blur if it still holds only the scheme.
- **FR-002**: On blur and on save, an address without a scheme MUST be prefixed with `https://` after trimming; addresses with `http://` or `https://` (any case) MUST be kept.
- **FR-003**: The scheme rule MUST be one shared function used by all URL inputs and covered by unit tests; the server's URL validation is unchanged (it still requires a scheme).
- **FR-004**: An image card MUST be saveable without alt text, in the editor and through the API.
- **FR-005**: An image with no alt text MUST render with the card title as its text alternative, or as decorative when the title is visibly adjacent; no image is rendered without either.
- **FR-006**: In the editor for an existing card, each category change MUST be saved immediately, independently of the form's Save.
- **FR-007**: After an instant category save, the app MUST offer Undo for about 6 seconds; Undo restores and saves the previous set.
- **FR-008**: Removing the last category of a published card MUST be refused before saving, with an explanation.
- **FR-009**: A failed instant save MUST revert the chips to the stored state and explain the failure, without touching other unsaved edits.
- **FR-010**: Instant category saves MUST NOT mark the editor as having unsaved changes.
- **FR-011**: For a new card, categories MUST stay part of the create request.

### Key Entities

- **Image card payload**: photo reference plus an optional description (alt text).
- **Category assignment**: the set of categories on a card; changed and undone as a whole.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A member can enter a link card's address without typing a scheme in 100 % of URL fields.
- **SC-002**: An image card can be saved with a photo and title only, in under 15 seconds from opening the editor on a phone.
- **SC-003**: Re-filing an existing card into another category takes one tap and no Save, and can be undone with one more tap.
- **SC-004**: No category change made in the editor is lost when leaving it.

## Assumptions

- The API contract change is limited to the image payload's alt becoming optional; existing cards keep their alt.
- Instant category saves use the existing card update; no new endpoint is needed.
- Full auto-save of every field with undo/redo is a separate, later feature; this one only covers categories.
- Icons for the chips and the notice come from [`024-card-actions`](../024-card-actions/spec.md).
