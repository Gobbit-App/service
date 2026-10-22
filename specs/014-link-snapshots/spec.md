# Feature Specification: Link snapshots and link checks

**Feature Branch**: `014-link-snapshots`

**Created**: 2026-10-22

**Status**: Draft

**Input**: User description: "Phase 7, part 3: link cards keep a stored copy of their preview image, so they still look right when the site changes or goes away, and a daily check flags links that died or changed so members can fix them. Completes PLAN.md Phase 7 demo 3 (a link whose site removed its OG image keeps showing the stored copy; a dead link is flagged)."

Roadmap: `PLAN.md` § Phase 7 (demo 3). Builds on:

- [`012-media-assets`](../012-media-assets/spec.md): copying an image from a URL, the asset registry, the orphan sweep;
- [`013-cloud-image`](../013-cloud-image/spec.md): rendering stored images;
- [`008-card-media`](../008-card-media/spec.md): link preview lookup in the editor.

[`015-locked-host-links`](../015-locked-host-links/spec.md) extends both the snapshot and the check for social sites.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Link previews survive the site changing (Priority: P1)

A member saves a link to a recipe page. The card shows the page's title, description and image. Months later the site redesigns and drops its preview image, or blocks hotlinking. The card still shows the same image, because the app keeps its own copy.

**Why this priority**: this is PLAN.md demo 3. Today the card loads the image straight from the other site on every view, so it breaks whenever that site changes and tells the other site who is reading.

**Independent Test**: save a link card whose page has a preview image, then make the image URL unreachable. The card still shows the image.

**Acceptance Scenarios**:

1. **Given** a member saves a link card with a preview image, **When** a few seconds pass, **Then** the card's preview image is served from the app's own storage.
2. **Given** a link card is shared into the deck (ingest), **When** the proposal is created, **Then** it has the page's title, description and image, and the image is copied the same way.
3. **Given** the copied image exists, **When** the source site removes or changes its image, **Then** the card keeps showing the copy.
4. **Given** the source image can't be copied (blocked, too large, not an image), **When** the card renders, **Then** it shows the remote image as today, or no image if that fails too.
5. **Given** a member changes the card's URL or preview image, **When** they save, **Then** the copy is refreshed and the old one is cleaned up later by the orphan sweep.
6. **Given** a card with a copied image, **When** a member searches, **Then** the stored image's internal name never matches the search.

---

### User Story 2 - Dead and changed links are flagged (Priority: P1)

Once a day, the app checks a small batch of saved links that haven't been checked recently. When a page has disappeared twice in a row, or its title is clearly different from what was saved, the card shows a quiet note ("Link may be dead" or "Link may have changed"), so readers know before they tap.

**Why this priority**: this is the second half of demo 3. A family knowledge base fills up with dead links over the years, and nobody notices until they need one.

**Independent Test**: save a link to a page that then returns 404. After two checks, the card shows "Link may be dead".

**Acceptance Scenarios**:

1. **Given** a published link card not checked in 30 days, **When** the daily check runs, **Then** the link is requested once and the result recorded.
2. **Given** a link answers "not found" or "gone" (or the host can't be reached) on two checks in a row, **When** the second check finishes, **Then** the card is flagged "Link may be dead".
3. **Given** a link answers once with a temporary error (time-out, server error, rate limit), **When** the next check succeeds, **Then** the card is not flagged.
4. **Given** a link's page title differs from the card's preview title, **When** the check finishes, **Then** the card is flagged "Link may have changed".
5. **Given** a flagged link starts answering normally with the same title again, **When** it is checked, **Then** the flag clears by itself.

---

### User Story 3 - Members act on flagged links (Priority: P2)

A member who can edit cards sees a "Links to check" list for the deck, can ask for a check right away after fixing a URL, and can dismiss a flag they've looked at and decided to keep.

**Why this priority**: a flag nobody can act on is noise. This is the smallest set of actions that makes the flags useful without a full review queue (Phase 10 adds that).

**Independent Test**: a flagged card appears in "Links to check". "Check again" re-checks it now. "Dismiss" hides the flag until the link's status changes again.

**Acceptance Scenarios**:

1. **Given** flagged cards in a deck, **When** a member who can edit opens "Links to check", **Then** they see exactly the flagged, not dismissed, published link cards they can see.
2. **Given** a flagged card, **When** an editor taps "Check again", **Then** the link is checked within seconds and the card shows the new result.
3. **Given** an editor checks again many times, **When** they exceed 10 checks in an hour, **Then** further checks are refused with a clear message.
4. **Given** a flagged card, **When** an editor dismisses the flag, **Then** the note disappears for everyone, until a later check reaches a different status.
5. **Given** a reader (no edit rights), **When** they view a flagged card, **Then** they see the note but no actions, and they don't see "Links to check".

### Edge Cases

- A link card without a preview image: no copy, and the check still runs.
- The same image used by many cards: each card gets its own copy, with no deduplication. Copies are small and are cleaned up with their cards.
- A card is edited while its copy is being made: the newer edit wins. The copy is retried once against the new version, then given up.
- A card is archived or deleted: it is not checked. Its copy follows the orphan sweep rules from 012.
- The page redirects to a login page or a different site: treated as alive. The title change flags it "may have changed".
- Proposed cards (ingest): copied, but not checked until published.
- Hosts that answer bots with 403 or 429 every time: counted as temporary failures, never "dead". 015 marks known social sites as not checked.
- No image storage configured: no copy, and checks still run. No outbound access in tests: checks use a local fixture server.
- A deck with thousands of links: at most 100 checks a day across the deployment, oldest first. Each link is checked about once a month.
- Offline readers: the flag is part of the card data and shows from the cache.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: After a link card is created, published, or has its URL or preview image changed, the system MUST copy its preview image into the deck's storage in the background and record it as an asset.
- **FR-002**: The copy MUST go through the same guarded outbound path, type check and size limit as other remote images (012).
- **FR-003**: Ingest proposals for links MUST keep the page's title, description and image as the card's preview.
- **FR-004**: The card MUST show the stored copy when present, and fall back to the remote image, then to no image.
- **FR-005**: A background copy MUST NOT overwrite a newer edit of the card.
- **FR-006**: The stored copy's internal name MUST NOT be part of the card's searchable text.
- **FR-007**: The system MUST check a bounded daily batch of published link cards, each about once every 30 days, and record the result.
- **FR-008**: A link MUST be flagged dead only after two consecutive definite failures (not found, gone, unreachable host, blocked address). Temporary errors MUST NOT flag a link as dead on their own.
- **FR-009**: A link MUST be flagged changed when the page's title differs from the card's preview title.
- **FR-010**: A flag MUST clear when a later check is healthy. A dismissed flag MUST stay hidden until the status changes.
- **FR-011**: Every reader of a card MUST see its active flag. Only members who can edit cards MUST be able to check again (at most 10 per hour per member), dismiss, and list "Links to check".
- **FR-012**: Checks MUST go only through the guarded outbound path, at most one request per host at a time.
- **FR-013**: Without image storage, copies MUST be skipped silently. Checks MUST NOT depend on image storage.

### Key Entities

- **Link snapshot**: the stored copy of a link card's preview image (an asset with source "link snapshot"), with its dimensions, referenced from the card's preview.
- **Link check**: the latest result of checking one link card: status (ok, dead, changed, unchecked), the HTTP status or error, the title seen, consecutive failures, when it was checked, when it is due next, and whether its flag was dismissed.
- **Link health**: what a reader sees on a card: a dead or changed flag and when it was found, or nothing.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A link card saved with a preview image shows its stored copy within 30 seconds of saving, when image storage is configured.
- **SC-002**: A link whose site removes its preview image keeps showing the copy (PLAN.md Phase 7 demo 3).
- **SC-003**: A link that returns 404 is flagged "dead" after its second check, and a temporary error is never flagged as dead.
- **SC-004**: The daily check makes at most 100 outbound requests and finishes in under 10 minutes.
- **SC-005**: No search for a stored image's internal name returns the link card.

## Assumptions

- Remote image copying, the asset registry and the orphan sweep come from [`012-media-assets`](../012-media-assets/spec.md).
- Stored images render through [`013-cloud-image`](../013-cloud-image/spec.md); 014 can ship before 013 with a plain image in the meantime.
- The page title is the comparison signal for "changed". Body content is not compared.
- A once-a-month cycle with 100 checks a day covers about 3,000 link cards, which is well above current use. The batch size is a constant.
- Phase 10's staleness watcher will later feed these flags into the review queue. 014 doesn't touch the review queue.
