# Feature Specification: Links from locked social hosts

**Feature Branch**: `015-locked-host-links`

**Created**: 2026-10-22

**Status**: Draft

**Input**: User description: "Phase 7, part 4: links shared from social apps that hide their pages behind a login (Instagram, Facebook, TikTok, X, Threads, LinkedIn) still make useful cards: the shared caption and photo become the card's preview, the card says where it came from, and link checks don't flag these links as dead. Completes PLAN.md Phase 7 demo 4."

Roadmap: `PLAN.md` § Phase 7 (demo 4). Builds on [`014-link-snapshots`](../014-link-snapshots/spec.md) (stored link preview images, link checks) and [`012-media-assets`](../012-media-assets/spec.md) (the asset reference rule).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A shared social post becomes a useful card (Priority: P1)

A member shares an Instagram post with a recipe to the deck from their phone. The share includes the post's link, its caption and a screenshot. The proposal is a link card that shows the caption and the screenshot as its preview, so the card is useful without opening the app or logging in.

**Why this priority**: this is PLAN.md demo 4. Today these pages answer the server with a login wall, so the card has no preview and the extractor may turn the screenshot into a separate image card that loses the link.

**Independent Test**: share a post link with a caption and an image to the deck; the proposal is a link card whose preview shows the caption and the image, and opening the card's link goes to the post.

**Acceptance Scenarios**:

1. **Given** a share with a locked-host link, a caption and an image, **When** the proposal is created, **Then** it is a link card to that URL, its preview image is the shared image and its preview description is the caption.
2. **Given** a share with a locked-host link and a caption but no image, **When** the proposal is created, **Then** it is a link card with the caption as its description and no image.
3. **Given** the locked host does return a usable page title or image for the link, **When** the proposal is created, **Then** those are used and the caption fills only what is missing.
4. **Given** a share from any other site, **When** the proposal is created, **Then** ingest behaves as in 014.

---

### User Story 2 - Readers can tell where a link goes (Priority: P1)

A reader sees a card that links to Instagram. The card shows a small "Instagram" label, so the reader knows the link opens a social app and may ask them to log in.

**Why this priority**: without it, readers tap the link expecting a web page and land on a login wall.

**Independent Test**: a link card to each listed host shows its label; a link card to any other site does not.

**Acceptance Scenarios**:

1. **Given** a link card whose URL is on a locked host (including subdomains such as `m.facebook.com`), **When** it renders, **Then** it shows the host's label.
2. **Given** a link card to another site, **When** it renders, **Then** no label is shown.

---

### User Story 3 - Members can add a photo to any link card (Priority: P2)

A member creates a link card by hand for a TikTok video. There is no preview image, so they add a screenshot from their phone, which becomes the card's preview image.

**Why this priority**: shares are the main path, but hand-made link cards to locked hosts have no other way to get an image.

**Independent Test**: in the editor, add a photo to a link card's preview, save, and the card shows it; replace or remove it and the card follows.

**Acceptance Scenarios**:

1. **Given** the link card editor, **When** a member adds a photo, **Then** it uploads like an image card's photo and becomes the preview image.
2. **Given** a link card with an added photo, **When** a member changes the URL, **Then** the photo stays.
3. **Given** a link card with an added photo, **When** a member removes it, **Then** the card falls back to the page's own preview image, if any.

---

### User Story 4 - Locked links are not flagged as dead (Priority: P2)

The daily link check skips links on locked hosts, because those hosts answer automated requests with login walls or rate limits. Their cards are never flagged as dead or changed.

**Why this priority**: false "dead" flags on every Instagram card would make the flags worthless.

**Independent Test**: a link card to a locked host goes through the daily check and stays unflagged; a manual check request is refused with a clear message.

**Acceptance Scenarios**:

1. **Given** a published link card to a locked host, **When** the daily check runs, **Then** the host is not contacted and the card is recorded as not checkable.
2. **Given** a manual check is requested for such a card, **When** it is handled, **Then** the host is not contacted, the answer says these links can't be checked automatically, and no flag is set. ("Check again" only appears on flagged cards, so members normally never see it here.)

### Edge Cases

- Share with only a locked-host link (no caption, no image): link card with whatever the host returns, else the URL only.
- Caption longer than the description limit: trimmed at a word boundary to 500 characters.
- Several shared images: the first is the preview; the others stay attached to the share as today (not on the card).
- A share's image when no image storage is configured: ingest already can't accept images; the card is a link card without an image.
- Short links that redirect to a locked host (e.g. `fb.watch`, `t.co` → `x.com`): `fb.watch` is listed; other shorteners are judged by the URL as shared, not after redirects.
- A host moves off the list later: its cards are checked again from the next sweep.
- Readers of a card with a member-added photo see that photo, never the remote page image.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The app MUST keep one list of locked hosts with a display label for each; a URL MUST match when its host is a listed host or a subdomain of one.
- **FR-002**: A share whose URL is on a locked host MUST become a link card, never an image card.
- **FR-003**: For such a share, the preview title MUST come from the page's title when available, else from the extracted card title.
- **FR-004**: For such a share, the preview description MUST be the shared caption, trimmed to 500 characters, when the page provides none.
- **FR-005**: For such a share, the preview image MUST be the first shared image when one exists.
- **FR-006**: Link cards to locked hosts MUST show the host's label.
- **FR-007**: The link card editor MUST let a member add, replace and remove a preview photo, using the same upload as image cards.
- **FR-008**: A photo a member added MUST be kept when the card's URL changes; only an automatically copied preview image is replaced.
- **FR-009**: The daily link check and manual checks MUST NOT contact locked hosts, and MUST NOT flag their cards.
- **FR-010**: The automatic preview fill for locked hosts MUST try the page once and accept failure silently.

### Key Entities

- **Locked host**: a site that hides its pages from automated requests behind a login; has a host name and a display label.
- **Link preview photo**: a member-provided image (share or editor upload) shown as a link card's preview image, preferred over any copied page image.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A share of an Instagram post with a caption and screenshot produces a link card proposal showing both, in the same time as other shares (PLAN.md Phase 7 demo 4).
- **SC-002**: Over a month of daily checks, no link card to a locked host is flagged.
- **SC-003**: Every link card to a listed host shows its label.
- **SC-004**: A member can add a photo to a link card in under 30 seconds on a phone.

## Assumptions

- The share sheet delivers the caption as shared text and the post's image as a shared file on the platforms members use; when it doesn't, the member can add a photo in the editor.
- The list starts with Instagram, Facebook, Threads, TikTok, X/Twitter and LinkedIn, and changes by code change only.
- Locked hosts' terms allow linking to and describing their posts; the app stores only what the member shared or uploaded, never content scraped from behind a login.
