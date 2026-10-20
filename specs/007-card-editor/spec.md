# Feature Specification: Card editor (create and edit)

**Feature Branch**: `007-card-editor`

**Created**: 2026-10-20

**Status**: Draft

**Input**: User description: "Phase 6, step 1: a full card editor on the phone. Create and edit text, link, table and calc cards with a live preview that matches the list, live limits, several categories with inline creation, and drafts that survive closing the app. Proposals stay proposals. Image upload and fetched link previews come in 008-card-media."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Create a text or link card with a preview (Priority: P1)

A member who may add cards opens "Add card", picks a type, fills in the title and the type's fields, picks one or more categories and sees the card as it will look in the list before saving.

**Why this priority**: This replaces the minimal Phase 3B form. It is the base every other story builds on, and it delivers value by itself.

**Independent Test**: Create a text card and a link card in a test deck. Check that the preview and the saved card in the list show the same title, body/URL and category chips.

**Acceptance Scenarios**:

1. **Given** an editor on a deck, **When** they open "Add card", pick Text, enter a title and body, keep the preselected default category and save, **Then** the card appears in the deck list exactly as the preview showed it.
2. **Given** the editor is open, **When** the body passes 600 characters, **Then** the counter shows the overflow and Save is disabled until it is back within the limit.
3. **Given** a link card with a URL, title and an optional description, **When** it is saved, **Then** the list shows the link with that title and description.
4. **Given** the editor is open, **When** the member removes every category, **Then** Save is disabled and the category field says that at least one is needed.
5. **Given** a reader (no create permission), **When** they open the add-card address directly, **Then** they see a "you can't add cards here" message, not the form.

---

### User Story 2 - Edit an existing card (Priority: P1)

A member with edit rights opens a card, taps "Edit", changes any field except the type, and saves. Only what they changed is sent. A proposal can be edited by its creator or by a publisher, and saving keeps it a proposal.

**Why this priority**: Today no card can be edited after it is created, except a proposal in the review queue. Fixing mistakes is a core need of the family test.

**Independent Test**: Edit the title of a published card and then the categories of a proposal. Check that the card shows the changes and that the proposal is still in the review queue.

**Acceptance Scenarios**:

1. **Given** a published card and an editor, **When** they open it, tap Edit, change the title and save, **Then** the card shows the new title everywhere and its "Added" date is unchanged.
2. **Given** the editor is open on an existing card, **When** the member looks for a type choice, **Then** there is none: the type is fixed.
3. **Given** a proposal created by the member, **When** they edit and save it, **Then** it stays in the review queue as a proposal.
4. **Given** a proposal created by someone else and a member who isn't a publisher, **When** they open its edit address, **Then** they see "card unavailable".
5. **Given** a card in a private category the editor can't see, **When** the editor changes its categories, **Then** the private category stays on the card.
6. **Given** a reviewer in the review queue, **When** they use the inline edit, **Then** it saves only the changed fields (same rules as the full editor), and "Edit fully" opens the full editor on the proposal.

---

### User Story 3 - Author a table card (Priority: P2)

A member builds a small table (e.g. a weekly schedule) in a grid: column headings, cells, adding and removing rows and columns, and moving rows up and down.

**Why this priority**: Tables are one of the five card types, and today only the API can create them.

**Independent Test**: Create a 3-column, 4-row table, reorder two rows, save it and compare the list rendering with the preview.

**Acceptance Scenarios**:

1. **Given** a new table card, **When** the member adds rows, **Then** "Add row" is disabled at 12 rows; "Add column" is disabled at 6 columns.
2. **Given** a table near the size budget, **When** the content passes the payload limit, **Then** a meter shows it and Save is disabled.
3. **Given** a column heading left empty, **When** the member tries to save, **Then** that heading is marked as required.

---

### User Story 4 - Author a calc card (Priority: P2)

A member defines up to six input fields (label, optional unit and default), an expression and a result label, and sees the result change live in the preview.

**Why this priority**: Calc cards (e.g. a dosage or a recipe scaler) are the last type with no authoring UI apart from images.

**Independent Test**: Create a calc card with two fields and the expression `a * b`. Change the defaults in the preview and check the result; then enter an invalid expression and check the error.

**Acceptance Scenarios**:

1. **Given** fields `a` and `b`, **When** the expression is `a * b`, **Then** the preview computes the result from the field values.
2. **Given** an expression that names an unknown field or a disallowed function, **When** it is typed, **Then** the error is shown under the expression and Save is disabled.
3. **Given** six fields, **When** the member looks for "Add field", **Then** it is disabled.

---

### User Story 5 - Unsaved work survives (Priority: P2)

If the app is closed, the phone locks or the network drops mid-edit, the member's work is still there when they come back.

**Why this priority**: Members write cards on phones, in short bursts. Losing a half-written table loses trust in the app.

**Independent Test**: Type into a new card, reload the page, accept "Restore unsaved draft" and see the content.

**Acceptance Scenarios**:

1. **Given** an unsaved new card, **When** the member reopens the editor for that deck and type, **Then** they are offered to restore it or start fresh.
2. **Given** an unsaved edit, **When** someone else changed the card since, **Then** the restore offer warns that the card has changed.
3. **Given** a saved card, **When** the member reopens the editor, **Then** no draft is offered.
4. **Given** drafts on the phone, **When** the member signs out, **Then** all drafts are gone.

---

### User Story 6 - Add a category without leaving the editor (Priority: P3)

A member who may create categories types a new category name in the category picker and it is created and selected on the spot.

**Why this priority**: It is convenient, but a member can work around it from the deck.

**Independent Test**: Type a new name, confirm, and see the chip selected; save the card and see the category in the deck's chips.

**Acceptance Scenarios**:

1. **Given** an editor, **When** they add a category "School", **Then** it is created as a shared category and selected on the card.
2. **Given** a name that already exists, **When** they add it, **Then** the existing category is selected instead of creating a duplicate (or a clear message is shown if it can't be).
3. **Given** a role without category-create permission, **When** they open the picker, **Then** there is no "New category" option.

### Edge Cases

- Body, title, entity text with Hebrew, emoji and combining marks: counters count Unicode code points, like the database.
- A link URL without a scheme is refused with a clear message (http/https only).
- Editing an ingested card that carries extracted details: the details show as chips; each can be removed, none can be added.
- Editing an image card before 008-card-media ships: title, body, categories, source and details are editable; the image itself is shown read-only.
- Offline: the editor opens from cached data, autosaves drafts, and Save shows "you're offline" without losing the draft.
- The API rejects a save (limit, missing category, unknown category, permission): the message appears next to the relevant field, and the draft is kept.
- Two tabs edit the same card: the last save wins; the other tab's draft gets the "card changed since" warning the next time it is restored.
- A calc field key collides with a function name or another key: refused in the field.
- An existing table row with fewer cells than columns (malformed): the editor pads it on load and the save sends a valid shape.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The editor MUST let members with create permission create text, link, table and calc cards. Image creation is added by 008-card-media through the same editor.
- **FR-002**: The editor MUST let members with edit permission edit any card they can see, except the type, which is fixed at creation.
- **FR-003**: A proposal MUST be editable only by its creator or by a member who can publish, and saving it MUST leave it a proposal. Publishing stays in the review queue.
- **FR-004**: The editor MUST show a preview drawn by the same component that draws the card in lists. On narrow screens Edit and Preview are tabs; on wide screens they sit side by side.
- **FR-005**: The editor MUST show live budgets: title ≤ 120 and body ≤ 600 code points, and payload ≤ 8192 bytes for tables and calc. Over a budget, Save is disabled; nothing is truncated silently.
- **FR-006**: A card MUST have at least one category before Save. New cards start with the deck's default category selected.
- **FR-007**: The category picker MUST allow several categories and, for roles with category-create permission, MUST create a new shared category inline.
- **FR-008**: Saving an edit MUST send only the changed fields. Categories the editor can't see MUST stay on the card.
- **FR-009**: The table editor MUST support headings, cells, add/remove rows (≤ 12) and columns (≤ 6), and moving rows up and down with buttons.
- **FR-010**: The calc editor MUST support up to 6 fields (key, label, optional unit, optional default), an expression and a result label. It MUST evaluate live and show expression errors in place.
- **FR-011**: The link editor MUST accept a URL and an editable preview title and description. It MUST leave room for a "Fetch preview" action that 008-card-media adds.
- **FR-012**: The editor MUST show a card's extracted details (entities) and allow removing them, not adding.
- **FR-013**: The editor MUST autosave drafts locally while typing. It MUST offer to restore a draft when the editor is reopened, warn when the card changed on the server since the draft began, clear a draft on successful save, and clear all drafts on sign-out.
- **FR-014**: API errors MUST appear next to the field they concern, and a failed save MUST keep the draft.
- **FR-015**: An "Edit" action MUST appear on the card page and on list cards for members allowed to edit that card, and nowhere for others.
- **FR-016**: The review queue's inline edit MUST use the same draft and change rules as the full editor, and MUST offer "Edit fully".
- **FR-017**: The editor MUST work offline for drafting. Saving needs the network and MUST say so when offline.

### Key Entities

- **Draft**: what a member is editing. It holds the card type, title, body, the type's content (link URL and preview, table, calc definition, image reference), categories, source URL and details, plus when it was started and the card's server version at that time.
- **Card** (existing): the saved item. It has a fixed type, a status (published, proposed, archived) and belongs to a deck.
- **Category** (existing): the deck's grouping. A card has one or more; some are private to owners and maintainers.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A member can create one card of each supported type on a phone, each in under 2 minutes, without help.
- **SC-002**: For every supported type, the saved card in the list and the editor preview show the same visible content (title, body, type content, categories).
- **SC-003**: 100% of over-limit or category-less saves are stopped in the form before reaching the server.
- **SC-004**: After a forced reload mid-edit, the member recovers 100% of what they typed up to half a second before the reload.
- **SC-005**: After sign-out, no draft content remains on the device.
- **SC-006**: Opening the reader without the editor costs at most 3 KB more of initial download than before this feature.

## Assumptions

- Cards an editor creates in the full editor are published directly, as today (open question: should they go to review? See the plan's "Settle before starting").
- Archive, restore and delete actions, and the shared deck-link helper, come from 006-card-lifecycle. This feature only adds Edit next to them.
- Image upload and fetched link previews come from 008-card-media. This feature leaves the slots for them.
- Swipe browsing (009-browse-mode) is not affected, except that its details pane reuses the details chips moved here.
- Members use current mobile Safari and Chrome; drafts use the browser's local database storage.
