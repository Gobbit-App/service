# Feature Specification: Events

**Feature Branch**: `042-events`

**Created**: 2026-11-08

**Status**: Draft

**Input**: User description: "Add a new item type, Event: a mix of a link card, a text note and a reminder. Its content is a text note plus a start (date and time, or an all-day date), an optional end, an optional location and an optional link with the full link preview. Unlike a Reminder it is never hidden and never dismissed: it is visible like any card, in lists, search, Browse and public decks. Its card shows how close it is (upcoming, today, now, ended). It notifies deck members as it approaches, at up to three 'notify before' times (default 1 day before), by push notification. The audience is everyone who can read it by default, or specific people, only me, or nobody; any member can mute one event. In the notification area events appear under 'Coming up' but don't light the bell. Members can add an event to their own calendar."

Builds on reminders and the notification area ([`037-reminders`](../037-reminders/spec.md)), whose push, per-device settings and notification area it reuses (not its email); link previews and link checks ([`014-link-snapshots`](../014-link-snapshots/spec.md)); rich-text bodies ([`038-rich-text-body`](../038-rich-text-body/spec.md)); the card editor ([`007-card-editor`](../007-card-editor/spec.md)); public pages ([`017-public-pages`](../017-public-pages/spec.md)); and the activity log ([`020-item-events`](../020-item-events/spec.md)).

## Clarifications

### Session 2026-11-07 (pre-spec design review)

- Q: Who is notified by default? → A: Everyone who can read the event's deck and category, readers included. Unlike a reminder, nothing has to be acted on, so read access is enough.
- Q: Do events light the bell in the bottom bar? → A: No. The light stays for things that need the member to act. Events are listed in a "Coming up" section of the notification area instead.
- Q: Are events shown on public decks? → A: Yes. An event is content like any card. Its date, location and link are public on a public deck; who is notified and who muted it never are.
- Q: Can an event start in the past? → A: Yes, to record something that happened. It schedules no notifications.

### Session 2026-11-09

- Q: Are event notices also sent by email? → A: No, not in this feature. Events notify by push and the notification area only; email for events is out of scope.
- Q: Does sharing a link to an event page create an event? → A: Yes. When ingestion recognises a shared page (or shared text) as an event, it proposes an Event card, with the start, end, location and link, instead of a link card. This is part of this feature, and every new card type gets the same: ingestion proposes it when it recognises one.
- Q: Events or checklists first? → A: Events ship first; checklists build on them.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Add an event to a deck (Priority: P1)

A family member with write access adds an Event: a title and short note ("School play — Noa is a tree, bring flowers"), a start ("Thursday 3 Dec, 18:00"), an optional end ("20:00"), an optional location ("School hall") and an optional link to the school's page, which gets the same preview as a link card. From the moment it's published, it's in the deck like any other card, and everyone who can read the deck sees it.

**Why this priority**: without the card there is nothing to show or notify about. On its own it already gives the family one place for "what's on, where, and the details".

**Independent Test**: create an event 3 days out with a link and a location. Every member who can read the deck, readers included, sees it in the deck list, Browse and search, with its date, time, location and link preview. Nothing about it is hidden before any date.

**Acceptance Scenarios**:

1. **Given** an editor in the new-card editor, **When** they choose the Event type, **Then** they see the text-note fields plus start date and time (in their device's time zone), an "all day" switch, an optional end, an optional location and an optional link that shows a preview as for link cards.
2. **Given** an event is saved and published, **When** any member who can read its deck and category lists, searches or browses the deck, **Then** the event appears like any other card, showing its date and time, location and link preview.
3. **Given** an "all day" event, **When** it is saved, **Then** it has a start date (and optional end date for several days) and no times, and every member sees the same dates whatever their time zone.
4. **Given** an end before the start, a start more than 5 years ahead, or a location over the limit, **When** the creator saves, **Then** the save is refused with a message on the offending field.
5. **Given** a start in the past, **When** the creator saves, **Then** the event is saved (to record something that happened), shown as ended, and no notification is scheduled.
6. **Given** an event with a link, **When** the link's page later breaks, **Then** the event is flagged by the existing link checks the same way a link card is.

---

### User Story 2 - See at a glance how close an event is (Priority: P1)

Each event card shows where it stands right now: "in 3 days", "tomorrow", "today 18:00", "now" while it's on, and "ended" afterwards. The card stays in the deck after it ends, like any other card, until someone archives or deletes it.

**Why this priority**: the point of an event card over a text note is that it's tied to a time; a card that doesn't say how close that time is would just be a note with a date in it.

**Independent Test**: view one event at four moments (3 days before, the morning of, during, the day after) and check the card's status line each time, for a viewer in the event's time zone and one in another zone.

**Acceptance Scenarios**:

1. **Given** an event starting on a later day, **When** a member views it, **Then** the card says how far away it is ("tomorrow", "in 3 days", or the date when it's further than a week).
2. **Given** an event starting later today in the viewer's time zone, **When** they view it, **Then** the card says "today" with the start time.
3. **Given** the current time is between the start and the end (or within the whole day for all-day events), **When** a member views it, **Then** the card shows it as happening now.
4. **Given** the event's end has passed, **When** a member views it, **Then** the card shows it as ended, and it stays in the deck list unchanged otherwise.
5. **Given** a viewer whose device is in a different time zone from the event's, **When** they view a timed event, **Then** they see the time in their own zone with the event's own zone noted next to it.

---

### User Story 3 - Get notified as an event approaches (Priority: P1)

When creating the event, the creator picks when to notify: up to three "notify before" times (default: 1 day before; "at the start" is also allowed) and who gets notified (default: everyone who can read it). At each of those times, everyone in the audience gets one push notification on each device where they turned push on, linking to the event. There is no email for events. Nobody has to dismiss anything.

**Why this priority**: notifications are what makes this a reminder rather than a note; "the play is tomorrow" is the message families miss.

**Independent Test**: create an event starting in 2 hours with "notify 1 hour before" and the default audience. Within 2 minutes of the 1-hour mark, every member who can read it, readers included, gets one push on each device where push is on; nobody gets a second one, no email is sent, and nothing needs dismissing.

**Acceptance Scenarios**:

1. **Given** the event editor, **When** the creator opens the notification settings, **Then** they can set zero to three "notify before" times, each an amount plus a unit (minutes, hours or days, 0 = at the start), defaulting to one time of 1 day, and an audience: everyone who can read it (default), specific people, only me, or nobody.
2. **Given** a published event reaches one of its notify times, **When** that moment passes, **Then** each audience member who can still read it gets one push per enabled device (and no email), each with the title, deck, start time and location, linking to the event.
3. **Given** the same event, **When** its other notify times pass, **Then** each sends its own notice once; none repeats.
4. **Given** the creator edits the title, body, location, link or end, **When** they save, **Then** no notice is sent again.
5. **Given** the creator moves the start, **When** they save, **Then** the notify times are recalculated from the new start and each one still ahead is sent at its new moment, even if a notice went out for the old start.
6. **Given** an event that is still a proposal, archived or deleted, **When** a notify time passes, **Then** nothing is sent.
7. **Given** a notify time whose moment has already passed when the event is saved, published or restored, **When** the save completes, **Then** that notice is not sent; later notify times still are.

---

### User Story 4 - Control who is notified, and mute what I don't need (Priority: P2)

The creator chooses the audience: everyone who can read the event (default), specific deck members, only themselves, or nobody. Any member in the audience can mute one event ("Don't notify me about this event") without affecting anyone else, and can turn the notices back on.

**Why this priority**: the default suits most family events; picking people or muting covers the "this is only for the kids' parents" and "I'm not going" cases. The P1 stories work with the default.

**Independent Test**: create events with each audience choice and check who is notified (owner, editor, reader). Mute one event as a reader: that reader gets nothing for it while everyone else still does; unmute and the next notice arrives.

**Acceptance Scenarios**:

1. **Given** "specific people", **When** the creator picks members, **Then** any deck member can be picked, readers included, and only the picked members plus the creator are notified.
2. **Given** "only me", **When** a notify time passes, **Then** only the creator is notified; **given** "nobody", nobody is.
3. **Given** a member in the audience mutes the event, **When** its next notify time passes, **Then** they get no push for it, and everyone else is still notified.
4. **Given** a muted event, **When** the member unmutes it, **Then** its remaining notify times notify them again; notices skipped while muted aren't sent late.
5. **Given** a member other than the creator edits the event, **When** they open the audience choice, **Then** it is read-only for them; only the creator (and the deck's owners once the creator is no longer a member) can change it.
6. **Given** the personal deck, **When** an event is created there, **Then** the audience is fixed to "only me".
7. **Given** an audience member who leaves the deck or can no longer see the event's category, **When** a notify time passes, **Then** they are not notified.

---

### User Story 5 - See what's coming up in the notification area (Priority: P2)

The notification area gets a "Coming up" section listing events the member is notified about, from the event's first notify time until it ends, soonest first. Events never turn on the bell's alert light: the light still means "something needs you".

**Why this priority**: push is sent once and can be missed, and members without push enabled get nothing else; the area is the place to look again. Events work without it via push and the deck.

**Independent Test**: with one event inside its notify window and no reminders pending, open the notification area: the event is listed under "Coming up" and the bell's light is off. After the event ends, it is gone from the list.

**Acceptance Scenarios**:

1. **Given** an event in the member's audience whose first notify time has passed and which hasn't ended, **When** they open the notification area, **Then** it is listed under "Coming up" with title, deck, start time and location, and opens the event.
2. **Given** only events are listed (no pending reminders), **When** the member looks at the bottom bar, **Then** the alert light is off.
3. **Given** the member muted the event, or is not in its audience, **When** they open the area, **Then** the event is not listed.
4. **Given** the event ends, is archived or is deleted, **When** the member next opens the area, **Then** it is no longer listed.
5. **Given** the device is offline, **When** they open the area, **Then** they see the last known list marked as possibly out of date, as for reminders.

---

### User Story 6 - Add an event to my own calendar (Priority: P3)

From an event card, a member taps "Add to calendar" and gets a calendar file with the title, time, location and link, which their phone or computer calendar imports.

**Why this priority**: many families live in their phone calendar; this bridges to it without syncing. Everything else works without it.

**Independent Test**: export a timed event and an all-day event and import each into a common calendar app; times, dates, location and link are correct, including for a viewer in another time zone.

**Acceptance Scenarios**:

1. **Given** a member viewing an event, **When** they tap "Add to calendar", **Then** a calendar file downloads with the title, start, end (or a default length), the event's time zone, location, a link back to the card, and the event's own link if it has one.
2. **Given** an all-day event, **When** it is exported, **Then** the calendar shows it as an all-day event on the right date(s).
3. **Given** the device is offline, **When** the member taps "Add to calendar" on a card already loaded, **Then** the file is still produced.

---

### User Story 7 - Share an event page and get an event card (Priority: P2)

A member sees the school's page for the spring concert and shares it to the deck from their phone (Android share, the iPhone Shortcut or the paste box). Gobbit recognises the page as an event and proposes an Event card with the concert's title, start, end, location and the page as its link, in the sharer's time zone. A publisher reviews it in the review queue as usual and publishes it, and from then on it notifies like any event.

**Why this priority**: most family events arrive as a link someone was sent. Retyping the date into the editor is the step people skip, so an event that arrives by sharing is the one that actually gets a reminder.

**Independent Test**: share a page that describes an event with a stated date. The proposal in the review queue is an Event with that date, location and link. Share a plain article: it's still proposed as a link card.

**Acceptance Scenarios**:

1. **Given** a shared page that describes one event with a date (in the page's event data or in its text), **When** ingestion runs, **Then** the proposal is an Event with that title, start, end (if stated), location (if stated) and the page as its link with a preview.
2. **Given** a shared page or text that mentions no date, or more than one event, **When** ingestion runs, **Then** the proposal is a link (or text) card as today, not an Event.
3. **Given** a date-only event on the page, **When** it's proposed, **Then** it's an all-day event. **Given** a time with no zone, **When** it's proposed, **Then** the time is read in the sharer's time zone.
4. **Given** an event proposal, **When** it's waiting for review, **Then** nobody is notified. **When** a publisher publishes it, **Then** its default notify time (1 day before, everyone who can read it) applies to moments still ahead.
5. **Given** a publisher shares an event whose date and time zone were read from the page's event data and the sharer's device, **When** the share would auto-publish today, **Then** it auto-publishes as an Event. **Given** the date came only from the model's reading of the text, or the time zone isn't known, **Then** it stays in review.
6. **Given** an event in the deck with a link, **When** someone shares the same link for the same date, **Then** the proposal is flagged as a possible duplicate. **When** they share it for a different date (a weekly class), **Then** it's not.
7. **Given** a reviewer opens an event proposal, **When** they edit it, **Then** they can correct the date, time zone, location and notification settings before publishing.

---

### Edge Cases

- **Notify time before "now" at creation**: e.g. created 3 hours before the start with the 1-day default. That notice is skipped; any "at the start" or shorter notice still goes out. The editor says which notify times will be skipped.
- **Server downtime across a notify time**: on recovery, a missed notice is sent late only if the event hasn't started yet; if it has, the notice is skipped and the skip is recorded.
- **Start moved to the past**: allowed, as on creation; it schedules nothing and unsent notices are cancelled.
- **Notify times changed**: removing one cancels it if unsent; adding one schedules it if its moment is still ahead; a notify time that already went out for the same start isn't sent again.
- **Multi-day events**: an end on a later day is allowed; the card shows it as "now" for the whole span.
- **No end**: a timed event without an end counts as "now" for one hour after the start, then ended; an all-day event without an end covers its start date.
- **All-day notify times**: for all-day events notify times are in days only and go out at 09:00 in the event's time zone ("at the start" = 09:00 on the day), not at midnight.
- **Daylight saving changes**: "N days before" keeps the same wall-clock time in the event's time zone; minutes and hours are exact durations.
- **Category made admins-only after creation**: the audience narrows to people who can still see the category; no one else is notified.
- **Creator leaves the deck**: the event stays and keeps notifying; the deck's owners can change its audience.
- **Public decks**: the event's title, body, date, location and link appear on public pages, public search and the public read API like other card content; the audience, the picked people and mutes never do. Anonymous visitors get no notifications.
- **Duplicates**: a shared event with the same link and the same start date as an existing event is flagged as a possible duplicate; the same link on a different date (a weekly class) is not, and a shared link card is never a duplicate of an event.
- **Shared page with a past date**: proposed as an Event that has already ended; publishing it schedules nothing.
- **Shared page with an unreadable or out-of-range date** (more than 5 years ahead, end before start): proposed as a link card, not an Event.
- **Shared without a time zone** (email-in, or a Shortcut that doesn't send one): the operator's default time zone is used and the proposal stays in review so a person checks it.
- **Proposed events published late**: only notify times still ahead are sent.
- **Restored or undeleted events**: only notify times still ahead are sent; ones that passed while archived or deleted are not.
- **Many events notifying together**: each is a separate push, no digest.
- **Push fails or a device is gone**: retried and cleaned up exactly as for reminders; a failure on one device doesn't stop the others.
- **Member without push**: they get no notice for events; the event still shows in the deck and under "Coming up" in their notification area.
- **Push not configured on the server**: events send nothing; the deck and "Coming up" still work.
- **Offline creation**: the draft is kept locally like other card drafts; notices are scheduled only once it's saved.

## Requirements *(mandatory)*

### Functional Requirements

**Event card**

- **FR-001**: The system MUST support a new card type, Event, whose content is the same as a text note (title, body, categories, sources, under the same body and payload limits) plus a **start** (a moment, or a date for all-day events), an optional **end** (not before the start; a date for all-day events), the creator's **time zone**, an optional **location** (up to 200 characters) and an optional **link** with the same preview, stored preview image and link checks as a link card.
- **FR-002**: The start MUST be no more than 5 years ahead; a start in the past MUST be allowed. These bounds MUST be enforced by the server, not only by the editor.
- **FR-003**: Events MUST be creatable and editable in the existing card editor by roles that can create and edit cards. Changing an existing card's type to or from Event is out of scope.

**Visibility**

- **FR-004**: An event MUST follow the same visibility rules as any other card: visible to every member who can read its deck and category from publication, on every read path (deck list, category views, favorites, link flags, Browse, search and Ask, card page, share preview). Events are never hidden by time.
- **FR-005**: On a public deck an event MUST appear on public pages, public search and the public read API with its title, body, date and time, time zone, location and link preview. Its notification audience, picked people and mutes MUST never be served to anonymous visitors or appear in share previews.
- **FR-006**: Search MUST find events by title, body, location and link title, like other cards.

**Status over time**

- **FR-007**: Every event card MUST show its current status relative to the viewer's clock: upcoming (with how long until it starts), today (with the start time), happening now (between start and end), or ended. The status MUST update without the member editing anything.
- **FR-008**: A timed event MUST show its times in the viewer's time zone, with the event's own zone noted when it differs; an all-day event MUST show the same dates to everyone.
- **FR-009**: Ended events MUST stay in the deck like any card; nothing archives them automatically.

**Notifications**

- **FR-010**: An event MUST have zero to three **notify before** times, each an amount and unit (minutes, hours or days; 0 = at the start; at most 365 days), defaulting to one time of 1 day. For all-day events the unit is days only and notices go out at 09:00 in the event's time zone.
- **FR-011**: An event MUST have an **audience**: everyone who can read it (default), specific deck members (any role, readers included), only the creator, or nobody. On the personal deck it is fixed to only the creator. People who can't currently read the event's deck and category are never notified, whatever the audience says.
- **FR-012**: At each notify time of a published event, the system MUST notify every audience member who hasn't muted it, once by push on each device they registered, linking straight to the event.
- **FR-013**: Event push notifications MUST carry only the title, deck name, start (in the event's time zone), location and link to the card: no body text.
- **FR-014**: A notice MUST be sent at most once per person, channel (each push device counts as one), event and notify moment, including after retries, restarts or downtime. Moving the start produces new notify moments; editing anything else never re-sends.
- **FR-015**: A notice whose moment had already passed when the event was saved, published, restored or undeleted MUST NOT be sent. A notice missed because of downtime MUST be sent late only if the event hasn't started yet; otherwise it is skipped.
- **FR-016**: Proposed, archived and deleted events MUST send nothing.
- **FR-017**: Event notices MUST NOT be sent by email in this feature. Push follows the existing per-device setting; a member with no push device gets no event notice (the deck and the notification area still show the event).
- **FR-018**: Any member in an event's audience MUST be able to mute and unmute notices for that event for themselves only. Mutes are private to the member.
- **FR-019**: Only the creator MUST be able to change an event's audience and notify times, except that the deck's owners may change them once the creator is no longer a member.

**Notification area**

- **FR-020**: The notification area MUST list, in a "Coming up" section, events the member would be notified about (in the audience, not muted, can read it), from the event's first notify time until it ends, soonest start first. Each entry shows the title, deck, start and location and opens the event.
- **FR-021**: Events MUST NOT turn on the bottom bar's alert light or count toward its pending number; only items that need action do.

**Calendar export**

- **FR-022**: Members who can read an event MUST be able to download it as a standard calendar file (title, start, end or default length, time zone, location, link to the card and the event's own link), importable by common calendar apps, including offline for a card already loaded.

**Ingestion**

- **FR-026**: Ingestion MUST propose an Event when the shared page or text describes exactly one event with a readable start. It MUST use the page's structured event data when present, and otherwise the extraction's reading of the content. It MUST NOT invent a date that isn't in the source. A share with no readable date stays a link or text card.
- **FR-027**: A proposed event MUST take its time zone from the sharer's device when the share carries one, else from an operator default. It MUST read date-only starts as all-day events. It MUST pass the same rules as an editor-made event (FR-001, FR-002), and fall back to a link card when it doesn't.
- **FR-028**: A proposed event MUST get the default notify settings (1 day before, everyone who can read it; only the creator on a personal deck), send nothing while proposed (FR-016), and be editable in review like any proposal, including its notification settings.
- **FR-029**: A shared event MUST auto-publish only under the existing auto-publish rules, and only when its start came from the page's structured event data and its time zone from the sharer's device. Otherwise it MUST stay in review, with the reason recorded.
- **FR-030**: Duplicate detection for a shared event MUST compare only with events: the same link and the same start date is a possible duplicate. Shares of other types MUST never be flagged as duplicates of an event.

**Records and limits**

- **FR-023**: Creating, editing (field names only, including audience and notify times), archiving, restoring and deleting an event MUST appear in the deck's activity log like other card changes.
- **FR-024**: Every notification decision (planned, skipped because the person muted, has no push device, is not eligible, or the event already started; sent, retried, failed, device removed), every mute and unmute, every refused audience change, and every ingestion decision about an event (proposed as an event, fell back to another type, held in review and why) MUST leave a named record identifying people by id only, per the project's accountability rules.
- **FR-025**: Limits that shape the experience (most notify times, longest notify-before, furthest start, location length, the all-day notice hour) MUST be operator-tunable with documented defaults.

### Key Entities

- **Event**: a card of type Event. Has the text-note content plus start, optional end, all-day flag, time zone, optional location, optional link and its preview, notify-before times, and an audience (and its picked members).
- **Event notice**: one scheduled moment for one event, derived from its start and one notify-before time; records whether it has been planned, so it's sent at most once.
- **Event mute**: one member's choice not to be notified about one event.
- **Notification delivery** (from 037): one attempt to notify one person through one channel; now for either a reminder deadline or an event notice.
- **Pending item** (from 037): what the notification area lists; gains a "coming up" event kind that doesn't light the bell.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A member can create an event with a date, location, link and default notifications in under 1 minute.
- **SC-002**: 99% of event notices reach the push service within 2 minutes of their notify moment, under normal operation.
- **SC-003**: Each audience member receives exactly one push per enabled device per notify moment across 100 runs that include a worker restart at that moment; muted members receive none, and no event email is ever sent.
- **SC-004**: No anonymous visitor or share preview can learn an event's audience, picked people or mutes, verified by tests on every public path.
- **SC-005**: An event's status line is correct for viewers in at least three time zones at each phase (upcoming, today, now, ended), including across a daylight saving change.
- **SC-006**: An exported event imports into the three most common calendar apps with the correct date, time, location and link on the first try.
- **SC-007**: With only events in "Coming up", the bell's alert light is off in 100% of checks.
- **SC-008**: Shared pages that carry structured event data are proposed as Events with the page's date: every event-page fixture in the committed ingestion test set is proposed as an Event with the right date, and no article fixture is.

## Assumptions

- **Audience = readers**: by default everyone who can read the event's deck and category is notified, because an event asks nothing of them (unlike a reminder, where only dismissers are notified).
- **Bell stays for actions**: events are listed under "Coming up" but never light the bell.
- **Public decks show events**: an event is ordinary content on a public deck; only who gets notified is private.
- **Default length**: an event without an end lasts one hour (timed) or its start date (all-day) for its status and calendar export.
- **All-day notice hour**: 09:00 in the event's time zone, operator-tunable.
- **Missed notices**: notices whose moment passed before the event existed, was published or was restored are skipped, not sent at save time; downtime notices are sent late only before the start.
- **Mutes are per event**: there is no per-deck or global "mute all events" beyond turning push off per device.
- **Push only**: events notify by push and the notification area; there is no event email and no new account setting.
- **Calendar export** is a file download; there is no subscription feed or sync.
- **Ingestion** proposes events from shared pages and text (User Story 7). **Bulk import** (notes files) doesn't create events in this feature: its format has no date syntax.
- **New card types include ingestion**: every new card type is proposed by ingestion when a share is recognised as one.
- **Deadline precision** is to the minute, as for reminders.

## Out of Scope

- Email notices for events (push and the notification area only for now).
- Recurring events.
- RSVPs or "going" lists.
- Calendar sync or subscription feeds.
- "Event moved" or "event cancelled" notices.
- Automatically archiving ended events.
- Converting another card to or from an Event.
- Bulk import (notes files) creating events.
- One share proposing several events (a season's schedule page): it stays a single link card.
- "Add to calendar" on the no-JavaScript public pages.
