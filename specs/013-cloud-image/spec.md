# Feature Specification: Responsive images — `CloudImage`

**Feature Branch**: `013-cloud-image`

**Created**: 2026-10-22

**Status**: Draft

**Input**: User description: "Phase 7, part 2: every stored image is delivered at the size it is shown, reserves its space before it loads and shows a soft placeholder, through one image component. Completes PLAN.md Phase 7 demo 2 (Lighthouse shows no 'properly size images' warning on the list view)."

Roadmap: `PLAN.md` § Phase 7 (demo 2). Builds on [`012-media-assets`](../012-media-assets/spec.md) (image dimensions in the payload) and on 009's measured `sizes` in Browse ([`009-browse-mode`](../009-browse-mode/spec.md), D144). [`014-link-snapshots`](../014-link-snapshots/spec.md) uses the same component for snapshotted link preview images.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Images load at the size they are shown (Priority: P1)

A member scrolls a category with many photos on a phone or a laptop. Each photo is downloaded at the smallest width that is still sharp at the size it is shown on that screen, not at full-screen width.

**Why this priority**: this is PLAN.md demo 2. Today the list asks the browser for an image as wide as the whole viewport, so wide screens download images much larger than the card column.

**Independent Test**: run Lighthouse on the list view of an image-heavy category on mobile and desktop settings; there is no "properly size images" warning.

**Acceptance Scenarios**:

1. **Given** a list with image cards in a narrow column on a wide screen, **When** the page loads, **Then** each image is requested at a width matching the column, not the viewport.
2. **Given** a phone with a high-density screen, **When** the list loads, **Then** images are requested at a width that is sharp at that density, within the available sizes.
3. **Given** the column changes width (rotation, window resize), **When** later images load, **Then** they use the new width.

---

### User Story 2 - No layout jumps while images load (Priority: P1)

While photos load, the list keeps its layout: each image's space is reserved at its real proportions, and a soft blurred preview of the photo fills it until the sharp image arrives.

**Why this priority**: layout jumps make the list hard to read and move tap targets under the finger. PLAN.md's exit criterion (an image-heavy category loads quickly on 4G) depends on the page being usable before every image is in.

**Independent Test**: throttle the network and load an image-heavy list; nothing below an image moves when it finishes loading, and a blurred preview is visible in the meantime.

**Acceptance Scenarios**:

1. **Given** an image card with known dimensions, **When** the list renders before the image loads, **Then** the image's box already has the photo's proportions.
2. **Given** an image card without known dimensions (an older card), **When** it renders, **Then** it uses a fixed default box and shows the whole photo inside it without cropping.
3. **Given** a slow connection, **When** an image is still loading, **Then** a blurred low-detail version of it is shown in its box and fades out when the sharp image arrives.
4. **Given** reduced motion is requested, **When** the sharp image arrives, **Then** it appears without a fade.

---

### User Story 3 - One image component everywhere (Priority: P2)

Image cards in the list, on the card page, in Browse and in the editor preview all render through the same component, so they behave the same and later changes happen in one place.

**Why this priority**: 009 added sizing hints only to Browse; keeping two paths invites drift.

**Independent Test**: an image card looks and loads the same in each place it appears; the editor preview shows the photo right after upload.

**Acceptance Scenarios**:

1. **Given** an image card, **When** it appears in the list, the card page, Browse or the editor preview, **Then** it uses the same sizing, space reservation and placeholder.
2. **Given** Browse's current card, **When** it renders, **Then** it still loads first with high priority (009 behaviour kept).
3. **Given** image delivery fails, **When** the image errors, **Then** the card shows "Image unavailable" as today.

### Edge Cases

- No image storage configured: "Image unavailable", as today; no placeholder request.
- Offline with an image already viewed: shown from the image cache, as today. A placeholder that was never cached is skipped and the box stays reserved.
- Very tall or very wide photos: the box is capped at a maximum height and the whole image fits inside it, so a panorama doesn't become a thin strip and a tall screenshot doesn't fill three screens.
- Containers narrower than the smallest size: the smallest size is used.
- Print or a screenshot of the card page: the sharp image, never the placeholder.
- Image cards proposed by ingest before 012 (no dimensions): default box.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Stored images MUST be delivered through one component that offers the existing set of widths and tells the browser the width the image is actually shown at.
- **FR-002**: The shown width MUST come from the image's container, measured on screen, with an estimate before the first measurement.
- **FR-003**: When an image's dimensions are known, its box MUST have the image's proportions before it loads; when not, a fixed default box MUST be used with the whole image visible.
- **FR-004**: A blurred low-detail version of the image MUST be shown while the sharp image loads, and MUST be removed when it has loaded or failed.
- **FR-005**: The transition from placeholder to sharp image MUST respect reduced-motion preferences.
- **FR-006**: Images MUST load lazily by default; a caller MUST be able to ask for one image to load first with high priority.
- **FR-007**: Image cards in the list, the card page, Browse and the editor preview MUST use this component; the previous Browse-only sizing hook MUST be replaced by it.
- **FR-008**: Failed delivery MUST show "Image unavailable" as today.
- **FR-009**: The delivery transformation keeps `f_auto,q_auto,c_limit` with a width (PLAN.md demo 1).
- **FR-010**: The initial download size of the web app MUST stay within its budget; the component may add at most 1 KB compressed.

### Key Entities

- **Image source set**: the fixed list of delivery widths (360, 720, 1080) for one stored image.
- **Shown width**: the width of the image's container on screen, which the browser combines with screen density to pick a width from the source set.
- **Placeholder**: a tiny, blurred delivery of the same image, used only while the sharp one loads.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Lighthouse (mobile and desktop presets) reports no "properly size images" opportunity on the list view of an image-heavy category (PLAN.md Phase 7 demo 2).
- **SC-002**: Cumulative layout shift on that list view is below 0.05 in Lighthouse's mobile preset.
- **SC-003**: An image-heavy category (20 photo cards) shows its first screen of cards with placeholders in under 1.5 seconds on Lighthouse's simulated 4G (PLAN.md exit criterion).
- **SC-004**: The web app's initial bundle grows by at most 1 KB compressed and stays under the 150 KB budget.

## Assumptions

- Image dimensions come from [`012-media-assets`](../012-media-assets/spec.md) (server-owned `width`/`height` in the image payload); cards without them use the default box.
- The browser picks the density-appropriate width from the source set and the shown width; the component does not compute device pixel ratio itself.
- Link preview images use this component once [`014-link-snapshots`](../014-link-snapshots/spec.md) stores them; remote preview images keep their current rendering until then.
- No image is cached by the service worker beyond what the existing image cache already does.
