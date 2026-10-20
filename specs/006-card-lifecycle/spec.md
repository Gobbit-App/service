# Feature Specification: Card lifecycle (archive, restore, delete, undelete)

**Feature Branch**: `006-card-lifecycle`

**Created**: 2026-10-20

**Status**: Draft

**Input**: User description: "Phase 6 (PLAN.md): edit, archive and delete. Archive a card, confirm it disappears from search, restore it. Delete is soft with a 30-day undo. Keep the edit, archive, restore and delete rules (and the undo window) in services, not in the UI, so the MCP tools (Phase 13) reuse them unchanged."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Archive and restore a card (Priority: P1)

A member who can edit a deck (owner, maintainer or editor) archives a card that is out of date. It leaves the deck's lists and search at once, appears under Archived, and can be restored from there. A restored card keeps its original "Added … ago" date.

**Why this priority**: Archiving is the everyday way to tidy a deck without losing anything, and it is PLAN.md Phase 6 demo 2. Restore is the half that is missing today: an archived card can only be brought back by a raw API call that also resets its publish date.

**Independent Test**: As an editor, archive a published card from its card view, search for its title (no hit), open Archived, restore it, search again (hit), and check the card still shows its original age.

**Acceptance Scenarios**:

1. **Given** a published card and a member with edit rights, **When** they choose Archive, **Then** the card disappears from the list they are on without a reload, a toast offers Undo for a few seconds, and the card no longer appears in the deck's lists or search results.
2. **Given** the Undo toast after an archive, **When** the member taps Undo, **Then** the card is restored and reappears in the list in its original position.
3. **Given** an archived card, **When** a member with edit rights opens Archived and chooses Restore, **Then** the card is published again, leaves Archived, shows up in lists and search again, and its publish date is unchanged.
4. **Given** a reader (read-only member), **When** they view a card, **Then** no Archive or Restore action is offered, and a direct API call to archive or restore is refused.
5. **Given** an archived card, **When** a client tries to publish it again through a general card update instead of Restore, **Then** the request is refused with a problem explaining that Restore is the way back.

---

### User Story 2 - Delete with a 30-day undo (Priority: P2)

An owner or maintainer deletes a card that should not exist (a duplicate, a mistake). It disappears everywhere at once. For 30 days it is listed under Archived → Recently deleted with the number of days left, and can be undeleted to exactly where it was. After 30 days it is gone for good.

**Why this priority**: Delete exists today but is final from the user's point of view: nothing lists deleted cards and nothing undoes a delete. The master plan promises a 30-day undo, and the GDPR delete in a later phase needs deleted data to actually go away.

**Independent Test**: As a maintainer, delete a card, find it under Recently deleted with "30 days left", undelete it, and confirm it is back in its category, published, with the same date; as an editor, confirm Delete and Recently deleted are not offered.

**Acceptance Scenarios**:

1. **Given** a published or archived card and an owner or maintainer, **When** they choose Delete and confirm, **Then** the card disappears from all lists and search, and a toast offers Undo.
2. **Given** a card deleted 3 days ago, **When** an owner or maintainer opens Archived, **Then** a Recently deleted section lists it, newest deleted first, with "27 days left".
3. **Given** a deleted card within the window, **When** the owner or maintainer chooses Undelete, **Then** the card returns with the status it had before (published or archived), its categories and its dates.
4. **Given** a card deleted more than 30 days ago, **When** anyone tries to undelete it, **Then** the request is refused as expired, and the card no longer appears under Recently deleted.
5. **Given** a card deleted more than 30 days ago, **When** the weekly cleanup runs, **Then** the card and everything that only belongs to it (category links, favorites, share image) are removed, and records that merely point at it (ingest history, usage logs) keep existing without the link.
6. **Given** an editor or reader, **When** they open Archived, **Then** no Recently deleted section is shown, and a direct API call to list or undelete deleted cards is refused.

---

### User Story 3 - The same rules for every client (Priority: P3)

The rules above (who may archive, restore, delete and undelete; the undo window; what happens to the publish date) apply identically whether the request comes from the web app, a script using the API, or a future AI-app connection. Each action knows who asked and through which kind of client, so the later activity log can record it.

**Why this priority**: It has no visible UI of its own, but the MCP server (Phase 13) and the activity log (Phase 8) depend on it. Doing it now avoids changing every action twice.

**Independent Test**: Run the archive → restore → delete → undelete sequence through the API with a bearer session and get the same results and refusals as through the web app.

**Acceptance Scenarios**:

1. **Given** a script holding a bearer session for an editor, **When** it archives and restores a card, **Then** it gets the same results as the web app, and deleting is refused for the editor role.
2. **Given** any of the four actions on a card already in the target state (archive an archived card, restore a published card), **When** it is repeated, **Then** it succeeds without changing anything (safe to retry).

---

### Edge Cases

- Archiving a **proposal** (a card awaiting review) is refused: proposals leave the queue through Publish or Discard only.
- Restoring or undeleting a card whose categories now include one the member can't see keeps that hidden category on the card (members never strip categories they can't see).
- Proposals removed by Discard, or merged into another card by Publish → update, are deleted too but are **not** listed under Recently deleted and can't be undeleted; the review queue owns them. The weekly cleanup still removes them after 30 days.
- Undeleting when the card's link was also re-added as a new card leaves two cards; nothing merges them automatically (dedup is an ingestion concern).
- Undo after the toast has gone: Archived → Restore (archive) and Recently deleted → Undelete (delete) remain available.
- Offline: the actions need the network. They are disabled with an "offline" hint rather than queued.
- A deleted card's permalink (`/i/<id>`) shows "Card unavailable", as any missing card does.
- The cleanup job missing a week (worker down) only delays removal; the next run removes everything past 30 days.
- The day count uses whole days remaining, rounded down, never below 0.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Members with the edit-rights roles (owner, maintainer, editor) MUST be able to archive a published card; readers MUST NOT.
- **FR-002**: Archived cards MUST NOT appear in the deck's card lists or in search or Ask results; they MUST appear in the deck's Archived view.
- **FR-003**: Members with edit rights MUST be able to restore an archived card to published through a dedicated restore action.
- **FR-004**: Restoring MUST keep the card's original publish date; only the first publication of a card sets it.
- **FR-005**: The general card update MUST refuse to move an archived card back to published, with a problem that points to restore.
- **FR-006**: Archiving a proposal MUST be refused; publishing and discarding proposals stay with the review queue.
- **FR-007**: Owners and maintainers MUST be able to delete a card; editors and readers MUST NOT. Deletion MUST hide the card everywhere at once.
- **FR-008**: Owners and maintainers MUST be able to list a deck's deleted cards (excluding removed proposals), newest deleted first, with the deletion time.
- **FR-009**: Owners and maintainers MUST be able to undelete a card within 30 days of deletion; it MUST return with its previous status, categories, dates and favorites.
- **FR-010**: Undeleting after 30 days MUST be refused as expired.
- **FR-011**: The system MUST permanently remove cards deleted more than 30 days ago, at least weekly, removing data that belongs only to the card and unlinking records that refer to it.
- **FR-012**: Repeating an action whose end state already holds MUST succeed without changes (archive, restore, undelete).
- **FR-013**: Every lifecycle action MUST apply the same permission and transition rules regardless of client (web app, API script, future AI-app connection), and MUST know which kind of client asked.
- **FR-014**: The web app MUST show Archive, Restore, Delete and Undelete only to roles allowed to use them, update visible lists immediately, and offer Undo for a few seconds after archive and delete.
- **FR-015**: The Archived view MUST offer Restore on each archived card and, for owners and maintainers, a Recently deleted section with Undelete and the days left.
- **FR-016**: Lifecycle actions MUST be disabled while offline, with a visible reason.
- **FR-017**: Links to deck screens added or touched by this feature MUST be built in one place, so a later change to deck addresses (custom domains, Phase 12) is a single edit.

### Key Entities

- **Card (item)**: has a status (proposed, published, archived), a publish date (set on first publication only) and an optional deletion time. A deletion time means "deleted"; the status is kept so undelete can return it.
- **Deleted card listing**: the deck's deleted, non-proposal cards with their deletion time and the days left in the undo window.
- **Actor**: who performs a lifecycle action (the member) and through which kind of client (a session from the web or a script today; an AI-app connection later).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An archived card is absent from search for the next query (no stale hit), and present again after restore, in 100% of runs of the demo.
- **SC-002**: A restored or undeleted card shows the same "Added … ago" date it had before, in 100% of cases.
- **SC-003**: A member can archive a card and undo it within 2 taps and under 5 seconds.
- **SC-004**: Every card deleted within the last 30 days can be undeleted; no card deleted more than 37 days ago (30 days + one weekly run) still exists.
- **SC-005**: Every role/action combination (4 roles × 4 actions) behaves as specified for both web and API clients, with no client-specific exceptions.
- **SC-006**: The web app's initial download stays within its existing size budget.

## Assumptions

- Editors keep creating published cards directly; whether their new cards should go to review is a separate question (out of scope here).
- "Owner" includes co-owners; delete follows the existing permission matrix (owner and maintainer), relaxing the master plan's "owner-only".
- The undo window is 30 days, the same for every deck; it is not configurable per deck.
- Image files of permanently removed image cards stay in media storage until the orphan cleanup of Phase 7 exists.
- An activity log of who did what (Phase 8) is not part of this feature; this feature only makes the "who and via what" available to it.
- Editing card content (the full editor) is `specs/007-card-editor`; the Edit action is added there. Browse mode (`specs/009-browse-mode`) reuses the actions defined here.
- There is no bulk archive or bulk delete.
