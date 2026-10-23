# Feature Specification: Deck activity log

**Feature Branch**: `020-item-events`

**Created**: 2026-10-23

**Status**: Draft

**Input**: User description: "Phase 8, part 5: every change to a card is recorded — who did it, what, when and through which client — and a deck's admins can read the log. Completes PLAN.md Phase 8 demo 5 (a second admin, invited as owner, publishes a card; the log shows both admins' actions). Records `via` so Phase 13's MCP actions show up in the same log."

Roadmap: `PLAN.md` § Phase 8 (demo 5, with [`019-deck-admin`](../019-deck-admin/spec.md) for the co-owner invite). Builds on the item lifecycle (Phase 6: archive, restore, delete, undo), review (Phase 5: publish, discard, merge) and the `Actor` with `via` (D130, ADR-050).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Admins see who changed what (Priority: P1)

Two admins run a community deck. One evening a card's phone number is wrong. The owner opens the deck's activity log and sees that the co-owner published that card yesterday from an editor's proposal, and that an editor changed the phone number this morning. Each line shows the person, the action, the card title, when, and whether it came from the app or a share/import.

**Why this priority**: PLAN.md demo 5. With several admins, a deck needs accountability: what changed and who did it.

**Independent Test**: as the co-owner publish a proposal; as the owner archive a card. The log lists both lines, newest first, with each admin's name.

**Acceptance Scenarios**:

1. **Given** any card change (created, proposed, published, edited, archived, restored, deleted, undeleted, discarded, merged), **When** it is saved, **Then** one log line records the deck, card, person, action, client kind and time.
2. **Given** an edit, **When** it is logged, **Then** the line names which fields changed (title, body, categories, link, …), not their values.
3. **Given** an owner or maintainer, **When** they open the log, **Then** they see the deck's lines newest first, paginated, and can filter to one card.
4. **Given** an editor or reader, **When** they ask for the log, **Then** they are refused.
5. **Given** a card that was later permanently purged, **When** its lines are shown, **Then** they still show the card's title at the time, without a link.
6. **Given** a person whose account was deleted, **When** their lines are shown, **Then** they read "Former member".

---

### User Story 2 - A card's history (Priority: P2)

On a card's page, an admin taps "History" and sees that card's lines.

**Why this priority**: the most common question is about one card. It reuses the log with a filter.

**Independent Test**: edit a card twice and archive it; its History shows three lines with the right fields.

**Acceptance Scenarios**:

1. **Given** an admin on a card, **When** they open History, **Then** they see only that card's lines.
2. **Given** a non-admin, **When** they view a card, **Then** there is no History entry.

### Edge Cases

- A change that fails (validation, conflict) writes no line.
- A save that changes nothing (same values) writes no line.
- Proposals made by sharing or import record the person who shared, and the client kind `ingest`.
- A merged proposal logs `merged` on the target card and `discarded` is not logged for the proposal (one line per user action).
- Link-check, snapshot and embedding updates are system work, not logged.
- Deleting a deck deletes its log.
- Log lines are never edited or deleted by the app.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Every successful card change made by a person MUST write exactly one log line in the same transaction as the change.
- **FR-002**: A log line MUST record the deck, card (if it still exists), card title at that moment, person (if still existing), action, changed field names for edits, client kind and time.
- **FR-003**: The client kind MUST distinguish the app/API (`session`) from share/import proposals (`ingest`), and MUST be extendable for AI apps (`mcp`, Phase 13).
- **FR-004**: Only owners and maintainers MUST be able to read a deck's log.
- **FR-005**: The log MUST be readable newest first with pagination and an optional card filter.
- **FR-006**: The log MUST NOT record card content values, only field names.
- **FR-007**: The log screen MUST NOT add to the app's start-up bundle.

### Key Entities

- **Log line (item event)**: deck, card, title snapshot, actor, action, changed fields, client kind, time.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A co-owner publishes a card and the owner archives another; the log shows both admins' actions with their names (PLAN.md Phase 8 demo 5).
- **SC-002**: A test proves every card-changing service path writes exactly one line, and a rolled-back change writes none.
- **SC-003**: A page of 50 log lines answers in under 100 ms at current sizes.
- **SC-004**: No log line contains a card's body or payload.

## Assumptions

- Category, deck and member changes are not part of this log; they can join later with their own actions.
- Retention is unlimited for now; Phase 11 (GDPR) handles user deletion by clearing the actor.
- The log is not shown to strangers or in the public pages.
