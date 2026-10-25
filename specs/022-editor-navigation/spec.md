# Feature Specification: Editor navigation and unsaved-work guard

**Feature Branch**: `022-editor-navigation`

**Created**: 2026-10-25

**Status**: Draft

**Input**: User description: "In the card editor and app header, navigation must never strand or lose work. The header back control is contextual; the deck list shows none. The editor gets an explicit Cancel. Leaving the editor with unsaved changes asks for confirmation; the draft autosave is flushed first. Same guard for the review queue's inline edit. Source: docs/usability-backlog.md items 4, 5, 8."

Roadmap: `PLAN.md` § Usability pass. Builds on [`007-card-editor`](../007-card-editor/spec.md) (editor, IndexedDB drafts, D135 edit route outside the deck layout, D145 drafts) and [`021-bulk-import`](../021-bulk-import/spec.md) (review queue inline edit).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Back goes one level up, never somewhere surprising (Priority: P1)

A member opens a card from their deck, taps Edit, then taps the header back control. They land on the card they were editing, still inside the deck. On the deck list (home) there is no back control at all, because there is nowhere further up to go.

**Why this priority**: today the header back control always goes to the deck list. From the editor that throws the member out of the deck; on the deck list it links to the page already showing and does nothing. Both feel broken.

**Independent Test**: from each screen in the table below, tap the header back control and check where you land; on the deck list check there is no back control.

| Screen | Back goes to |
|--------|--------------|
| Edit card (opened from the card page or a list) | That card's page |
| Edit card (opened from the review queue) | The deck's review queue |
| New card | The deck |
| Card page | The deck the card belongs to |
| Deck screens (list, browse, review, archived, links, settings, log, import) | The deck list |
| Deck list (home) | No back control |
| Settings, share | The deck list |

**Acceptance Scenarios**:

1. **Given** a member editing a card they opened from its card page, **When** they tap back, **Then** they see that card's page (after the unsaved-work check in Story 3).
2. **Given** a publisher editing a proposed card opened from the review queue, **When** they tap back, **Then** they return to that deck's review queue.
3. **Given** a member creating a new card in a deck, **When** they tap back, **Then** they return to that deck.
4. **Given** a member on a card page, **When** they tap back, **Then** they see the card's deck.
5. **Given** a member on the deck list, **When** the page renders, **Then** no back control is shown and the header title stays in place.
6. **Given** a card opened from a shared link with no history in the app, **When** the member taps back, **Then** they still land on the card's deck (the target never depends on browser history).

---

### User Story 2 - Cancel an edit on purpose (Priority: P1)

A member starts editing a card, changes their mind and taps Cancel next to Save. They are taken back to where they came from (the same target as the header back control) and the card is unchanged.

**Why this priority**: the editor has only "Save card"; the only way out is the header, which today goes to the wrong place.

**Independent Test**: open the editor, change nothing, tap Cancel: you are back on the card with no prompt. Change the title, tap Cancel, confirm discard: the card still has its old title and no draft is offered next time.

**Acceptance Scenarios**:

1. **Given** an editor with no changes, **When** the member taps Cancel, **Then** they leave at once to the back target.
2. **Given** an editor with changes, **When** the member taps Cancel, **Then** they are asked to confirm (Story 3); on "Discard" they leave, the card is unchanged and the saved draft for it is removed.
3. **Given** the review queue's inline edit form, **When** the publisher taps Cancel, **Then** the form closes with the same rules (no prompt when unchanged, confirm when changed).

---

### User Story 3 - Never lose work by accident (Priority: P1)

A member has typed a long note into a card and taps a link in the header, presses the phone's back gesture, or closes the tab. The app asks "Discard changes?" with "Keep editing" (default) and "Discard". If the member chose to leave anyway, or the browser closed the tab without asking, the work is still offered as a draft the next time they open that editor.

**Why this priority**: losing typed text is the most damaging thing an editor can do. Drafts exist (D145) but nothing warns before leaving, and the last half second of typing may not be saved.

**Independent Test**: type into the editor, then in turn: tap the header back, tap another in-app link, use browser back, reload. Each time the confirmation appears; "Keep editing" leaves the text intact. After reloading anyway, reopening the editor offers the draft with the latest text.

**Acceptance Scenarios**:

1. **Given** an editor with unsaved changes, **When** the member navigates anywhere inside the app (header back, Cancel, any link, browser or gesture back), **Then** an in-app confirmation asks "Discard changes?" with "Keep editing" focused by default.
2. **Given** that confirmation, **When** the member picks "Keep editing", **Then** they stay in the editor with every change intact and the address unchanged.
3. **Given** that confirmation, **When** the member picks "Discard", **Then** navigation continues, and the draft is removed.
4. **Given** an editor with unsaved changes, **When** the member reloads or closes the tab or window, **Then** the browser's own "leave site?" prompt is shown.
5. **Given** an editor with unsaved changes, **When** the page is hidden or closed without a prompt (e.g. the phone OS kills it), **Then** the latest changes are already in the draft and are offered the next time that editor opens.
6. **Given** an editor whose changes were just saved, **When** the app navigates to the saved card, **Then** no confirmation appears.
7. **Given** an editor with no changes, or whose changes were all undone back to the original, **When** the member leaves, **Then** no confirmation appears.
8. **Given** a save in progress, **When** the member tries to leave, **Then** the confirmation appears (leaving now may lose the save's outcome).

### Edge Cases

- Signing out from the editor with unsaved changes: the confirmation appears first; on "Discard" sign-out proceeds and drafts are cleared as today (D145).
- A save fails (validation or network): the editor stays dirty, so leaving still asks.
- Offline editing: the guard works the same; the draft is local, so it survives.
- The draft restore banner is still unanswered: the editor counts as unchanged until the member restores or dismisses it (nothing to lose yet).
- Two tabs edit the same card: each tab guards its own changes; drafts behave as today.
- The browser blocks custom text in the tab-close prompt: the browser's generic wording is acceptable.
- Back from a card whose deck the member can no longer see: they land on the deck screen's existing "unavailable" state, not a blank page.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The header MUST show a back control on every screen except the deck list, and its target MUST follow the table in Story 1.
- **FR-002**: The back target MUST be derived from the screen and its data (card → its deck, edit → its card or review queue), never from browser history, so it works for deep links.
- **FR-003**: The edit screen MUST know whether it was opened from the review queue and send back there; otherwise to the card page.
- **FR-004**: The card editor MUST offer Cancel next to Save; Cancel follows the same target and guard as the header back control.
- **FR-005**: The editor MUST treat itself as having unsaved changes when the current content differs from what it opened with, or while a save is in progress.
- **FR-006**: With unsaved changes, every in-app navigation away from the editor MUST be held until the member confirms in an in-app dialog with "Keep editing" (default focus, and the result of Escape) and "Discard".
- **FR-007**: With unsaved changes, reloading or closing the page MUST trigger the browser's leave-page prompt.
- **FR-008**: The editor MUST write its current content to the draft store immediately when the page is hidden or the member starts leaving, not only after the typing pause.
- **FR-009**: "Discard" MUST remove that editor's draft; a successful save MUST also remove it (as today).
- **FR-010**: Navigation triggered by a successful save MUST NOT be held.
- **FR-011**: The review queue's inline edit form MUST apply FR-004 to FR-010 to its own changes.
- **FR-012**: The confirmation dialog MUST be keyboard and screen-reader accessible (focus trapped while open, labelled, returns focus on "Keep editing").

### Key Entities

- **Back target**: per screen, the place one level up; a pure function of the route and the loaded card/deck.
- **Unsaved-changes state**: per open editor; content differs from the opening snapshot, or a save is pending.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: From every screen in Story 1's table, one tap on back lands on the listed target (100 % of screens covered by tests).
- **SC-002**: In testing, no path out of the editor (back, Cancel, link, browser back, reload, close) loses typed text without either a confirmation or a recoverable draft.
- **SC-003**: Leaving an unchanged editor never shows a confirmation.
- **SC-004**: The deck list has no control that does nothing when tapped.

## Assumptions

- The draft store, its keys and the restore banner from 007 stay as they are; this feature only adds the flush on leave and the clear on discard.
- "Opened from the review queue" is carried in the edit address (as the post-save redirect already does), so it survives a reload.
- The browser's tab-close prompt cannot show custom text; that is acceptable.
- Icons and visual styling of the back and Cancel controls come from [`024-card-actions`](../024-card-actions/spec.md); this feature uses the current styles.
- Auto-saving every field with undo/redo is out of scope (later feature); [`023-editor-inputs`](../023-editor-inputs/spec.md) saves category changes instantly, which this guard must not count as unsaved.
