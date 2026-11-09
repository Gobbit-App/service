# Events (042)

Plan: [`specs/042-events`](../../specs/042-events/plan.md) · Decisions D356–D378 ·
[ADR-076](../adr.md#adr-076-event-cards-a-trigger-synced-schedule-one-notice-row-per-moment-on-the-shared-notify-tick-d358d361)

An event is a card type (`type = 'event'`) with a date or a time, an optional location and link,
and notify-before times that send a push to the event's audience. It shows its status over time
(in 3 days, today, now, ended), exports to a calendar file and is proposed by ingestion when a
share describes one dated event.

## Data model (D356–D359)

- **Payload** (strict Zod, `@gobbit/shared/events-cards`):
  `{ allDay, start, end?, timeZone, location?, url?, preview?, notify: { before[], audience } }`.
  - `url` and `preview` have the link card's shape at the top level, so link plumbing reads the
    same JSON paths (D356, D372).
  - Timed events store ISO instants with an offset; all-day events store `YYYY-MM-DD` dates. The
    IANA `timeZone` is always stored (D357).
- **`event_cards`** (migration `0022_events`): one row per event item, kept in step with the payload
  by the `items_event_sync` trigger. `starts_at`/`ends_at` are the effective span: a timed event
  without an end lasts 1 hour; an all-day end is exclusive (the day after, 00:00 in the zone). A
  CHECK enforces `ends_at > starts_at`; a partial index on `ends_at` serves Coming up (D358).
- **`event_notices`**: one row per notify moment per start, unique on
  `(item_id, starts_at, before_amount, before_unit)`, `state` `pending | planned | skipped`.
  - The moments come from the pure `eventNoticeMoments()`: minutes and hours are exact, days keep
    the wall-clock time in the zone across DST, all-day events notify at
    `EVENT_ALLDAY_NOTICE_HOUR` on day D − N.
  - `createEventNoticeHook` syncs them inside the item's transaction on create, update, publish,
    restore, undelete, review publish and ingestion merge: stale `pending` rows are deleted, new
    ones inserted `ON CONFLICT DO NOTHING` (a planned time is never re-sent), and moments already
    past are stored `skipped` with `past_at_save`, `past_at_publish` or `past_at_restore` (D359).

## Notifications (D360–D362)

- **One tick**: `notify.service.tick()` runs `planReminders()` → `planEvents()` → `deliver()` on
  the existing `reminder-sweep` queue (every minute, singleton).
- **Claim**: `planEvents` claims `pending` notices that are due, whose item is published and live
  and whose `starts_at` still matches `event_cards`, `FOR UPDATE SKIP LOCKED` up to
  `REMINDER_SWEEP_BATCH`. A notice found later than
  `greatest(starts_at, fire_at) + EVENT_NOTICE_GRACE_MINUTES` is `skipped · started`.
- **Deliveries**: `notification_deliveries` gained `kind` (`reminder | event`) and `notice_id`, with
  the unique key `(item_id, kind, notice_id, deadline, user_id, channel, target) NULLS NOT
  DISTINCT`. Events plan push rows only. `stillDue` re-checks lifecycle, start, audience, access
  and mute before each send; retries, `gone` and `interrupted` are the reminder rules.
- **Audience** (`eventAudience`, shared): `everyone`, `people` (plus the creator), `me` or `nobody`,
  intersected with current read access and category visibility. The personal deck is forced to
  `me`; there is no owner fallback. The sweep, `stillDue` and Coming up call the same function.

## Who changes what (D363, D364)

- **Notify settings**: only the creator, or owners and co-owners while the creator is not a live
  member, may change `payload.notify`; anyone else gets 409 `event-notify-locked` and nothing in
  the patch is applied. While the card is a proposal, publishers may change it. The DTO carries
  `event.canEditNotify`; the editor shows the section read-only otherwise.
- **Audience ids** must be live members (422 `event-audience-unknown-member`).
- **Mutes**: `PUT`/`DELETE /items/{id}/mute` (204, idempotent) write `event_mutes`; unmute keeps
  the row with `muted = false`. Readers outside the audience get 409 `event-not-in-audience`,
  other card types 409 `not-an-event`. `event.muted` is in the caller's DTO only; nothing lists
  other people's mutes. Unmuting never resends what was skipped.

## Reading paths (D365–D369)

- **Public, share previews, search, Ask**: content only. `eventPublicPayload()` copies
  `allDay, start, end, timeZone, location, url, preview` (link markers stripped), never `notify`.
  Public pages show the date in the event's own zone with no relative status (they are cached).
  `item_search_text` and `payloadText()` index location, url and the preview title and
  description only.
- **Coming up**: `GET /me/pending` gained `comingUp`: published, live events from the first notice
  until the end, filtered by audience and mute, sorted by start. The bell ignores it.
- **Status**: `eventPhase` and `formatEventWhen` in `@gobbit/shared/event-time` (zod-free) plus the
  web `useMinuteClock()`; the server never computes a status.
- **Calendar file**: `@gobbit/shared/ics` writes one `VEVENT` (UTC instants for timed events,
  `VALUE=DATE` with an exclusive end for all-day ones); the web app builds it in a lazy chunk, so
  it works offline.
- **Activity log**: `diffFields` reports `when`, `location`, `link` and `notify` for events.

## Web

- The composer's Event fields (`editor/fields/EventFields.tsx`, `event-draft.ts`) start a new event tomorrow at 18:00 in the device
  zone with the default notify times; the link part reuses `LinkEditorFields`.
- The card (`cards/EventCard.tsx`; styles, calendar export and mute in `event-cards/`) shows the status line, location, link
  preview and "Add to calendar" in its bar; Mute/Unmute sits in "More actions".
- `/notifications` renders Coming up between Waiting on you and Upcoming.

## Ingestion (D370, D374–D378)

- **Structured data first**: `fetch/structured-event.ts` reads the page's one schema.org `Event`
  (or `*Event`) node from JSON-LD into `normalized.structuredEvent`; several nodes set only
  `structuredEventCount`. It goes to the model as escaped `<event_data>`.
- **Validation** (`ai/extract-validate.ts`): structured dates and location override the model's.
  `parseEventStart` reads a date-only start as all day, an offset as an instant and a local
  date-time in the resolved zone. A proposal with no start, several events, a start out of range,
  an end before the start, a bad zone or an invalid payload falls back to a link card (text
  without a URL). A date is never invented.
- **Zone** (D374): `POST /ingest` takes an optional IANA `timeZone` (stored in `raw`); the share
  target, paste box and iPhone Shortcut send it. Otherwise `INGEST_DEFAULT_TIME_ZONE`.
- **Auto-publish** (D375): only with `dateSource = structured` and `zoneSource = request`;
  otherwise `held_event_unverified` (migration `0023_events_ingest` widens the CHECK).
- **Dedup** (D376): events are compared only with same-deck events on the same start date (in
  the event's zone), by link and then by normalized title; no vector arm. Non-events never match
  events.
- **Web** (D377): the share result reads "Proposed/Published as an event: Thu 3 Dec, 18:00"; review
  renders event proposals as event cards, and "Edit fully" opens the event editor.
- **Direct proposals** (MCP, bulk import) stay `text | link | image` (`directCardTypes`).

## Limits and runbook (D371)

The defaults live in `@gobbit/shared/event-constants`. The four caps may only be lowered by env
(the DB CHECKs hold the shared caps). An out-of-range value or an unknown zone stops the API and
the worker at boot.

| Env var | Default | Meaning |
| --- | --- | --- |
| `EVENT_NOTIFY_TIMES_MAX` | 3 | most notify-before times per event (cap) |
| `EVENT_NOTIFY_BEFORE_MAX_DAYS` | 365 | longest notify-before (cap) |
| `EVENT_START_MAX_DAYS` | 1826 | furthest start, about 5 years (cap) |
| `EVENT_LOCATION_MAX` | 200 | location length in code points (cap) |
| `EVENT_ALLDAY_NOTICE_HOUR` | 9 | hour (0–23, event zone) of all-day notices |
| `EVENT_NOTICE_GRACE_MINUTES` | 5 | how late after the start a notice may still be sent |
| `INGEST_DEFAULT_TIME_ZONE` | `UTC` | zone of a shared event whose share carries none |

The 037 settings `REMINDER_SWEEP_BATCH`, `NOTIFY_MAX_ATTEMPTS` and `NOTIFY_RETRY_BASE_SECONDS`
apply to event deliveries unchanged.

- **Sweep lag**: `event.notice` `skipped · started` above 10 % of planned per hour means the tick
  falls behind; raise `REMINDER_SWEEP_BATCH` or check the worker.
- **Zone fallback**: `ingest.event_extract` with `zoneSource = fallback` above half of event
  proposals per day means a sender stopped passing `timeZone`.

## Decision events

| Event | Outcomes · reasons |
| --- | --- |
| `event.notice` | `planned`; `skipped` · `started`, `stale`, `muted`, `no_channel`, `ineligible`, `push_off`; delivery `sent`, `retried`, `failed` (warn), `interrupted`, `gone`, `dropped` |
| `event.mute` | `muted`, `unmuted`, `refused` (warn) · `not_in_audience`, `not_an_event` |
| `event.notify_settings` | `changed`, `refused` (warn) · `not_creator` |
| `event.write` | `refused` · `start_too_far`, `location_too_long`, `too_many_times`, `before_too_long`, `audience_unknown_member`, `type_change` |
| `ingest.event_extract` | `event_proposed` (`dateSource`, `zoneSource`); `event_fallback` · `no_start`, `start_out_of_range`, `end_before_start`, `several_events`, `invalid_zone`, `invalid_event` |

Audit rows: `event_notices` (`skip_reason`), `notification_deliveries` (`kind = event`),
`event_mutes`, `item_events` (`notify` in `changes`), `ingest_jobs.auto_publish`
(`held_event_unverified`) and `ingest_jobs.dedup`. Ids only.

## Deviations from the 042 plan

From [`specs/042-events/implementation-notes.md`](../../specs/042-events/implementation-notes.md):

- Notices are synced while an event is proposed (T027 said none); delivery skips stale lifecycles
  with `stale`, so a proposal still sends nothing.
- Status codes: the schema answers 400 for an end not after the start and for location or notify
  shape errors; env-tunable limits answer 422 `/problems/validation` with a field path; every
  type change answers 409 `type-change-not-supported` (`type` joined `itemPatchSchema`); a link
  check on a card without a url stays 422 on `type`.
- The `event_cards` index predicate uses `IS NOT NULL`, and the payload CHECK uses `coalesce` for
  absent keys.
- Ingestion merges and review publish sync notices but don't enforce the notify lock (the agent
  never changes `notify`).
- `linkImageBackfillCandidates` stays link-only (the 041 one-time pass predates events).
- T022's media-sweep case is covered by the existing `assets.unreferenced` int test.
- The smoke journey lives in `smoke/editor.spec.ts`; the ICS download is in `full/events.spec.ts`.
- Mute/Unmute is in the card's "More actions" menu, not the bar.
- T061's tests are in `EventFields.test.tsx`; there is no `EventNotifyFields.test.tsx`.
- "Nothing waiting on you" still keys off `items`; the screen reads `comingUp ?? []` for lists
  persisted before 042.
- T074's `@full` coverage is narrower: Add to calendar, Coming up and mute/unmute; the rest is in
  editor unit tests and API int tests.
- Migration `0023_events_ingest` widens the `auto_publish` CHECK (the plan had no US7 migration).
- An extra fallback reason, `invalid_event`, for a payload that passes the time checks but fails
  the shared schema.
- `directCardTypes` keeps MCP and bulk-import proposals non-event.
- No MCP `timeZone`: there is no MCP ingest tool yet (Phase 13).
- `resolveEventZone` lives in `ingest/event-extract.ts`, next to its decision log.
- `eventDedupVerdict` returns the verdict itself (no vector arm to feed `dedupVerdict`).
- A published share reads "Published as an event: …".
- The Shortcut sends its zone from Format Date with the custom format `VV`.
- T098 edits the notify time through "Edit fully"; the inline review form edits only title, body
  and categories.
