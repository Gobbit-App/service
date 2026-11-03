# Feature Specification: Reminders and the notification area

**Feature Branch**: `037-reminders`

**Created**: 2026-11-03

**Status**: Draft

**Input**: User description: "Add a new item type, Reminder. Its content is the same as a text note, plus a deadline. Its purpose is to nag until it's dismissed. Dismissing opens a modal with a big Done toggle (off by default): the user must switch it on, or use a secondary button to dismiss without confirming it's done. The modal also has an optional resolution text. When the deadline is reached the app sends a notification (email + app notification), which means adding Web Push (VAPID). The app gets a notification area with an alert light for pending items: reminders now, other actions in the future. Reminders aren't visible in their deck until their deadline approaches, controlled by a per-item 'when to show' setting: default 24 hours before the deadline, any number plus a unit (minutes, hours, days). The creator also chooses who may dismiss: only themselves, all (anyone with write access to the deck), or specific user(s)."

Builds on the card editor ([`007-card-editor`](../007-card-editor/spec.md)), card lifecycle ([`006-card-lifecycle`](../006-card-lifecycle/spec.md)), the activity log ([`020-item-events`](../020-item-events/spec.md)) and the bottom bar ([`036-bottom-bar`](../036-bottom-bar/spec.md)), which hosts the notification area's entry point.

## Clarifications

### Session 2026-11-03

- Q: How often does an undismissed reminder re-notify after its deadline? → A: Once only. Email and push go out once at the deadline; after that the in-app alert light is the nag.
- Q: Can readers be named as dismissers? → A: No. Only members with write access can dismiss. Reading a reminder follows the deck's normal permissions, like any other card.
- Q: Who can see a reminder before its reveal time? → A: Its creator and the deck's admins (owners and maintainers), so they can edit or delete it. They find these in a separate **Upcoming** list in the deck, not in the main list.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Create a reminder that stays out of the way until it matters (Priority: P1)

A family member with write access to a deck creates a Reminder: a title and short body like a text note ("Renew the car insurance — policy number is in the Car category"), a deadline, and when it should appear ("2 days before"). Until then the deck's main list looks unchanged for everyone. The creator and the deck's admins find it in the deck's Upcoming list, where they can edit or delete it.

**Why this priority**: without the card type there is nothing to show, notify or dismiss. On its own it already delivers a "card that appears when it becomes relevant".

**Independent Test**: create a reminder with a deadline 3 days out and "show 1 day before". As an editor or reader who didn't create it, the deck list, search and Browse don't show it; as an owner it appears only under Upcoming. Move the clock to 1 day before the deadline: it now appears in the main list for every member.

**Acceptance Scenarios**:

1. **Given** an editor in the new-card editor, **When** they choose the Reminder type, **Then** they see the text-note fields plus a deadline (date and time, in their device's time zone), a "show before" amount and unit (minutes, hours, days; default 24 hours), and a "who can dismiss" choice (default: only me).
2. **Given** a reminder whose reveal time (deadline minus "show before") hasn't arrived, **When** any member other than its creator and the deck's owners and maintainers lists, searches or browses the deck, **Then** the reminder is absent, and nothing reveals that it exists (no count, gap or placeholder).
3. **Given** the same hidden reminder, **When** its creator or a deck owner or maintainer opens the deck's **Upcoming** list, **Then** it is listed with its reveal time and deadline, and they can open, edit, archive or delete it. The creator also sees it under "Upcoming" in their notification area.
4. **Given** a creator whose role is editor, **When** they delete their own reminder, hidden or not, **Then** it is deleted (undeletable for 30 days as usual), although editors can't delete other cards.
5. **Given** the reveal time passes, **When** any member who can read the deck and the reminder's category lists or searches the deck, **Then** the reminder appears in the main list, marked as a reminder with its deadline and how long remains.
6. **Given** a deadline in the past, or a "show before" value that is not a whole number in range, **When** the creator saves, **Then** the save is refused with a message on the offending field.

---

### User Story 2 - Get notified at the deadline, then nagged in the app until someone deals with it (Priority: P1)

When the deadline arrives, everyone who may dismiss the reminder gets one email and, on devices where they turned it on, one push notification. After that the reminder keeps nagging in the app: it shows as overdue in the deck and lights the notification area until it is dismissed. Email and push are not repeated.

**Why this priority**: the deadline notification is the point of the feature; a reminder that only appears in a list is easy to miss.

**Independent Test**: create a reminder due in 2 minutes with "who can dismiss: all". Every member with write access gets one email and one push notification (where enabled) within 2 minutes of the deadline; readers get nothing. Leave it undismissed for a day: no further email or push arrives, and the alert light stays on.

**Acceptance Scenarios**:

1. **Given** a published reminder reaches its deadline undismissed, **When** the deadline passes, **Then** each person allowed to dismiss it who can still see it gets one email and one push notification per device they enabled, each linking straight to the reminder.
2. **Given** a reminder still undismissed after its deadline, **When** time passes, **Then** no further email or push is sent; it stays overdue in the deck list and the notification area until dismissed, archived or deleted.
3. **Given** a member turned reminder emails off in Settings, **When** a reminder is due, **Then** they get no email but still get push (if enabled) and see it in the notification area.
4. **Given** a reminder is dismissed, archived or deleted before its deadline, **When** the deadline passes, **Then** nothing is sent.
5. **Given** a member never enabled push, **When** a reminder is due, **Then** they get the email and the notification area entry only, and nothing fails.

---

### User Story 3 - Dismiss a reminder, saying whether it was done (Priority: P1)

Someone allowed to dismiss opens the reminder and taps Dismiss. A modal shows a large "Done" toggle, off by default, and an optional resolution text ("Renewed with the same insurer, new policy in the Car category"). They switch Done on and confirm, or use the secondary "Dismiss without marking done" button. The reminder stops nagging and leaves the deck's active list; the outcome is recorded.

**Why this priority**: without dismissal the nagging never ends; recording done-vs-dismissed tells the family what actually happened.

**Independent Test**: dismiss one reminder with Done on and a resolution, another with the secondary button. Both leave the active list and the notification area, and each shows its outcome, who dismissed it, when, and the resolution text.

**Acceptance Scenarios**:

1. **Given** the dismiss modal is open, **When** it first appears, **Then** the Done toggle is off, the primary confirm action is disabled until Done is switched on, and a secondary "Dismiss without marking done" action is available.
2. **Given** Done is switched on, **When** the user confirms, **Then** the reminder is recorded as **done** with the dismisser, time and optional resolution text, it leaves the notification area, and it moves out of the active list into Archived.
3. **Given** Done is off, **When** the user picks "Dismiss without marking done", **Then** it is recorded as **dismissed** (not done) the same way, without a further confirmation step.
4. **Given** a member who is not allowed to dismiss this reminder, **When** they view it, **Then** they see it and its deadline but no Dismiss action, and the server refuses a dismissal request from them.
5. **Given** a dismissed reminder, **When** someone allowed to dismiss restores it from Archived, **Then** it becomes pending again. If its deadline has passed it shows as overdue in the app, without a new email or push; if not, it notifies at its deadline as usual.
6. **Given** a resolution text over the limit, **When** the user confirms, **Then** the dismissal is refused with a message on the field.

---

### User Story 4 - See everything waiting on me in one place (Priority: P2)

From any page with the bottom bar, a notification entry shows an alert light while something is waiting on the signed-in member. Opening it lists their pending items across all decks: reminders they may dismiss (overdue first, then by deadline), plus "Upcoming" reminders they created that aren't visible yet. Each entry opens the reminder.

**Why this priority**: email and push are sent once and can be missed or turned off; the in-app light is the lasting nag. It is also the home for future actionable items, but reminders work without it via email and the deck list.

**Independent Test**: with one overdue reminder the member may dismiss, the light is on on every bar page; the list shows that reminder; dismissing it from there turns the light off.

**Acceptance Scenarios**:

1. **Given** at least one revealed, undismissed reminder the member may dismiss, **When** they look at the bottom bar on any page that has it, **Then** the notification entry shows the alert light, and its accessible name says how many items are pending.
2. **Given** at least one such reminder is past its deadline, **When** the light shows, **Then** it is visibly distinct (overdue state) from "pending but not yet due".
3. **Given** nothing pending, **When** they look at the bar, **Then** the light is off; opening the area shows an empty state (and "Upcoming" if any).
4. **Given** the member opens a pending entry, **When** the reminder opens, **Then** Dismiss is right there; after dismissing they return to the area and the entry is gone.
5. **Given** the device is offline, **When** they open the area, **Then** they see the last known list with a note that it may be out of date, and Dismiss is disabled until back online.

---

### User Story 5 - Choose who can dismiss (Priority: P2)

The creator decides who may close the reminder: only themselves (default), "all" (anyone with write access to the deck), or specific people they pick from the deck's members with write access. Only those people get the deadline notifications and see the reminder in their notification area. Everyone who can read the deck still sees the revealed reminder in the deck, as with any card.

**Why this priority**: "only me" covers personal reminders; shared household chores need "all" or a named person. The P1 stories work with the default.

**Independent Test**: create three reminders, one per choice; check that dismiss rights, notifications and notification-area entries follow the choice for an owner, an editor and a reader, and that a reader is never offered as a pick.

**Acceptance Scenarios**:

1. **Given** "only me", **When** the deadline arrives, **Then** only the creator is notified and can dismiss.
2. **Given** "all", **When** the deadline arrives, **Then** every member with write access to the deck (owner, maintainer, editor) who can see the reminder's category is notified and can dismiss; readers can see it but not dismiss it.
3. **Given** "specific people", **When** the creator picks members, **Then** only deck members with write access are offered (readers never), and only the picked people plus the creator are notified and can dismiss.
4. **Given** a picked person leaves the deck or is demoted to reader, **When** the deadline arrives, **Then** they are not notified and can't dismiss (a demoted reader still reads it like any card); if nobody eligible remains, the deck's owners can dismiss it.
5. **Given** a member other than the creator edits the reminder's text, **When** they open the "who can dismiss" choice, **Then** it is read-only for them; only the creator (and owners when the creator has left) can change it.

---

### User Story 6 - Turn on push notifications for a device (Priority: P2)

In Settings, a member turns on push notifications for the device they're using; the browser asks permission. They can turn them off again per device, and turn reminder emails off for their account.

**Why this priority**: push needs explicit permission per device and an installed app on some phones; email alone already delivers the deadline notification.

**Independent Test**: enable push in Settings, grant permission, use "Send a test notification" and receive it; disable it and confirm the test no longer arrives.

**Acceptance Scenarios**:

1. **Given** push is supported and configured, **When** a member taps "Turn on notifications on this device" and grants permission, **Then** the device is registered and a test notification can be sent.
2. **Given** the browser refuses or permission is denied, **When** they try, **Then** Settings explains that push is off for this device and how to change it, and email still works.
3. **Given** an iPhone browser tab that isn't installed to the home screen, **When** they open the setting, **Then** it explains that the app must be added to the home screen first.
4. **Given** push is not configured on the server, **When** a member opens Settings, **Then** the push option is absent and reminders still email and show in the notification area.
5. **Given** the push service reports a device subscription as gone, **When** a notification fails for it, **Then** that device is removed and the member's other channels are unaffected.

---

### Edge Cases

- **Deadline edited**: moving the deadline recomputes the reveal time; a new deadline counts as a new one, so its notification is sent once at the new time even if one went out for the old deadline. A new deadline must be in the future, as on creation; editing other fields of an overdue reminder keeps its deadline and sends nothing.
- **"Show before" longer than the time left**: e.g. created 3 hours before the deadline with the 24-hour default; the reminder is visible immediately.
- **"Show before" of 0**: appears exactly at the deadline.
- **Category visibility**: a reminder in an admins-only category is visible to, notifies, and can be dismissed only by people who can see that category, whatever the "who can dismiss" choice says.
- **Public decks**: reminders never appear on public pages, public search, share previews or the public read API, revealed or not.
- **Personal deck** (`/d/me`): only the owner exists, so "who can dismiss" is fixed to "only me".
- **Proposed reminders**: a reminder that is still a proposal (not published) is never revealed beyond the people who see proposals today and sends no notifications until published; if published after its deadline, it is overdue in the app without email or push.
- **Archived or deleted before the deadline**: no notifications; restore or undelete before the deadline schedules the notification again.
- **Restored after the deadline**: becomes overdue in the app only; email and push aren't sent again.
- **Creator leaves the deck**: their reminders remain; owners can dismiss and edit "who can dismiss", and owners and maintainers still see hidden ones in Upcoming.
- **Time zones**: the deadline is a single moment; each member sees it in their own device's time zone. Emails state it with the zone it was set in.
- **Server downtime across a deadline**: on recovery, notifications whose deadline passed during the outage are sent once, late.
- **Many reminders due together**: each person gets one email per reminder, not a digest (digest is out of scope).
- **Email bounces or the mail provider fails**: retried with backoff; a final failure is recorded and doesn't stop push or the notification area.
- **Offline creation**: the draft is kept locally like other card drafts; scheduling happens only once saved.

## Requirements *(mandatory)*

### Functional Requirements

**Reminder card**

- **FR-001**: The system MUST support a new card type, Reminder, whose content is the same as a text note (title, body, categories, sources, under the same body and payload limits), plus a **deadline** (a moment in time), a **show before** offset (a whole number with unit minutes, hours or days; default 24 hours; 0 allowed; at most 365 days), and a **who can dismiss** rule (only the creator, all writers, or a list of specific members with write access).
- **FR-002**: The deadline MUST be in the future when a reminder is created or its deadline changed, and no more than 5 years ahead. These bounds MUST be enforced by the server, not only by the editor.
- **FR-003**: Reminders MUST be creatable and editable in the existing card editor by roles that can create and edit cards. Changing an existing card's type to or from Reminder is out of scope.

**Visibility**

- **FR-004**: Until its reveal time (deadline minus show before), a reminder MUST be hidden from every read path (deck list, category views, favorites, links, Browse, search and Ask, card page, share preview) for everyone except its creator and the deck's owners and maintainers. Hidden reminders MUST NOT affect counts or ordering others can see.
- **FR-005**: The deck MUST offer an **Upcoming** list, shown to the deck's owners and maintainers and to members who created a hidden reminder there. It lists the hidden reminders they may see (owners and maintainers: all; creators: their own) with reveal time and deadline. Hidden reminders MUST NOT appear in the main list, even for them. From Upcoming they can open, edit, archive or delete a reminder.
- **FR-006**: A reminder's creator MUST be able to delete their own reminder (with the usual 30-day undelete) even if their role can't delete other cards. Owners and maintainers delete reminders like any card.
- **FR-007**: After its reveal time, an undismissed reminder MUST appear in its deck's main list like any card, readable by every member who can read the deck and its category (the usual permissions), showing its deadline and the time remaining (or how overdue it is).
- **FR-008**: Reminders MUST never be served to anonymous visitors (public pages, public search, public API, share previews), whatever their state.

**Notifications**

- **FR-009**: When a published, undismissed reminder's deadline passes, the system MUST notify every *eligible dismisser* (FR-015) once by email and once by push on each device they registered, each message linking straight to the reminder.
- **FR-010**: Email and push MUST NOT repeat while the reminder stays undismissed. After the deadline it nags only in the app: overdue in the deck list and in the notification area with the overdue light, until it is dismissed, archived or deleted.
- **FR-011**: Email and push messages MUST carry only the reminder's title, deck name, deadline and link: no body text, no resolution text.
- **FR-012**: Members MUST be able to turn reminder emails off for their account and turn push on or off per device in Settings, with a "Send a test notification" action for push. The notification area can't be turned off.
- **FR-013**: Push MUST be optional for the deployment: without push keys configured, the push option is absent and everything else works. Email requires the existing mail configuration; without it, only push and the notification area are used.
- **FR-014**: A notification MUST be sent at most once per person, channel (each push device counts as one) and deadline, including after retries, restarts or downtime. Changing the deadline to a new value counts as a new deadline.

**Dismissing**

- **FR-015**: The eligible dismissers of a reminder are the people its rule names (the creator; all members whose role can edit cards; or the listed members plus the creator) who are still members of the deck, still hold a role that can edit cards and can see the reminder's category. If none remain, the deck's owners are eligible. Readers are never eligible.
- **FR-016**: Only eligible dismissers MUST be able to dismiss; the server enforces this. Others see the reminder without a Dismiss action.
- **FR-017**: The dismiss modal MUST show a large Done toggle, off by default, an optional resolution text (up to 600 characters), a primary confirm action enabled only when Done is on, and a secondary "Dismiss without marking done" action that dismisses immediately.
- **FR-018**: A dismissal MUST record the outcome (done or dismissed), who, when and the resolution text, cancel any pending notification, remove it from notification areas, and move the reminder to Archived, where it shows the outcome.
- **FR-019**: Restoring a dismissed reminder MUST clear its outcome and make it pending again. If its deadline is still ahead it notifies at the deadline as usual; if it has passed, it is overdue in the app only, with no new email or push.
- **FR-020**: Only the creator MUST be able to change "who can dismiss", except that the deck's owners may change it once the creator is no longer a member.

**Notification area**

- **FR-021**: Every page with the bottom bar MUST show a notification entry with an alert light that is on while the member has at least one pending item, with a distinct overdue state, and an accessible name stating the count.
- **FR-022**: The notification area MUST list, across all the member's decks: pending reminders they may dismiss (overdue first, then soonest deadline), and an "Upcoming" section of not-yet-revealed reminders they created. Each entry shows the title, deck and deadline and opens the reminder.
- **FR-023**: The notification area MUST be built as a general list of pending items so other kinds of actionable items can be added later without changing the entry point or the light.
- **FR-024**: The light and list MUST refresh when the app regains focus, after a dismissal, and when a push notification arrives while the app is open; offline they show the last known state, marked as possibly stale.

**Records and limits**

- **FR-025**: Creating, editing, dismissing (with outcome), restoring and deleting a reminder MUST appear in the deck's activity log like other card changes (field names only, no content).
- **FR-026**: Every notification decision (sent, skipped because the person opted out, is ineligible or has no channel, failed, retried, device removed) and every refused dismissal or refused delete MUST leave a named record identifying people by id only, per the project's accountability rules.
- **FR-027**: Limits that shape the experience (maximum "show before", maximum deadline distance, resolution length, email retry policy) MUST be operator-tunable with documented defaults.

### Key Entities

- **Reminder**: a card of type Reminder. Has the text-note content plus deadline, show-before offset, who-can-dismiss rule (and its member list), state (pending, done, dismissed), dismissal record (who, when, resolution text), and whether its deadline notification has been sent.
- **Push subscription**: one registered device for one member: the push endpoint and keys, when it was added and last used. Removed when the member turns it off or the push service reports it gone.
- **Notification delivery**: one attempt to notify one person through one channel for one reminder's deadline, with its outcome. Guarantees at-most-once per person, channel and deadline.
- **Pending item**: what the notification area lists for a member. Today derived from reminders; designed so other kinds can join later.
- **Notification preferences**: per member, whether reminder emails are on.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 99% of deadline notifications reach the email provider and push service within 2 minutes of the deadline, under normal operation.
- **SC-002**: No member other than the creator and the deck's owners and maintainers can find a hidden reminder by any read path, verified by tests covering each path in FR-004 and FR-008.
- **SC-003**: Each eligible dismisser receives exactly one email and one push per enabled device per deadline, whether the reminder is dismissed an hour or a month later, across 100 runs that include a worker restart at the deadline.
- **SC-004**: A member can create a reminder (title, deadline, show-before, who can dismiss) in under 1 minute, and dismiss one from the notification area in 3 taps or fewer.
- **SC-005**: From any bottom-bar page, a member can tell within one glance whether anything is waiting on them, and whether any of it is overdue.
- **SC-006**: Every pending reminder ends in a recorded outcome (done or dismissed) or is archived or deleted; none nags forever without a way to stop it for its eligible dismissers.

## Assumptions

- **Done = archived**: a dismissed reminder (done or not) moves to Archived rather than staying in the active list; restore re-opens it.
- **Write access** in "all" and in the specific-people picker means the roles that can edit cards today (owner, maintainer, editor).
- **Deck admins** are owners and maintainers (the roles that already see admins-only categories).
- **Notified people = eligible dismissers**: readers and other members who can read the reminder see it in the deck list but get no email, push or notification-area entry.
- **Hidden reminders live in Upcoming** (the deck's Upcoming list for the creator and admins, plus the creator's notification area), never in the main list, so the main list looks the same for everyone until the reveal time.
- **Email opt-out exists**: the deadline email is on by default but a member can turn it off; the notification area always nags.
- **Push content** is limited to title, deck and deadline, because notifications show on lock screens and pass through third-party push services.
- **Push on iPhone** requires the app installed to the home screen; that's a platform limit, explained in Settings.
- **Deadline precision** is to the minute; deadlines are checked at least once a minute.
- **The bottom bar (036)** is where the notification entry lives; pages without the bar (Browse, editor) don't show the light.
- **Ingestion and import** don't create reminders in this feature; reminders are made in the editor.

## Out of Scope

- Recurring reminders (every week, every month).
- Snoozing a reminder, and repeated email or push after the deadline.
- Daily or weekly digests instead of one message per reminder.
- Native-app notifications, SMS or chat channels.
- Other kinds of pending items in the notification area (only the structure is prepared).
- Converting an existing card to or from a Reminder.
- Calendar export or sync.
