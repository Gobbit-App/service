# Feature Specification: Checklist cards

**Feature Branch**: `042-checklists`

**Created**: 2026-11-08

**Status**: Draft

**Input**: User description: "A new item type: checklist/todo-list — an item with a list of sub-items that can be checked off. Similar permission structure to reminders: read is anyone in the deck; who can check off items is controlled at the item level. Sub-items can be assigned to any user who can access the deck — that doesn't mean they can check it, just that they're responsible for it. This item type won't be available to a communal deck."

Builds on the card editor ([`007-card-editor`](../007-card-editor/spec.md)), card lifecycle ([`006-card-lifecycle`](../006-card-lifecycle/spec.md)), the activity log ([`020-item-events`](../020-item-events/spec.md)) and reminders ([`037-reminders`](../037-reminders/spec.md)), whose "who can dismiss" rule and notification area (pending list and alert light) this feature reuses.

## Clarifications

### Session 2026-11-08

- Q: Which decks can't have checklists: communal decks, or any public deck? → A: Communal decks (deck kind "communal"). Shared decks that are public keep checklists, but anonymous visitors never see them.
- Q: Can readers be allowed to check entries? → A: Yes. Checking is a separate right from editing the list: people allowed to check may be readers, and adding, removing, reordering or rewording entries stays with members who can edit cards.
- Q: What happens when the last entry is checked? → A: The creator decides with a toggle, "Archive when everything is checked": off (default) does nothing, on archives the card.
- Q: Are assignees notified by email or push? → A: No notifications in this feature. Assigned entries show only in the in-app notification area.

### Session 2026-11-09

- Q: Is anyone told when a checklist archives itself? → A: Yes, its creator. When "Archive when everything is checked" archives the card, the creator gets one email and one push (on the devices they turned on), unless they made the last check themselves. Assignment still sends nothing.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Create a checklist and check entries off (Priority: P1)

A family member with write access to a shared deck creates a Checklist card: a title ("Pack for the beach"), an optional short body, and a list of entries ("Sunscreen", "Towels", "Snacks"). Anyone in the deck who can see the card reads it with each entry's state. The creator, who by default is the only one allowed to check, ticks "Sunscreen" off; the card now shows 1 of 3 done, and the entry shows who checked it and when.

**Why this priority**: the card type and the act of checking are the feature; everything else refines who may do what.

**Independent Test**: as an editor, create a checklist with three entries; check one, uncheck it, check it again. As a reader in the same deck, open the card and see the entries and their state but no way to change them. The card's own edit history and "updated" time don't change when entries are checked.

**Acceptance Scenarios**:

1. **Given** an editor in the new-card editor of a shared or personal deck, **When** they choose the Checklist type, **Then** they see the text-note fields plus an entry list where they can add, remove, reword and reorder entries, a "who can check" choice (default: only me) and an "Archive when everything is checked" toggle (default: off).
2. **Given** a published checklist, **When** any member who can read the deck and the card's category opens it, **Then** they see every entry in order, which are checked, by whom and when, and a progress summary ("2 of 5 done").
3. **Given** a member allowed to check, **When** they tap an unchecked entry, **Then** it shows as checked immediately; tapping it again unchecks it.
4. **Given** a check that the server refuses or that fails (for example, the connection dropped), **When** the answer comes back, **Then** the entry returns to its previous state and the member sees a short message.
5. **Given** a member not allowed to check, **When** they view the checklist, **Then** they see the entries and their state without any way to change them, and the server refuses a check request from them.
6. **Given** a checklist with no entries, more entries than the limit, or an entry with empty text or text over the limit, **When** the creator saves, **Then** the save is refused with a message on the offending entry or list.
7. **Given** an editor rewording, reordering or adding entries while someone else checks one, **When** both changes are saved, **Then** both survive: the checked entry stays checked under its new wording or position.
8. **Given** an editor removes an entry that was checked, **When** they save, **Then** the entry and its checked state are gone and the progress summary updates.

---

### User Story 2 - Choose who can check, separately from who can edit (Priority: P1)

The creator decides who may check entries off: only themselves (default), everyone who can edit cards in the deck, everyone who can read the card (readers included), or specific people picked from the deck's members, readers included. Editing the list itself (adding, removing, reordering, rewording, assigning) stays with members who can edit cards, whatever the rule says.

**Why this priority**: a family chore list needs the kids (often readers) to tick things off without being able to rewrite the list; without this rule the feature only serves the creator.

**Independent Test**: create four checklists, one per rule, in a deck with an owner, an editor and a reader. For each, verify who can check and uncheck, and that the reader can never edit the entries, even when allowed to check.

**Acceptance Scenarios**:

1. **Given** "only me", **When** another member tries to check an entry, **Then** they can't; only the creator can.
2. **Given** "everyone who can edit", **When** the owner, a maintainer or an editor who can see the card checks an entry, **Then** it's checked; a reader can't.
3. **Given** "everyone who can read it", **When** any member who can see the card, readers included, checks an entry, **Then** it's checked.
4. **Given** "specific people", **When** the creator picks members, **Then** every deck member who can see the card is offered (readers included), and only the picked people plus the creator can check.
5. **Given** an editor who isn't covered by the rule, **When** they open the card, **Then** they can edit the entries but can't check them.
6. **Given** a member other than the creator edits the checklist, **When** they look at "who can check" and the archive toggle, **Then** both are read-only for them; only the creator (and the deck's owners once the creator has left) can change them.
7. **Given** a picked person leaves the deck or can no longer see the card's category, **When** they try to check, **Then** they can't; if nobody covered by the rule remains, the deck's owners can check.

---

### User Story 3 - Assign entries to people (Priority: P2)

While editing, a writer assigns an entry to a deck member ("Snacks → Noa"). Assignment says who is responsible; it doesn't by itself let that person check the entry. Everyone reading the card sees who each entry is assigned to.

**Why this priority**: assignment turns a shared list into a division of work, but a checklist is useful without it.

**Independent Test**: assign one entry to a reader in a checklist whose rule is "only me", and one to an editor covered by "everyone who can edit". Both see their names on their entries; the editor can check theirs, the reader can't, and the editor showed a warning when the reader was assigned.

**Acceptance Scenarios**:

1. **Given** an editor editing a checklist, **When** they assign an entry, **Then** they can pick any member of the deck who can see the card, any role, or leave it unassigned.
2. **Given** the picked member isn't allowed to check under the card's current rule, **When** the editor assigns them, **Then** the editor shows a non-blocking warning that this person is responsible but can't check the entry off.
3. **Given** an assignment to someone who isn't a member who can see the card, **When** the editor saves, **Then** the save is refused with a message on that entry.
4. **Given** an assignee leaves the deck or can no longer see the card's category, **When** anyone views the checklist, **Then** that entry shows as unassigned.
5. **Given** a personal deck, **When** its owner edits a checklist, **Then** there is no assignment choice and no "who can check" choice; only the owner checks.

---

### User Story 4 - Archive automatically when everything is checked (Priority: P2)

For one-off lists ("Move-in tasks"), the creator turns on "Archive when everything is checked". When the last open entry is checked, the card moves to Archived, recorded as completed, and the creator is told by email and push, so a list finished by others doesn't silently vanish from the deck. For lists that get reused (a shopping list), they leave it off and the card stays in the deck.

**Why this priority**: tidies finished lists away, but manual archive already covers it.

**Independent Test**: with the toggle on, have another member check the last open entry: the card is in Archived, its activity log shows it completed, and the creator receives one email and one push linking to the archived card. With the toggle off, check every entry: the card stays in the active list and nothing is sent.

**Acceptance Scenarios**:

1. **Given** the toggle is on, **When** a member checks the last unchecked entry, **Then** the card moves to Archived in the same step, and the activity log records it as completed by that member.
2. **Given** the toggle is off, **When** every entry is checked, **Then** nothing else happens; the card shows "all done" and stays in the active list.
3. **Given** an archived checklist, **When** someone tries to check or uncheck an entry, **Then** it's refused until the card is restored; restoring keeps every entry's state.
4. **Given** a restored checklist with every entry checked and the toggle on, **When** it's restored, **Then** it stays active; it is archived again only after a further entry is unchecked and checked again, or a new entry is added and checked.
5. **Given** the toggle is on and someone other than the creator checks the last open entry, **When** the card is archived, **Then** the creator gets one email and one push per device they turned on, saying who completed which checklist in which deck and linking to the card. Their existing notification settings apply (email off means push only).
6. **Given** the creator checks the last open entry themselves, **When** the card is archived, **Then** nothing is sent.
7. **Given** the creator is no longer a member of the deck, or can no longer see the card's category, **When** the card is auto-archived, **Then** nothing is sent to them.
8. **Given** a checklist is auto-archived, restored, and auto-archived again, **When** each auto-archive happens, **Then** each one sends its own notification once; retries or restarts never send the same one twice.

---

### User Story 5 - See entries assigned to me in the notification area (Priority: P3)

The notification area (from reminders) also lists unchecked entries assigned to the member, across all their decks, grouped by checklist, and lights the alert light. Each one opens the checklist.

**Why this priority**: helps people notice what they're responsible for, but the checklist itself already shows assignments.

**Independent Test**: assign two entries of one checklist and one entry of another to a member; their notification area lists both checklists with the right counts and the light is on. Checking all three (by anyone) turns the light off.

**Acceptance Scenarios**:

1. **Given** at least one unchecked entry on a published checklist is assigned to the member and they can see it, **When** they look at the bottom bar, **Then** the alert light is on and its accessible name includes the count.
2. **Given** the notification area is open, **When** it lists assigned work, **Then** each checklist shows its title, deck and how many of its unchecked entries are assigned to the member, and opens the checklist.
3. **Given** an assigned entry is checked, removed or reassigned, or the card is archived, deleted or still a proposal, **When** the list refreshes, **Then** that entry no longer counts.
4. **Given** assigned entries, **When** they appear, **Then** no email or push is sent.

---

### Edge Cases

- **Communal decks**: the Checklist type isn't offered in the editor, and the server refuses a checklist on a communal deck however the request is made.
- **Public shared decks**: checklists never appear on public pages, public search, the sitemap, share previews or the public read API, whatever their category's visibility.
- **Category visibility**: a checklist in an admins-only category can be checked only by people who can see that category, whatever the rule says; assignees must be able to see it too.
- **Proposed checklists**: a checklist that is still a proposal can't be checked and doesn't appear in anyone's notification area; checks start once it's published.
- **Two people check the same entry at once**: both end with it checked; the first check's person and time are kept. One checks while another unchecks: the last one wins and both are logged.
- **Entry removed while someone checks it**: the check is refused as "no longer on the list" and the card refreshes.
- **All entries removed**: not allowed; a checklist keeps at least one entry.
- **Duplicate entry text**: allowed (entries are told apart by identity, not text).
- **Creator leaves the deck**: their checklists remain; the deck's owners can change "who can check" and the archive toggle.
- **Deleted and undeleted**: undelete restores the card with every entry's state as it was.
- **Offline**: the checklist reads from the last known copy; checking is unavailable (disabled with a note) until back online. Editing works like other cards (local draft, saved later).
- **Search**: a member searching for an entry's text finds the checklist; who checked what isn't searchable.
- **Long lists**: up to the entry limit, and within the card's existing content size limit; the editor shows when the list is close to the size limit.

## Requirements *(mandatory)*

### Functional Requirements

**Checklist card**

- **FR-001**: The system MUST support a new card type, Checklist, whose content is the same as a text note (title, body, categories, sources, under the same limits) plus an ordered list of **entries** (1 to 50, each with text of 1–120 characters and an optional assignee), a **who can check** rule, and an **archive when everything is checked** setting (default off).
- **FR-002**: Checklists MUST be creatable and editable in the existing card editor by roles that can create and edit cards. Adding, removing, rewording, reordering and assigning entries MUST require the right to edit the card. Changing an existing card's type to or from Checklist is out of scope.
- **FR-003**: Entry and list limits MUST be enforced by the server, not only by the editor, and the card's existing content size limit still applies.

**Where checklists are allowed and shown**

- **FR-004**: Checklists MUST NOT be created in communal decks. The editor MUST NOT offer the type there, and the server MUST refuse it on every write path.
- **FR-005**: Checklists MUST be readable, like any card, by every member who can read the deck and the card's category.
- **FR-006**: Checklists MUST never be served to anonymous visitors (public pages, public search, sitemap, public API, share previews), whatever their state or category.

**Checking**

- **FR-007**: The **eligible checkers** of a checklist are the people its rule names: the creator only; all members whose role can edit cards; all members who can read the card; or the listed members plus the creator. Only members who are still in the deck and can see the card's category count. If none remain, the deck's owners are eligible. In a personal deck the rule is always "only me".
- **FR-008**: Only eligible checkers MUST be able to check or uncheck an entry; the server enforces this. Being eligible to check MUST NOT grant any right to edit the card, and the right to edit the card MUST NOT grant the right to check.
- **FR-009**: Each check MUST record who checked the entry and when; unchecking clears it. Checking MUST NOT change the card's content, its "last updated" time, or conflict with an edit saved at the same time.
- **FR-010**: Removing an entry MUST remove its checked state. Rewording or moving an entry MUST keep it.
- **FR-011**: Checks MUST be refused for a checklist that is a proposal, archived or deleted, and for an entry that is no longer on the list.
- **FR-012**: Only the creator MUST be able to change "who can check" and the archive setting, except that the deck's owners may change them once the creator is no longer a member. People picked under "specific people" MUST be members who can see the card (any role).
- **FR-013**: The checklist MUST show its entries' state immediately when a member checks or unchecks, and revert with a message if the server refuses or the request fails. Checking MUST be unavailable offline.

**Assignment**

- **FR-014**: Each entry MAY be assigned to one member who can see the card (any role). Assignment MUST NOT grant the right to check. The editor MUST warn, without blocking, when an assignee isn't an eligible checker.
- **FR-015**: When an assignee is no longer a member or can no longer see the card, the entry MUST show as unassigned.

**Completion**

- **FR-016**: When "archive when everything is checked" is on and a check leaves no unchecked entries, the card MUST move to Archived as part of the same change and be recorded as completed by the member who made the last check. When it's off, nothing happens beyond showing that everything is done.
- **FR-017**: Restoring or undeleting a checklist MUST keep every entry's state and MUST NOT archive it again by itself.
- **FR-017a**: When a checklist is auto-archived (FR-016) by a check from someone other than its creator, the system MUST notify the creator once by email and once by push on each device they registered, under their existing notification settings, as long as they are still a member who can see the card. The message MUST carry only the checklist's title, the deck name, who made the last check and a link to the card (no entry text). Each auto-archive is notified at most once per channel, including after retries and restarts. A manual archive sends nothing.

**Notification area and search**

- **FR-018**: The notification area MUST list, per checklist, the unchecked entries assigned to the member on published checklists they can see, and count them toward the alert light. No email or push is sent for assignments. The auto-archive notification (FR-017a) does not add an entry to the notification area.
- **FR-019**: Entry texts MUST be searchable by members who can see the checklist. Who checked what MUST NOT be.

**Records and limits**

- **FR-020**: Creating, editing, checking and unchecking (with the entry's identity, never its text), auto-archiving and deleting a checklist MUST appear in the deck's activity log.
- **FR-021**: Every refused check, refused change to "who can check" or the archive setting, refused assignment, refused checklist on a communal deck, and every auto-archive notification decision (sent, skipped because the creator made the last check, is no longer eligible, opted out or has no channel, failed, retried) MUST leave a named record identifying people by id only, per the project's accountability rules.
- **FR-022**: The entry count and entry text limits MUST be operator-tunable, only downward from the documented defaults.

### Key Entities

- **Checklist**: a card of type Checklist. Has the text-note content plus ordered entries, a who-can-check rule (and its member list) and the archive-when-done setting.
- **Entry**: one line of a checklist. Has a stable identity (survives rewording and moving), text, and an optional assignee. Part of the card's content; changes with the card's edits.
- **Entry check**: the record that an entry is checked: which entry, who checked it and when. Separate from the card's content; exists only while the entry is checked.
- **Pending item**: the notification area's list (from reminders) gains a second kind, "assigned checklist entries", per checklist.
- **Notification delivery** (from reminders): one attempt to tell the creator about one auto-archive through one channel, with its outcome; guarantees at-most-once per creator, channel and auto-archive.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A member can create a 5-entry checklist with a "who can check" choice in under 1 minute, and check an entry with one tap.
- **SC-002**: A checked entry appears checked on the member's screen in under 200 ms, and is visible to other members who open or refresh the card within 2 seconds.
- **SC-003**: No member outside a checklist's eligible checkers can check or uncheck an entry, and no member who can't edit cards can change the entries, verified by tests covering every role and rule combination.
- **SC-004**: Zero checklists are visible to anonymous visitors through any public path, and zero checklists exist in communal decks, verified by tests covering each path in FR-004 and FR-006.
- **SC-005**: In 100 runs that interleave an edit and a check on the same checklist, no check and no edit is lost.
- **SC-006**: From any bottom-bar page, a member can tell within one glance whether they have assigned entries waiting.

## Assumptions

- **Write access** means the roles that can edit cards today (owner, maintainer, editor). "Everyone who can read it" means every member who can see the card, readers included.
- **Deck owners as fallback**: like reminders, when nobody covered by the rule remains, the deck's owners can check.
- **Concurrent checks**: checking an already-checked entry keeps the first checker; the last of a check and an uncheck wins.
- **No reset action**: reusable lists are unchecked entry by entry; a "reset all" action is out of scope.
- **Archive setting default off**: a checklist that's all done stays put unless the creator chose otherwise.
- **Notification area reuse**: assigned entries join the reminders' pending list and light; pages without the bottom bar don't show the light.
- **Auto-archive notification channels** reuse the reminders' email and push delivery and the member's existing settings (email opt-out, per-device push). Whether the email opt-out is renamed from "reminder emails" to a general "notification emails" setting is a plan decision. It isn't an in-app notification-area entry, because that list holds only things waiting on the member.
- **Ingestion and import** don't create checklists in this feature; checklists are made in the editor.

## Out of Scope

- Email, push or any other notification for assignments, for single entries being checked, or to anyone but the creator on completion.
- A notification for a manual archive or for a list that becomes all done while the archive toggle is off.
- Due dates, reminders or recurrence per entry or per checklist.
- Nested entries or sections within a checklist.
- A "reset all" / "uncheck all" action.
- Converting an existing card to or from a Checklist.
- Checklists in communal decks, and any anonymous view of a checklist.
- Ingestion, share, email-in or bulk import producing checklists.
- Offline checking queued for later.
