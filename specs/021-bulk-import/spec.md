# Feature Specification: Bulk import of notes

**Feature Branch**: `021-bulk-import`

**Created**: 2026-10-23

**Status**: Draft

**Input**: User description: "Phase 8, part 6: a deck admin pastes or uploads existing notes (a list, a markdown file or a spreadsheet export), sees one proposed card per note, and publishes them in one review sitting. Completes PLAN.md Phase 8 demo 6 (40 lines of existing notes become 40 proposed cards, reviewed and published in one sitting). Uses the same direct-proposal path as MCP."

Roadmap: `PLAN.md` § Phase 8 (demo 6). Builds on Phase 5 ingestion (review queue, dedup, `proposeDirect`, per-channel caps; D92–D111, P5.9) and [`020-item-events`](../020-item-events/spec.md) (imports are logged with `via: ingest`).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Turn existing notes into proposed cards (Priority: P1)

A community admin has kept useful numbers and tips in a phone note for years: 40 lines, some with links, grouped under a few headings. They open the deck's Import screen, paste the note, and see a preview: 40 cards, each with a title, body, link if one was in the line, and a category from the heading above it. They untick two lines that are obsolete and import. The review queue now holds 38 proposals labelled "Imported".

**Why this priority**: PLAN.md demo 6. A community deck starts from notes people already have; typing them one by one is the main barrier to launch.

**Independent Test**: paste 40 lines; the preview shows 40 cards; import; the review queue gains 40 proposals.

**Acceptance Scenarios**:

1. **Given** plain text, **When** it is pasted, **Then** each non-empty line becomes one card; a line with a web address becomes a link card; long lines are split into a short title and a body.
2. **Given** markdown, **When** it is pasted or uploaded, **Then** each list item or paragraph becomes one card and the nearest heading above it becomes its category.
3. **Given** a CSV file with a header row (title, body, category, url), **When** it is uploaded, **Then** each row becomes one card with those fields.
4. **Given** the preview, **When** the admin unticks rows or edits a title, **Then** only ticked rows are imported, with the edits.
5. **Given** a category name that doesn't exist in the deck, **When** the card is proposed, **Then** it carries a new-category suggestion, as shared cards do today.
6. **Given** a row that already exists as a card (same link or near-identical title), **When** it is proposed, **Then** it is flagged as a possible duplicate in review.
7. **Given** a row that breaks card limits (too long), **When** previewed, **Then** it's marked invalid with the reason and can't be imported until edited.
8. **Given** more rows than the per-import limit, **When** previewed, **Then** the admin is told to split the file.

---

### User Story 2 - Publish many proposals in one sitting (Priority: P1)

In the review queue the admin filters to "Imported", skims the cards, selects all, and publishes. Cards flagged as possible duplicates are left in the queue for a one-by-one decision.

**Why this priority**: demo 6 says "reviewed and published in one sitting". Publishing 40 cards one tap and one screen at a time is the second barrier.

**Independent Test**: with 40 imported proposals, select all and publish; 40 cards are published (or fewer, with skipped duplicates listed).

**Acceptance Scenarios**:

1. **Given** the review queue, **When** the admin enters select mode, **Then** they can tick proposals or "select all shown".
2. **Given** selected proposals, **When** they publish, **Then** each is published as proposed and leaves the queue.
3. **Given** a selected proposal flagged as a possible duplicate or update, **When** they publish, **Then** it is skipped and stays in the queue with "needs a decision".
4. **Given** a proposal another admin already handled, **When** the batch runs, **Then** it is skipped without failing the rest.
5. **Given** the queue, **When** the admin filters by source, **Then** they see only the proposals from that import.

---

### User Story 3 - Import from the command line (Priority: P3)

The owner runs one command with a file and a deck to import a large note archive in chunks.

**Why this priority**: useful for the first big load; the screen covers demo 6.

**Independent Test**: run the command with a 40-line file; 40 proposals appear.

**Acceptance Scenarios**:

1. **Given** a file and a deck, **When** the command runs, **Then** it parses with the same rules as the screen, sends rows in chunks within the limit, and prints imported, duplicate and failed counts.
2. **Given** `--dry-run`, **When** it runs, **Then** it prints the parsed cards and imports nothing.

### Edge Cases

- Empty lines, separators (`---`) and lines with only punctuation are skipped.
- A line with only a web address becomes a link card titled by the address; the link preview fills it in later as for shared links.
- Right-to-left and mixed-script lines keep their text as is.
- A heading with no items under it creates nothing.
- The daily import limit is reached mid-import: rows already proposed stay; the rest are reported as not imported.
- Only owners and maintainers can import (they are the ones who review); editors share cards one at a time as today.
- No AI extraction runs: an import costs nothing in AI calls and works without an AI key. Dedup by meaning runs only when an embedding key is set (as today).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Admins MUST be able to import plain text, markdown and CSV into a deck as proposed cards.
- **FR-002**: The app MUST show a preview of the parsed cards, allow unticking and editing, and mark invalid rows before anything is imported.
- **FR-003**: Each imported row MUST become one proposal through the same path as other direct proposals (category resolution, duplicate check, review queue), labelled as imported.
- **FR-004**: An import MUST be limited in rows per request and per day, and MUST report imported, duplicate and failed rows.
- **FR-005**: Only owners and maintainers MUST be able to import.
- **FR-006**: Admins MUST be able to publish up to a batch limit of selected proposals in one action; proposals needing a duplicate/update decision MUST be skipped and reported.
- **FR-007**: The same parsing rules MUST apply in the app and the command-line tool.
- **FR-008**: Import MUST NOT call an AI model.

### Key Entities

- **Import row**: title, body, optional link, optional category name, line number, validity.
- **Import**: a labelled batch of rows submitted together (label = file name or "Pasted notes").
- **Bulk publish**: a set of proposal ids published together, with per-id results.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 40 lines of existing notes become 40 proposed cards and are reviewed and published in one sitting of under ten minutes (PLAN.md Phase 8 demo 6).
- **SC-002**: Importing 100 rows (one request) completes in under 15 seconds.
- **SC-003**: Parsing rules are covered by unit tests on fixtures for each format, including Hebrew text.
- **SC-004**: An import makes zero AI model calls.

## Assumptions

- Image import (photos in notes) is out of scope; image cards are added one by one.
- An import doesn't create categories directly; new names arrive as suggestions decided in review (Phase 5 rule).
- Undo of a whole import = discard from review (bulk discard can follow the same pattern later).
