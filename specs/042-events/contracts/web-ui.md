# Web UI contract: Events

All actions render through `ui/buttons` with icons from `ui/icons` (new icons: `calendar`,
`calendar-plus`, `map-pin`, `bell-off`).

## Composer: type "Event"

- **Type picker**: the `Event` tile goes after `Reminder` in `CREATABLE_TYPES`. Hint: "A date, a place,
  and a heads-up". The fields load lazily from `fields/registry.ts`, as the reminder's do.
- **Fields**:
  - **Text**: title and body, as a text card.
  - **When**: the "All day" switch, then:
    - all day off: `Starts` and `Ends (optional)` as `datetime-local` in the device zone;
    - all day on: `date` inputs.

    The device zone is shown as a note ("Times in Asia/Jerusalem").
  - **Where**: `Location (optional)` with a counter at 200.
  - **Link (optional)**: the link card's URL field, preview fetch and photo, reused through an adapter
    over `LinkEditorFields` (D356).
  - **Notifications**, a collapsed section that shows its summary: "1 day before · Everyone who can read it".
    - "Notify before": up to three rows of an amount and a unit. The unit select is hidden for all-day
      events (days only), and 0 is labelled "At the start". "Add a time" is disabled at 3. Each row can
      be removed.
    - A hint lists moments that are already past: "1 day before is already past and won't be sent"
      (`eventNoticeMoments` with the device clock).
    - "Who gets notified": radio buttons for Everyone who can read it / Specific people (a checkbox list
      of all members, readers included) / Only me / Nobody. The choice is hidden on the personal deck.
    - Read-only when `canEditNotify` is false, with the note "Only the person who made this event can
      change its notifications".
- **Client checks** mirror the server: a start is required, the end comes after the start, the start is
  at most 5 years ahead, the location is within the limit, and there are at most 3 times. The server
  stays authoritative; the 409 `event-notify-locked` and 422 problems map to field messages.
- **Drafts**: kept in IndexedDB like the other types. Nothing is scheduled until the draft is saved.

## Card (list, Browse, card page)

- **Status line** over the body, re-rendered every minute (`useMinuteClock`), from `eventPhase`:
  - "In 3 days · Thu 3 Dec, 18:00", "Tomorrow · 18:00", "Today · 18:00";
  - "Happening now · until 20:00" (accent tone);
  - "Ended · Thu 3 Dec" (muted tone);
  - all-day: "Thu 3 Dec" or "Thu 3 – Sat 5 Dec".

  When the viewer's zone differs from the event's, the line notes the event zone: "18:00 (16:00 London
  time)".
- **Location**: shown with the `map-pin` icon. **Link**: shown as the link card's preview block
  (`LinkCard` parts, `CloudImage`) plus `LinkHealthBadge`.
- **Actions** (card action bar, member pages):
  - **Add to calendar** (`calendar-plus`) downloads `<title>.ics`, built client-side, and works offline.
  - **Mute** (`bell-off`) / **Unmute**, shown only when `inAudience`. The labels are "Don't notify me
    about this event" / "Notify me about this event". The action is disabled offline with a note.
- **Browse**: the same status line and location, with the link preview in full view.

## Notification area (`/notifications`)

- The sections are, in order: "Waiting on you" → **"Coming up"** → "Upcoming".
- A "Coming up" entry shows the title, the deck, the start (status-line wording) and the location, and
  links to `/i/$itemId`.
- Coming-up entries never light the bell's dot or count toward its `aria-label`.
- Offline: the same "Showing the last known list" note as today.
- Empty state: when all three sections are empty, the existing "Nothing waiting on you" message shows.

## Sharing and review

- **Share target, paste box**: send `timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone` with
  `POST /ingest`. The iPhone Shortcut docs add an optional "Time zone" field (D374).
- **Share result**: when the proposal is an event, it reads "Proposed as an event: Thu 3 Dec, 18:00".
  When it was held, it adds "Check the date and time before publishing" (D375, D377).
- **Review queue**: event proposals render through `EventCard` (status line, location, link). Opening
  one shows the card editor with the Event fields, and Notifications are editable while the card is
  proposed. A possible duplicate shows the existing "Possible duplicate" note linking the matching event.

## Public pages (no JS)

- The date and time are shown in the event's zone with the zone named, plus the location and the
  link preview.
- There is no status, mute or calendar action.
