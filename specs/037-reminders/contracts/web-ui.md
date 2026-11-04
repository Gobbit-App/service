# Web UI contract: Reminders

- **Type picker**: `Reminder` after `Text`. Fields: body (as text), **Deadline** (`datetime-local`,
  device zone; stored as an instant + `timeZone`), **Show before** (number + unit select:
  minutes/hours/days; default 24 hours), **Who can dismiss** (radio: Only me / Anyone who can edit
  / Specific people → checkbox list of the deck's writers). Personal deck: the choice is hidden.
  Read-only for non-creators (with a note). Client checks: deadline required and in the future.
- **Card**: body as a text card plus a status line: "Due in 2 days · Tue 5 Nov, 09:00",
  "Overdue by 3 hours" (warning tone), "Done by Dana · resolution", "Dismissed by …", "Shows on
  Mon 4 Nov" for hidden ones. A **Dismiss** action in the card's action bar when `canDismiss` and
  pending.
- **Dismiss dialog** (`ui/Dialog`): large switch "Done" (off), optional "What happened?" textarea
  with counter (600), primary "Mark done" (disabled until Done on), secondary "Dismiss without
  marking done". Offline: both disabled with a note.
- **Upcoming**: `/d/$slug/upcoming`, linked from the deck ⋯ menu for owners/maintainers; lists
  hidden reminders with "Shows …" and "Due …".
- **Bell**: in the bottom bar's main group on every bar page; icon `bell`; light dot `pending`
  (accent) or `overdue` (warning); `aria-label` "Notifications, 2 pending, 1 overdue" or
  "Notifications".
- **/notifications**: "Waiting on you" (pending items) and "Upcoming" (your hidden reminders);
  empty state "Nothing waiting on you"; offline note "Showing the last known list"; each entry
  links to `/i/$itemId`.
- **Settings → Notifications**: "Email me when a reminder is due" switch; push block (only when
  `config.push`): "Turn on notifications on this device" / "Turn off", "Send a test notification",
  explanations for denied permission, unsupported browser and iPhone not installed.
