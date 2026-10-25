# Feature Specification: Card actions and icon buttons

**Feature Branch**: `024-card-actions`

**Created**: 2026-10-25

**Status**: Draft

**Input**: User description: "Edit and the other card actions belong inside the card, styled like a modern, professional app — today they sit below it and look basic and unstyled. All buttons use high-end flat icons instead of text labels (hand-picked inline SVGs, no icon library). The delete button is just a pink block. Remove the arrows in browse mode. Source: docs/usability-backlog.md items 3, 7, 9, 10."

Roadmap: `PLAN.md` § Usability pass. Touches the card view from Phase 3, the card actions from [`006-card-lifecycle`](../006-card-lifecycle/spec.md), browse mode from [`009-browse-mode`](../009-browse-mode/spec.md) and the review card from [`021-bulk-import`](../021-bulk-import/spec.md).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Actions live inside the card (Priority: P1)

A member scrolling a deck sees each card as one self-contained panel: content on top, a quiet action bar along the card's bottom edge with icons for Edit, Favorite, Share and a "more" menu (History, Archive, Delete). The actions clearly belong to that card, never to the one below. On the card page the same bar appears inside the card; in browse mode the card shows Edit too; in the review queue the bar holds Publish, Edit and Reject.

**Why this priority**: today Edit, Archive, Delete and History are a row of plain text buttons below the card. In a list they read as belonging to the next card, and the screen looks unfinished.

**Independent Test**: on a phone, open a deck list, the card page, browse mode and the review queue. In each, every card's actions sit inside its border, use icons, and do what they did before.

**Acceptance Scenarios**:

1. **Given** a deck list, **When** it renders, **Then** each card shows its actions inside the card's border, in a bar separated from the content, and nothing action-like sits between cards.
2. **Given** a member who can edit, **When** they look at a card, **Then** Edit is a visible icon in the card's bar; members who can't edit don't see it.
3. **Given** rarely used or destructive actions (History, Archive, Delete), **When** the member opens the card's "more" menu, **Then** they are listed with icon and label; Delete is visually marked as destructive and still asks for confirmation (006).
4. **Given** browse mode, **When** a member who can edit views a card, **Then** Edit is available inside the card and opens the editor.
5. **Given** the review queue, **When** a publisher views a proposed card, **Then** Publish, Edit and Reject are in the card's bar with the same look.
6. **Given** archived and links lists, **When** they render, **Then** their card actions (Restore, Delete, link check) follow the same bar.

---

### User Story 2 - Icons instead of text labels (Priority: P1)

Every action button in the app shows a consistent, flat line icon instead of a word: back, close, edit, favorite, share, more, delete, archive, restore, history, settings, search, add, copy, upload/replace photo, publish, reject. Each still has a name for screen readers and a tooltip on hover or long-press.

**Why this priority**: mixed Unicode glyphs (◂ ⚙ ✕ ⤴) and text buttons make the app look basic; a single icon set makes it look deliberate.

**Independent Test**: walk every screen; every action button shows an icon from the set, no Unicode glyph icons remain, and every icon-only button has an accessible name (automated accessibility check passes).

**Acceptance Scenarios**:

1. **Given** any screen, **When** it renders, **Then** action buttons show icons from one set with the same stroke weight, size grid and colour rules, in light and dark themes.
2. **Given** an icon-only button, **When** a screen reader focuses it, **Then** it announces the action name; **When** a pointer hovers or a finger long-presses it, **Then** a tooltip names it.
3. **Given** a button whose meaning depends on its wording — the form's primary submit (Save card, Publish all, Send invite), and choices in confirmation dialogs (Discard / Keep editing, Delete / Cancel) — **When** it renders, **Then** it shows the icon and the label together.
4. **Given** a toggle (Favorite), **When** its state changes, **Then** the icon changes between outline and filled and the accessible name/state follows.
5. **Given** keyboard use, **When** a button gets focus, **Then** a visible focus ring shows.
6. **Given** a touch screen, **When** the member taps an icon button, **Then** its hit area is at least 44 × 44 px even if the icon is smaller.

---

### User Story 3 - A delete button that looks like one (Priority: P2)

Destructive buttons (Delete card, Remove member, Revoke token) look clearly destructive and readable: in light and dark themes the icon and label have strong contrast against their background.

**Why this priority**: today two conflicting style rules turn the delete button into a pink block with an unreadable label.

**Independent Test**: view each destructive button in light and dark themes; the label/icon contrast is at least 4.5:1.

**Acceptance Scenarios**:

1. **Given** any destructive button, **When** it renders in either theme, **Then** its content is readable (contrast ≥ 4.5:1) and it uses one consistent destructive style across the app.
2. **Given** the editor has been opened earlier in the session, **When** the member returns to other screens, **Then** buttons look the same as before (no style leaking from the editor).

---

### User Story 4 - Browse mode without the arrow buttons (Priority: P2)

In browse mode, the member moves between cards and categories by swiping, with keys on a keyboard, or with the category menu. The arrow buttons in the header and footer are gone, leaving a clean card view.

**Why this priority**: the arrows clutter the screen and look poor; swiping and the category menu already cover the same moves.

**Independent Test**: open browse mode on a phone: no arrow buttons; swiping still moves between cards, categories and views. On a desktop, the arrow keys still work and the category menu changes category.

**Acceptance Scenarios**:

1. **Given** browse mode, **When** it renders, **Then** no previous/next card, category or view arrow buttons are shown.
2. **Given** touch, **When** the member swipes, **Then** card, category and view changes work as in 009.
3. **Given** a keyboard, **When** the member uses the arrow keys, **Then** they move as in 009.
4. **Given** a screen-reader or switch user, **When** they use browse mode, **Then** they can still change card and category through the category menu and a card position control ("3 of 12") that offers previous/next as menu or adjustable actions, without visible arrow buttons.
5. **Given** browse mode, **When** the member wants to leave, **Then** a close icon remains in the header.

### Edge Cases

- Long-press tooltips must not trigger the card's own long-press or swipe gestures in browse mode.
- A card with many actions on a narrow phone (320 px): the bar keeps 3–4 visible icons and moves the rest into "more".
- Offline: actions that need the network are disabled with their icon dimmed and a tooltip explaining why (existing offline rules).
- Right-to-left text in card content does not flip action icons; directional icons (back) follow the interface direction.
- High-contrast / forced-colours mode: icons stay visible (they use the current text colour).
- The public HTML pages (017) are out of scope; they have no actions.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Each card (lists, card page, browse, review queue, archived, links) MUST render its actions inside the card's container in one action bar.
- **FR-002**: The action bar MUST show the most-used actions as icons (Edit, Favorite, Share; Publish/Edit/Reject in review) and put the rest in a "more" menu.
- **FR-003**: The app MUST use a single icon set of hand-drawn inline SVGs with one stroke weight and grid; no third-party icon library and no Unicode glyph icons.
- **FR-004**: Every icon-only button MUST have an accessible name and a tooltip; toggles MUST expose their pressed state.
- **FR-005**: Form primary submits and confirmation-dialog choices MUST show icon and label together.
- **FR-006**: Icon buttons MUST have a touch target of at least 44 × 44 px and a visible focus indicator.
- **FR-007**: Destructive buttons MUST share one style with contrast ≥ 4.5:1 in both themes.
- **FR-008**: Styles from lazily loaded screens (e.g. the editor) MUST NOT change buttons elsewhere.
- **FR-009**: Browse mode MUST NOT show arrow buttons; swipe, keyboard and an accessible alternative for card and category moves MUST remain.
- **FR-010**: The initial app download MUST stay within the existing size budget.

### Key Entities

- **Icon**: a named glyph from the set (e.g. `edit`, `trash`, `more`), drawn on one grid.
- **Card action**: a named action with icon, label, permission rule and placement (bar or menu).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100 % of card actions on the listed screens sit inside their card.
- **SC-002**: 0 Unicode glyph icons and 0 text-only action buttons remain outside the FR-005 exceptions.
- **SC-003**: An automated accessibility check finds no unnamed buttons and no contrast failures on buttons, in both themes.
- **SC-004**: In a hallway test, a new member identifies Edit, Delete and Share from icons alone on the first try.
- **SC-005**: The initial download grows by no more than 6 KB compressed.

## Assumptions

- Icons are drawn for this project (24 px grid, 1.75 px stroke, rounded caps), about 25 to start; new icons follow the same rules.
- "Inside the card" applies to app screens; public pages are unchanged.
- The text wording of labels used in tooltips and menus follows `025` ([`PLAN.md`](../../PLAN.md) § Usability pass) terminology (deck, not pocketbook).
- Back and Cancel controls from [`022-editor-navigation`](../022-editor-navigation/spec.md) and the Undo notice from [`023-editor-inputs`](../023-editor-inputs/spec.md) adopt these icons once both are merged.
