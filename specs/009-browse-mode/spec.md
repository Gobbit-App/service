# Feature Specification: Browse mode (swipe navigation)

**Feature Branch**: `009-browse-mode`

**Created**: 2026-10-20

**Status**: Draft

**Input**: User description: "Phase 6, steps 3–5 of the roadmap: a full-screen Browse mode that shows one card per screen. Swipe up/down to change card, swipe the header to change category, swipe the footer to change what part of the card you see. System back gestures keep working, every gesture has a tap equivalent, and it stays smooth with image cards."

Roadmap: `PLAN.md` § Phase 6, demos 3–5. Builds on [`006-card-lifecycle`](../006-card-lifecycle/spec.md) and [`007-card-editor`](../007-card-editor/spec.md); sibling [`008-card-media`](../008-card-media/spec.md).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Swipe through a category's cards (Priority: P1)

A member opens Browse from a deck's list and sees one card filling the screen. Swiping up shows the next card, swiping down the previous one. Closing Browse returns them to the list at the card they were on.

**Why this priority**: This is the core of the feature: reading a category card by card on a phone. Everything else layers on it.

**Independent Test**: In a deck with 10 cards in one category, open Browse, swipe through all 10 and close it. The list should show the card you were on.

**Acceptance Scenarios**:

1. **Given** a category with 10 published cards, **When** the member opens Browse from that category, **Then** the first visible card of the list fills the screen and its position ("1 of 10" or equivalent) is shown.
2. **Given** Browse on card 3, **When** the member swipes up, **Then** card 4 settles into place with no card stopping half-way.
3. **Given** Browse on card 7, **When** the member closes Browse, **Then** the list for that category is shown with card 7 in view.
4. **Given** Browse on card 5, **When** the member copies the address and opens it on the same device, **Then** Browse opens on card 5 in the same category and pane.
5. **Given** a category with more cards than one page of the list, **When** the member swipes towards the end of what is loaded, **Then** further cards are already loaded by the time they get there.

---

### User Story 2 - Change category from the header (Priority: P1)

While in Browse, the member swipes left or right on the header to move to the next or previous category, in the same order as the chip row.

**Why this priority**: Demo 3 needs it. Without it, Browse is limited to one category per visit.

**Independent Test**: Open Browse in "Food" and swipe the header left. Browse should show the first card of the next category.

**Acceptance Scenarios**:

1. **Given** Browse in category Food, **When** the member swipes left on the header, **Then** Browse shows the next category in chip-row order, starting at its first card, with the category name in the header.
2. **Given** Browse in the first category, **When** the member swipes right on the header, **Then** nothing changes and the header shows it is already at the first one (no wrap-around).
3. **Given** the member swipes horizontally in the middle of the screen, **Then** the category does not change.

---

### User Story 3 - See a card's details and source from the footer (Priority: P2)

The footer switches the card between three panes:
- **Content**: the card as it appears in the list.
- **Details**: extracted details such as phones, addresses and hours, plus categories and type.
- **Source**: where the card came from, and when it was added, edited and published.

**Why this priority**: Demo 3 ("swipe the footer to see a card's entities"). This is useful, but reading the content comes first.

**Independent Test**: On a card with extracted details, swipe the footer left once. The details pane should list them.

**Acceptance Scenarios**:

1. **Given** a card with a phone number and an address among its details, **When** the member swipes left on the footer, **Then** the Details pane lists both, each labelled by kind.
2. **Given** the Details pane is open, **When** the member swipes up to the next card, **Then** the next card opens on the same pane.
3. **Given** a card with no extracted details, **When** the Details pane opens, **Then** it says there are no details instead of showing an empty area.
4. **Given** the Source pane, **Then** it shows the source kind, the source link if any, and the added/edited/published times as relative ages.

---

### User Story 4 - Every gesture has a visible tap and keyboard equivalent (Priority: P2)

A member who doesn't know the gestures can still do everything:
- Next and previous card buttons.
- Category chevrons and a category name they can tap.
- Pane tabs.
- Keyboard shortcuts.

The first time they open Browse, a short overlay shows the three zones.

**Why this priority**: Demo 4. Gestures you can't discover leave some members stranded. Accessibility also needs it.

**Independent Test**: Use only taps (no swipes) to change card, category and pane. Then do the same with only the keyboard.

**Acceptance Scenarios**:

1. **Given** Browse is opened for the first time on a device, **Then** an overlay shows the header, middle and footer zones and what each does. Dismissing it means it is not shown again on that device.
2. **Given** Browse, **When** the member taps the "next card" button, **Then** the result is the same as swiping up.
3. **Given** Browse, **When** the member presses PageDown, PageUp, ← or →, **Then** the card (PageDown/PageUp) or category (←/→) changes.
4. **Given** a screen reader, **Then** each control has a spoken name ("Next card", "Previous category: School", "Details tab").
5. **Given** the device asks for reduced motion, **Then** changes happen without slide animations.

---

### User Story 5 - Smooth with image cards (Priority: P3)

Swiping through a category of image cards stays smooth on a mid-range Android phone.

**Why this priority**: Demo 5. It matters for the feel of the feature, but stories 1–4 deliver value without it.

**Independent Test**: Record a performance trace while swiping through 20 image cards and check it for long tasks.

**Acceptance Scenarios**:

1. **Given** 20 image cards, **When** the member swipes through all of them, **Then** the trace shows no main-thread task longer than 50 ms during the swipes.
2. **Given** Browse on card n, **Then** the image for card n+1 is already loaded when it comes into view.

---

### Edge Cases

- **Empty category**: Browse shows the same empty message as the list. The header still changes category, and the card controls are disabled.
- **Last card**: swiping up does nothing beyond a native bounce, and "next card" is disabled. At the end of a fully loaded category, the position shows "10 of 10".
- **Offline**: categories already cached on the device browse normally. A category that isn't cached shows the list's offline message, and the header still moves on to other categories.
- **RTL text**: card text keeps its own direction. "Next category" always means the next chip in chip-row order. Header swipes follow the swipe direction, not the text direction.
- **System back gesture**: a swipe starting at the left or right screen edge (iOS back-swipe, Android back gesture) is never treated as a category or pane swipe, so it leaves Browse as usual.
- **Card taller than the screen**: the content area scrolls inside the card. Only at the end of the card's own content does a further swipe move to the next card.
- **Deep link to an archived, hidden, deleted or unknown card**: Browse opens at the first card of the category, and a short notice says the requested card isn't available. Nothing is revealed about why.
- **Unknown category in the address**: Browse falls back to "All".
- **Rotation or resize**: the current card stays the current card.
- **Card changed by someone else while browsing**: the card shows the newest data the list cache has. Position is kept by card, not by index.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Members MUST be able to open Browse from a deck's list views (All and any category). It opens on the first card visible in that list.
- **FR-002**: Browse MUST show one card per screen. A vertical swipe or the next/previous controls MUST move exactly one card and settle on a whole card.
- **FR-003**: Browse MUST show the same cards, in the same order and with the same visibility rules, as the list for the same category. It MUST NOT show archived, deleted or proposed cards.
- **FR-004**: The address MUST encode the category, current card and pane. Opening that address MUST restore them. Moving between cards MUST NOT add a browser history entry per card.
- **FR-005**: Closing Browse, whether by the close control or the system back action, MUST return to the list for the current category with the current card in view.
- **FR-006**: A horizontal swipe in the header zone (top quarter of the screen, at least 88 px tall) MUST move to the next or previous category in chip-row order, without wrapping. The categories are All plus every visible category.
- **FR-007**: A horizontal swipe in the footer zone (bottom quarter, at least 88 px tall) MUST move between the Content, Details and Source panes. The chosen pane MUST stay when the card changes.
- **FR-008**: Horizontal swipes that start within 24 px of the left or right screen edge MUST be ignored, so the system back gesture keeps working.
- **FR-009**: Horizontal swipes in the middle zone MUST NOT change category or pane. If the card is taller than the screen, its content MUST scroll vertically before moving to the next card.
- **FR-010**: The Details pane MUST show the card's extracted details grouped by kind, its categories and its type. The Source pane MUST show the source kind, the source link if any, and the added, edited and published times.
- **FR-011**: Every gesture MUST have a visible tap control and a keyboard shortcut:
  - next/previous card (PageDown/PageUp);
  - next/previous category (→/←), plus a tappable category name;
  - pane tabs (Tab and Enter).
  Each control MUST have an accessible name.
- **FR-012**: The first time Browse opens on a device, an overlay MUST explain the three zones. Once dismissed, it MUST NOT show again on that device.
- **FR-013**: When the device requests reduced motion, Browse MUST change cards, categories and panes without slide animations.
- **FR-014**: Browse MUST load the next page of cards before the member reaches the end of the loaded ones. It MUST work offline for categories already cached on the device.
- **FR-015**: Browse MUST NOT increase the app's initial download beyond the existing 150 KB gzip budget. It loads only when opened.
- **FR-016**: Card actions available in the list (favorite, share, open the card page) MUST work in Browse's Content pane.

### Key Entities

- **Browse position**: the category, the current card and the pane; reflected in the address.
- **First-run hint flag**: per device, whether the zones overlay has been dismissed.
- Cards, categories and extracted details as they already exist (no new data on the server).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A member swipes through 10 cards of one category, switches to another category from the header, and opens a card's details from the footer, all without leaving Browse (demo 3).
- **SC-002**: On iOS and Android, an edge back-swipe started on any Browse screen leaves Browse in 10 out of 10 tries.
- **SC-003**: A member who hasn't seen the screen changes both card and category within 60 seconds, with no explanation (demo 4).
- **SC-004**: A performance trace of swiping through 20 image cards on a mid-range Android phone shows no main-thread task over 50 ms (demo 5).
- **SC-005**: Every Browse action can be done with taps only and with a keyboard only (automated check).
- **SC-006**: The app's initial download stays at or under 150 KB gzip.

## Assumptions

- Browse opens from a header button in the deck view only. A "browse from here" long-press on a list card is not part of this feature (open question Q5 in the roadmap plan).
- Favorites and Archived are not Browse categories. The header cycles through All and the visible categories in chip-row order. Archived cards stay in the read-only Archived list ([`006-card-lifecycle`](../006-card-lifecycle/spec.md)).
- The Source pane shows only what a card already stores (source kind, source link, times). Full edit history waits for the item-events log (roadmap Phase 8).
- Browse reuses the list's cached data, so it needs no new server endpoints.
- Deck-relative links come from the helper introduced in `006-card-lifecycle`. The details component is shared from `007-card-editor`.
- A mid-range Android phone is available for the performance trace. iOS Safari is tested on a current iPhone.
