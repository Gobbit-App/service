# Quickstart: validating events

Shapes and rules: [data-model.md](data-model.md), [contracts/api.md](contracts/api.md),
[contracts/web-ui.md](contracts/web-ui.md). Decisions: [research.md](research.md).

## Setup

```bash
pnpm install && pnpm db:migrate && pnpm dev
# push (optional, as for reminders): VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT in .env
# without them, events save and show, and every notice is skipped with reason push_off
```

## Automated

```bash
pnpm test:unit     # payload schema, eventSpan, eventNoticeMoments (DST, all-day hour), eventAudience,
                   # canEditEventNotify, eventPhase/formatEventWhen, toIcs, editor fields, card status line
pnpm test:int -- events notify pending public link   # trigger sync, notices, sweep at-most-once,
                   # grace, mutes, notify lock, Coming up, public/search allow-list, link plumbing, down file
pnpm test:e2e -- --grep @smoke editor                # create event → see it in the deck (smoke/editor.spec.ts)
pnpm test:e2e -- --grep @full events                 # notifications, Coming up, mute, ICS, roles, review an event proposal
pnpm test:int -- ingest-events                       # share → Event proposal, fallback, zone, auto-publish hold, dedup (fake extractor)
```

## Manual

1. **Create**: in a shared deck, add an Event that starts in 20 minutes and lasts 1 hour, with a location
   and a link. Notify 15 minutes before and at the start, sent to "Everyone who can read it". The card
   shows "Today · HH:MM", the location and the link preview.
2. **Notify**: after about 5 minutes, every member with push on gets one push (title, deck, start,
   location). The event appears under "Coming up" on `/notifications`, and the bell stays dark. At the
   start, the second push arrives and the card reads "Happening now · until …".
3. **Mute**: as a reader, choose Mute. No further pushes arrive and the event leaves your "Coming up".
   Unmute it, and it comes back.
4. **Lock**: as a writer who isn't the creator, open the editor. The Notifications section is
   read-only, and a forced `PATCH` with a changed `notify` → 409 `event-notify-locked`.
5. **Move**: as the creator, move the start 1 day later. New notices are scheduled, and moments that
   were already sent for the old start are not re-sent for that start.
6. **Late**: create an event that starts in 2 minutes with "1 day before". The editor says it will be
   skipped, and no push is sent for it.
7. **All day**: create a 2-day all-day event with "1 day before". The notice fires at
   `EVENT_ALLDAY_NOTICE_HOUR` in the event's zone, and the card reads "Thu 3 – Fri 4 Dec".
8. **Calendar**: choose Add to calendar and import the `.ics` into a calendar app. The times match,
   and the all-day event spans the right days.
9. **Public**: make the deck public and open `/p/<slug>/i/<id>`. The date shows in the event's zone with
   the location and link. There is no audience and no relative status, and the
   `/public/<slug>` JSON has no `notify`.
10. **Personal deck**: on `/d/me`, the audience choice is hidden and only you are notified.
11. **Share an event page** (needs an AI key): share a public page for a concert or class that carries
    schema.org `Event` data. The share result reads "Proposed as an event: …" with the page's date, and
    the proposal shows the location and link preview. Publish it, and its notices are scheduled.
12. **Share an article**: share a news article. The proposal is a link card, as before.
13. **Duplicate**: share the same event page again. The new proposal is flagged as a possible duplicate
    of the first. A page for the same series on a different date isn't flagged.
14. **No zone**: send `POST /ingest` with an event URL and no `timeZone`. The proposal uses
    `INGEST_DEFAULT_TIME_ZONE` and waits in review with "Check the date and time".

## Watching it

Log query `event = "event.notice"` grouped by `outcome`/`reason`. A rising share of `skipped/started` means
the sweep is lagging, and `failed` above 5 % per hour raises the existing push alert.

For ingestion, query `event = "ingest.event_extract"` grouped by `outcome`/`reason`, and the share of
`zoneSource = fallback`. A high fallback share means a sender isn't passing `timeZone`.
