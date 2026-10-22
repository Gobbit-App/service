# Feature Specification: Media assets — registry, orphan cleanup and uploads from a URL

**Feature Branch**: `012-media-assets`

**Created**: 2026-10-22

**Status**: Draft

**Input**: User description: "Phase 7, part 1: record every uploaded image so the system knows which ones cards use, remove uploads no card references after a grace period, and let the server copy an image from a remote URL into storage, as a service later features (link snapshots) and MCP reuse. Completes PLAN.md Phase 7 demo 1."

Roadmap: `PLAN.md` § Phase 7 (demo 1). Builds on [`008-card-media`](../008-card-media/spec.md), which shipped signed browser uploads and left the asset registry, orphan cleanup and remote-URL uploads to Phase 7 (D129). Later Phase 7 features: [`013-cloud-image`](../013-cloud-image/spec.md), [`014-link-snapshots`](../014-link-snapshots/spec.md) and [`015-locked-host-links`](../015-locked-host-links/spec.md).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Uploaded photos are recorded and only real uploads can be saved (Priority: P1)

A member takes a photo in the editor and saves the image card, as in 008. The system now records the upload against the deck, with its size and dimensions. A card can only reference an image the system recorded for the same deck, so a client can't attach someone else's image or an arbitrary storage id.

**Why this priority**: without a record of uploads there is nothing to clean up safely, and nothing gives later features the image dimensions they need.

**Independent Test**: upload a photo and save an image card; the asset record exists with the deck, uploader, dimensions and size. Saving an image card with an unknown or another deck's image id is refused.

**Acceptance Scenarios**:

1. **Given** a member who finished an upload in the editor, **When** the editor confirms the upload, **Then** the system records the image for that deck with its dimensions, size and format.
2. **Given** a confirmation whose storage signature doesn't verify, or whose image lies outside the deck's upload location, **When** it is sent, **Then** it is refused and nothing is recorded.
3. **Given** an image card being saved, **When** its image id isn't a recorded image of the same deck, **Then** the save is refused with a validation error.
4. **Given** an image card saved with a recorded image, **When** it is read back, **Then** it carries the image's width and height, filled in by the server.
5. **Given** a photo shared into the deck through ingest, **When** the proposal is created, **Then** the image is recorded for the deck too.

---

### User Story 2 - Unreferenced uploads are removed after a grace period (Priority: P1)

A member uploads a photo and closes the editor without saving, or replaces a card's photo, or a deleted card is purged. A week later a scheduled cleanup deletes images that no card references, from storage and from the registry. Images still used by any card are never touched.

**Why this priority**: this is PLAN.md Phase 7 demo 1 ("the orphan job removes an unreferenced test upload"). Storage otherwise grows without bound.

**Independent Test**: record an upload, backdate it past the grace period, run the cleanup; the image is gone from storage and the registry. A referenced image of the same age stays.

**Acceptance Scenarios**:

1. **Given** a recorded image older than the grace period that no card references, **When** the cleanup runs, **Then** it is deleted from storage and its record removed.
2. **Given** a recorded image referenced by a card in any state (proposed, published, archived, or deleted within the undo window), **When** the cleanup runs, **Then** it is kept.
3. **Given** a recorded image younger than the grace period, **When** the cleanup runs, **Then** it is kept even if unreferenced (an editor may still be open).
4. **Given** storage reports an image as already gone, **When** the cleanup deletes it, **Then** the record is removed and the run continues.
5. **Given** storage fails for some images, **When** the cleanup runs, **Then** those records stay for the next run and the failure is logged.

---

### User Story 3 - The server can copy an image from a URL (Priority: P2)

A server-side caller (the link-snapshot job in 014, later MCP) passes a public image URL and a deck. The system downloads the image through the guarded fetcher, checks its type and size, stores it in the deck's location and records it. No HTTP route exposes this in Phase 7.

**Why this priority**: 014 needs it to copy preview images, and Phase 13 MCP needs it for images proposed by URL (PLAN.md Phase 7 MCP note). Nothing user-facing depends on it in this feature.

**Independent Test**: call the service with a URL served by a local fixture server (test wiring); the image is stored and recorded. A private-address URL, a non-image response, or one over the size limit is refused without storing anything.

**Acceptance Scenarios**:

1. **Given** a public image URL and a deck, **When** the service is called, **Then** the image is stored under the deck's location, tagged by source, and recorded with its dimensions.
2. **Given** a URL resolving to a private or local address, a non-image content type, an image over the size limit, or a timeout, **When** the service is called, **Then** it returns a "no image" result with a logged reason and stores nothing.
3. **Given** no image storage configured, **When** the service is called, **Then** it reports "unavailable" without fetching.

### Edge Cases

- Upload finished in an editor tab left open more than the grace period, then saved: the save is refused because the image was cleaned up; the editor shows "photo expired, add it again". Grace (7 days) is far longer than any real editing session.
- A card's photo is replaced: the old image becomes unreferenced. The grace period counts from when the image was recorded, so an old photo is usually removed on the next run. Edits have no undo, so nothing needs it after that.
- A card is deleted: its image stays while the card is in the 30-day undo window ([`006-card-lifecycle`](../006-card-lifecycle/spec.md)); after the weekly purge it is unreferenced and the next cleanup removes it.
- An ingest job is discarded or fails: the existing per-job cleanup deletes its uploads by tag (Phase 5). The registry record then points at nothing; the cleanup removes it once unreferenced.
- The same storage account serves several environments (development and production): the cleanup only deletes images recorded in its own database, never by listing the storage account, so one environment can't delete another's images.
- Images uploaded before this feature (008 editor uploads, Phase 5 ingest uploads) that cards reference: recorded by the migration so they are protected and carry no dimensions until backfilled.
- Images uploaded before this feature that no card references: not in the registry, so the cleanup doesn't see them; a one-off dry-run report lists them for manual removal.
- Very many orphans at once: deleted in batches; one run has an upper bound and the rest wait for the next day.
- A card references the same image as another card (copy of a card): the image is kept while any card references it.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST keep a registry of stored images, each belonging to one deck, with its storage id, source (editor, ingest, link snapshot, remote), dimensions, size, format, uploader and creation time.
- **FR-002**: The editor MUST confirm each finished upload; the system MUST verify the storage signature and that the image lies in the deck's editor location before recording it, and record it only for callers allowed to create cards in that deck.
- **FR-003**: Ingest image uploads MUST be recorded when they are stored.
- **FR-004**: Creating or updating an image card MUST be refused unless its image id is a recorded image of the same deck.
- **FR-005**: The server MUST fill an image card's width and height from the registry; values sent by the client are ignored.
- **FR-006**: A scheduled cleanup MUST delete, from storage and the registry, recorded images older than the grace period that no card of any status references.
- **FR-007**: The cleanup MUST only consider images in its own registry and MUST NOT list or delete storage content by folder or prefix.
- **FR-008**: The cleanup MUST work in bounded batches, treat "already gone" as deleted, keep records whose deletion failed, and log a summary (deleted, kept, failed).
- **FR-009**: The system MUST offer a server-side service that copies an image from a public URL into a deck's storage location through the guarded outbound fetcher, enforcing image type and size limits, and records it.
- **FR-010**: Without image storage configured, confirmation and copying MUST answer "service unavailable" and the cleanup MUST not be scheduled; all other features keep working.
- **FR-011**: The migration MUST record the images referenced by existing image cards, so the first cleanup never removes an image in use.
- **FR-012**: Delivered images keep the existing transformation (`f_auto,q_auto,c_limit` with a width), so PLAN.md demo 1's delivery check holds.

### Key Entities

- **Asset**: a stored image recorded for a deck: storage id, source, dimensions, size, format, uploader, creation time. Referenced by cards through their payload, never by a stored foreign key.
- **Reference**: an image card's `publicId`, or (from 014) a link card's preview image id. Derived from card payloads when the cleanup runs.
- **Orphan**: an asset older than the grace period with no reference from any card.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An unreferenced test upload, backdated past the grace period, is gone from storage after one cleanup run (PLAN.md Phase 7 demo 1).
- **SC-002**: No image referenced by any card is deleted by the cleanup (integration test across all card statuses).
- **SC-003**: A cleanup run against a development database sharing the storage account deletes nothing that the development database didn't record.
- **SC-004**: Saving an image card with an unknown or foreign image id is refused 100 % of the time.
- **SC-005**: A remote image copy completes in under 15 seconds for a 2 MB image, or reports "no image" within the fetcher's timeout.

## Assumptions

- Production always has image storage configured; development may not (as in 008).
- Seven days of grace covers any realistic editing session and the time between replacing a photo and changing one's mind.
- Cards keep referencing images by storage id in their payload (008); the registry adds no foreign key from cards to assets, so card payloads stay the single source of which images are used.
- The copy-from-URL service has no HTTP route in Phase 7; 014 and Phase 13 call it from the server.
- Ingest's per-job cleanup (Phase 5) stays as it is; the registry cleanup is the backstop.
