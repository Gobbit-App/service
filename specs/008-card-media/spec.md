# Feature Specification: Card media — image uploads and link previews

**Feature Branch**: `008-card-media`

**Created**: 2026-10-20

**Status**: Draft

**Input**: User description: "Phase 6, part 3: let members author image cards on the phone (take or pick a photo, upload it, add alt text) and fill a link card's preview from the page, as server-side rules a later MCP client reuses. Completes PLAN.md Phase 6 demo 1 (one card of each of the five types)."

Roadmap: `PLAN.md` § Phase 6 (demo 1). Builds on the editor from [`007-card-editor`](../007-card-editor/spec.md); siblings [`006-card-lifecycle`](../006-card-lifecycle/spec.md) and [`009-browse-mode`](../009-browse-mode/spec.md). The asset registry, orphan cleanup, uploads from a remote URL, copying preview images and dead-link checks stay in Phase 7 (`PLAN.md` § Phase 7).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Add a photo card from the phone (Priority: P1)

A member with permission to add cards opens the editor, picks "Image", takes a photo (or picks one from the gallery), watches it upload, writes a short description of what the photo shows, picks a category and saves. The card appears in the list showing the photo.

**Why this priority**: image is the only card type that can't be authored by hand at all today. Without it the Phase 6 exit criterion "all five types authorable" fails.

**Independent Test**: on a phone, create an image card in a test deck; it renders in the list, on its card page and in the editor preview with the uploaded photo and its alt text.

**Acceptance Scenarios**:

1. **Given** a member who can add cards in a deck with image storage configured, **When** they choose a photo, enter alt text and save, **Then** an image card is created with that photo and alt text, and it renders the same in the list and in the preview.
2. **Given** an upload in progress, **When** the member watches the editor, **Then** they see progress and can cancel it; cancelling leaves no image attached to the draft.
3. **Given** an image draft with a finished upload, **When** the member taps "Replace" or "Remove", **Then** the draft shows the new photo or no photo, and Save stays disabled until a photo and alt text are present.
4. **Given** a reader (no permission to add cards), **When** they request upload permission for the deck, **Then** it is refused.
5. **Given** an editor reopened after closing the tab mid-edit, **When** the draft is restored, **Then** a finished upload is still attached; an unfinished one is not.

---

### User Story 2 - Fill a link card's preview from the page (Priority: P2)

While writing a link card, the member taps "Fetch preview". The page's title, description and image fill in; the member can edit the title and description before saving.

**Why this priority**: link cards already work without a preview (Phase 3B); the preview makes them recognisable in the list but is not required.

**Independent Test**: create a link card for a public page with Open Graph tags; the preview fields fill in, the saved card shows them in the list.

**Acceptance Scenarios**:

1. **Given** a link draft with a public page URL, **When** the member taps "Fetch preview", **Then** title, description and image fill from the page within about 10 seconds, and an empty card title is filled from the page title.
2. **Given** a preview was filled, **When** the member edits or clears a preview field and saves, **Then** the card stores the edited values.
3. **Given** a URL that points at a private or local network address, an unreachable host, a non-HTML resource or a page that times out, **When** the member taps "Fetch preview", **Then** they see "No preview available" and can still save the card.
4. **Given** the member is offline, **When** they tap "Fetch preview", **Then** the button explains it needs a connection and the card can still be saved once online.

---

### User Story 3 - Instance without image storage (Priority: P3)

A self-hoster runs the app locally without image storage credentials. Everything except image cards keeps working, and the editor says why image cards are unavailable.

**Why this priority**: the app must stay runnable with optional services missing (constitution VII); this only affects development and self-hosted setups, since production requires the storage credentials.

**Independent Test**: start the API without image storage configured; the editor's card-type choice shows "Image" as unavailable with an explanation; requesting upload permission answers "service unavailable".

**Acceptance Scenarios**:

1. **Given** no image storage configured, **When** a member opens the card-type choice when adding a card, **Then** "Image" is disabled with a short explanation and the other types work.
2. **Given** no image storage configured, **When** a client requests upload permission, **Then** it gets a "service unavailable" problem response.

### Edge Cases

- File larger than the size limit: refused before upload starts, with the limit shown.
- Unsupported file type (e.g. GIF, PDF, video): refused before upload; HEIC/HEIF from iPhones is accepted.
- Slow connection: progress keeps updating; cancel works at any point; a failed upload can be retried without re-picking when the file is still available.
- Connection lost mid-upload: the upload fails with a retry option; the draft keeps its other fields.
- Upload permission expires before the upload starts (editor left open for a long time): the editor asks for a fresh permission transparently.
- Upload finished but the card is never saved: the photo stays in storage, marked as editor-uploaded for that deck, until Phase 7's cleanup removes unreferenced uploads.
- A card later deleted and purged ([`006-card-lifecycle`](../006-card-lifecycle/spec.md)): its photo also stays until Phase 7's cleanup.
- Many preview or upload requests in a short time: refused with a "try again later" response after an hourly limit.
- Page with no Open Graph tags: the page `<title>` is used if present; otherwise no preview.
- Very long page title or description: trimmed so the card stays within the payload size limit.
- Preview image is on another site: shown as a remote image until Phase 7 copies it.
- The same URL fetched by several members within an hour: answered from a short-lived cache.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST issue a short-lived upload permission for a deck only to callers allowed to create cards in that deck; a deck the caller can't see answers "not found".
- **FR-002**: Upload permission MUST restrict uploads to images (JPEG, PNG, WebP, HEIC/HEIF), place them in a per-deck location, and mark them as editor uploads of that deck so a later cleanup can find unreferenced ones.
- **FR-003**: The storage secret MUST never be sent to the client; the client receives only a signature and the public identifiers needed to upload.
- **FR-004**: The editor MUST check file type and size before uploading and show the limit when refusing.
- **FR-005**: The editor MUST show upload progress and allow cancelling; a cancelled or failed upload leaves no photo attached to the draft.
- **FR-006**: An image card MUST NOT be saveable without a finished upload and non-empty alt text.
- **FR-007**: An image draft MUST allow replacing and removing the photo.
- **FR-008**: The stored image card MUST reference the uploaded photo by its storage identifier, and the card renders through the same image renderer as the list.
- **FR-009**: The system MUST offer a link-preview lookup for a URL to callers allowed to create cards in the deck.
- **FR-010**: The preview lookup MUST use the existing guarded outbound fetcher only, so private, local and non-standard-port targets are never contacted.
- **FR-011**: The preview lookup MUST return title, description and image from the page's Open Graph data (title falling back to the page title), trimmed to fixed maximum lengths, or "no preview".
- **FR-012**: A failed or empty preview lookup MUST NOT block saving the card and MUST NOT reveal why it failed beyond "no preview available".
- **FR-013**: Preview lookups and upload permissions MUST each have a per-user hourly limit, answered with "rate limited" and a retry time when exceeded.
- **FR-014**: Repeated preview lookups for the same URL within an hour SHOULD be served from a cache without contacting the page again.
- **FR-015**: When image storage isn't configured, upload permission MUST answer "service unavailable", and the editor MUST show image cards as unavailable with an explanation.
- **FR-016**: Both capabilities MUST be services that a non-web client (Phase 13 MCP) can call without the web app.

### Key Entities

- **Upload permission**: short-lived, signed grant for one deck: where the photo goes, how it is marked, which types are allowed, when it expires.
- **Uploaded photo**: an image in the storage service, marked as an editor upload of a deck; referenced by an image card through its storage identifier and alt text.
- **Link preview**: title, description and image URL read from a page; stored inside a link card's payload; the image stays a remote URL in this feature.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A member creates one card of each of the five types on a phone, each rendering identically in the list and the editor preview (PLAN.md Phase 6 demo 1).
- **SC-002**: A typical phone photo (≤ 5 MB) uploads and is attached to the draft in under 15 seconds on a 4G connection.
- **SC-003**: A link preview for a public page with Open Graph tags appears within 10 seconds, or the editor says "No preview available" within 11 seconds.
- **SC-004**: Zero outbound requests reach private or local network addresses from preview lookups (guarded fetcher test suite).
- **SC-005**: With image storage unconfigured, all other card types can still be created and edited.

## Assumptions

- Production always has image storage configured (it is already required there for ingest uploads); development and self-hosted setups may not.
- The editor, its per-type field slots, drafts and preview come from [`007-card-editor`](../007-card-editor/spec.md); this feature fills the image fields and adds the preview button to the link fields.
- The image card stores only the storage identifier and alt text; width/height are not stored (the current payload shape has no such fields).
- Uploaded photos that are never saved, and photos of purged cards, remain in storage until Phase 7's cleanup; this is accepted for now.
- Preview images are not copied into storage until Phase 7.
- Archive, delete and undelete of cards come from [`006-card-lifecycle`](../006-card-lifecycle/spec.md) and need no media-specific behaviour here.
