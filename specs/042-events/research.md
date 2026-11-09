# Research: Events (042)

Decisions continue the project-wide `D` series. This feature reserves **D356–D375** (recorded in
`specs/README.md` so `042-checklists`, planned in parallel, starts after it). Each entry: decision,
rationale, alternatives considered.

The starting point is 037 (reminders): `reminders` + `notification_deliveries` +
`push_subscriptions`, the per-minute `reminder-sweep` (`notify.service` plan → deliver), the
`safe-push` client and `GET /me/pending`. Link cards bring the preview, the stored snapshot
(`link-snapshot`) and link checks (`link-check-sweep`). The repo has no date, time-zone or calendar
library; everything uses `Intl` and `Date` (`editor/reminder-draft.ts`, `reminders/reminder-status.ts`).

---

## D356 — Event payload: flat, link fields at the top level

**Decision**: `type = 'event'`, payload (strict Zod, `@gobbit/shared/events-cards`):

```text
{ allDay, start, end?, timeZone, location?, url?, preview?, notify: { before[], audience } }
```

`url` and `preview` have exactly the link card's shape and sit at the top level.

**Rationale**: about 15 places read `payload->>'url'` and `payload #>> '{preview,…}'`: the snapshot job, its
enqueue check, the link-check sweep, backfills, `assets.repo` orphan detection, `public-dtos`, the
review diff and others. With the same paths, wiring the event in is a matter of widening `type = 'link'` to a
type set (D372), not rewriting JSON paths per type.

**Alternatives**: a nested `link: { url, preview }`. It's cleaner to read, but every JSON path then
needs a per-type branch, and a missed one silently loses the snapshot (media-sweep would delete it).

## D357 — Time representation

**Decision**:

- Timed events store `start` and `end` as ISO instants with offset (the reminder `deadline` format).
- All-day events store `YYYY-MM-DD` dates.
- `allDay` picks which form applies, enforced by a Zod refine plus a DB CHECK.
- `timeZone` (IANA, validated with `Intl` as for reminders) is always stored. For timed events it is the
  zone noted next to the viewer's time when the zones differ. For all-day events it is the zone the 09:00
  notices and the "now" span are computed in.

**Rationale**:

- An instant is unambiguous for timed events.
- A floating date is what "the same dates for everyone" means for all-day events (US1-3, FR-008).
- Keeping the zone lets "N days before" keep the wall-clock time across DST (edge case).

**Alternatives**:

- A local wall-clock time plus a zone for timed events. It's ambiguous at DST gaps, and every reader
  would have to convert it.
- UTC midnight for all-day events. That shows the wrong day west of UTC.

## D358 — `event_cards`: server-owned schedule, synced by trigger

**Decision**: one row per event item, `event_cards (item_id PK, deck_id, all_day, starts_at,
ends_at, time_zone)`. The AFTER trigger `items_event_sync` keeps it in step with the payload, the way
`items_reminder_sync` does. The values are as follows.

`starts_at`:

- timed: `start::timestamptz`;
- all-day: `start::date::timestamp AT TIME ZONE time_zone`.

`ends_at` is the *effective* end (exclusive):

- timed: the end if given, else start + 1 hour;
- all-day: (end date, or the start date) + 1 day, at 00:00 in the zone.

A CHECK enforces `ends_at > starts_at`. A partial index on `(ends_at)` serves "Coming up".

**Rationale**:

- Queries ("Coming up", the sweep's started check, status) need real timestamps.
- A trigger keeps them correct whatever writes the item (constitution III), as 037 does.
- The 1-hour default length is a spec assumption and is not operator-tunable (FR-025 doesn't list it).
  That lets it live in SQL.

**Alternatives**:

- Computing the timestamps in every query from jsonb. The expressions repeat and can't be indexed.
- Generated columns on `items`. That adds event-only columns to every card.

## D359 — `event_notices`: one row per notify moment, written by the service in the item's transaction

**Decision**:

- **Table**: `event_notices (id, item_id, starts_at, before_amount, before_unit, fire_at, state,
  skip_reason, planned_at)`, unique `(item_id, starts_at, before_amount, before_unit)`. `state` is one of
  `pending | planned | skipped`.
- **Moments**: a pure shared function `eventNoticeMoments(event, limits)` computes them:
  - minutes and hours are exact durations;
  - days keep the wall-clock time in `time_zone` (computed with `Intl`, tested across DST);
  - all-day events: day D − N at `EVENT_ALLDAY_NOTICE_HOUR` (default 09:00) in the zone.
- **Sync**: `items.service` runs `eventHook` (the 037 `reminderHook` pattern, `inTx`) on create, update,
  publish, restore and undelete. `events.repo.syncNotices(itemId, moments, now, phase)`:
  1. deletes `pending` notices that are no longer in the set (a removed notify time, or the old start
     after a move);
  2. inserts new ones `ON CONFLICT DO NOTHING`, so a time already planned for the same start is never
     re-sent (FR-014, edge "notify times changed");
  3. marks every `pending` notice with `fire_at <= now` as `skipped / past_at_save`, or `past_at_publish`
     or `past_at_restore` depending on the phase (FR-015).
- **Item state**: proposed, archived and deleted items keep their notices, but the sweep claims only
  published, live items (FR-016). Archive and delete need no hook.

**Rationale**:

- The moments depend on an operator-tunable hour and on "now". A trigger can't read env, and the "skip
  if already past" rule depends on the lifecycle step. So the computation is a tested pure function and
  the write is in the same transaction as the item.
- A row per moment gives at-most-once planning (`state` moves `pending → planned` in the claim
  transaction) and a reviewable record of every skip.

**Alternatives**:

- A trigger that computes the moments. It can't read the env hour, and it duplicates the DST logic in SQL.
- One pg-boss send-at job per moment. Jobs must then be cancelled on every edit, and the record is
  split between pg-boss and our tables. 037 chose a sweep for the same reasons.

## D360 — One sweep: events join the existing notify tick

**Decision**:

- **Sweep**: `notify.service.tick()` becomes `planReminders()` → `planEvents()` → `deliver()`. The queue
  name `reminder-sweep` and its schedule (every minute, singleton) are unchanged.
- **Claim**: `planEvents` claims `pending` notices with `fire_at <= now()` whose item is published and
  live, and whose `starts_at` still equals `event_cards.starts_at`, with `FOR UPDATE SKIP LOCKED` up to
  the batch. It sets `state = planned`.
- **Late notices** (downtime rule, FR-015): a notice is planned only while
  `now() < greatest(starts_at, fire_at) + EVENT_NOTICE_GRACE_MINUTES` (default 5). Otherwise it is
  `skipped / started`. The grace keeps "at the start" notices (and all-day 09:00 notices, which fall
  after the day's 00:00 start) from being skipped by sweep jitter.
- **Fan-out**: recipients come from `eventAudience` (D362). Muted members, members with no push device
  and the case where push is not configured are skipped and recorded. One `notification_deliveries` row
  is written per person × device.

**Rationale**: one cron job, one batch, one delivery loop. Retries, `gone` cleanup, `interrupted` and the
host allow-list are reused unchanged. Renaming the queue would only add a deploy step.

**Alternatives**: a separate `event-sweep` queue. That means two jobs racing over the same delivery
rows, for no isolation benefit.

## D361 — Generalise `notification_deliveries` with a `kind`

**Decision**:

- **Columns**: add `kind notification_kind ('reminder','event') NOT NULL DEFAULT 'reminder'` and
  `notice_id uuid NULL REFERENCES event_notices ON DELETE CASCADE`. For an event, `deadline` holds the
  notice's `fire_at`.
- **Constraints**: add the CHECK `(kind = 'event') = (notice_id IS NOT NULL)`. Replace the unique key with
  `(item_id, kind, notice_id, deadline, user_id, channel, target) NULLS NOT DISTINCT`.
- **Delivery code**: `deliver()` resolves its context per kind (a `contexts` map). An event's `stillDue`
  re-checks before each send: the notice is `planned` for the current `starts_at`, the item is published and
  live, the person is still in the audience with read access, and they haven't muted it.
- **Channel**: events plan `push` rows only (FR-012, FR-017).

**Rationale**:

- The existing key can't tell apart two notices with the same fire time (a start moved so that an old
  and a new moment coincide).
- `kind` is the extension point `042-checklists` needs for its auto-archive push. Agreeing on it now
  avoids two incompatible generalisations (see D373).

**Alternatives**:

- A separate `event_deliveries` table. It duplicates the delivery loop, retries and audit.
- Reusing `deadline` alone. That risks collisions, as explained above.

## D362 — Audience: a pure rule over current read access

**Decision**: `eventAudience({ creatorId, mode, userIds, members, categoryVisibilities, personal })` in
`@gobbit/shared/events-cards`, mirroring `reminderDismissers`:

- **Modes**:
  - `everyone`: every live member;
  - `people`: the picked members plus the creator;
  - `me`: the creator;
  - `nobody`: an empty set.
- **Filter**: candidates are then kept only if `can(role, 'item.read')` and they can see at least one of
  the card's categories (`category.read_private`, or a non-private category).
- **Personal deck**: the audience is forced to `me`.
- **No fallback**: unlike reminders, there is no owner fallback; "nobody" means nobody.

It is used in three places: the sweep (plan), `stillDue` (send) and "Coming up" (read).

**Rationale**: the same in-memory approach as 037 (`deckMembers` + `categoryVisibilities` from
`reminders.repo`), so access is the current one at each moment (FR-011, US4-7, edge "category made
admins-only"). One function, three callers, no drift.

**Alternatives**: an SQL audience query built on `visibleCategoriesWhere`. That predicate takes the caller
as a single role; the audience needs it evaluated per member.

## D363 — Who may change notify times and the audience

**Decision**:

- **Rule**: `payload.notify` may differ from the stored value only when the caller is the creator, or an
  owner or co-owner of the deck while the creator is not a live member (FR-019, edge "creator leaves").
- **Refusal**: anyone else who sends a different `notify` gets `409 application/problem+json` (`type …/event-notify-locked`).
  Other fields of the same patch are not applied (one atomic save). The editor shows the
  section read-only, so this is a backstop.
- **Validation**: `people` ids must be live members of the deck (`422 event-audience-unknown-member`).
- **Personal deck**: forced to `me` on create and update, with no error.

**Rationale**: the rule lives in a service (constitution I); the UI only reflects `event.canEditNotify` in
the item DTO.

**Alternatives**: silently keeping the stored `notify` on a non-creator's save. That makes the change look
accepted when it wasn't (and VIII forbids silent refusals).

## D364 — Mutes: `event_mutes`, private to the member

**Decision**:

- **Table**: `event_mutes (item_id, user_id, muted boolean, updated_at)`, PK `(item_id, user_id)`. Unmute
  sets `muted = false` and keeps the row, so the last change stays reviewable.
- **Routes**: `PUT /items/{id}/mute` and `DELETE /items/{id}/mute`. Both are idempotent and both answer
  `204`.
- **Who may mute**:
  - Readers of the item who are not in the audience get `409 event-not-in-audience`.
  - Non-event items get `409 not-an-event`.
  - Items the caller can't read get `404`.
- **Privacy**: the item DTO exposes `event.muted` for the caller only. No route lists other people's mutes.
- **Effect**: a mute skips notices while it is active (`skipped / muted`). Unmuting doesn't resend
  anything that was skipped (US4-4).

**Rationale**: FR-018 asks for a per-person, per-event mute that is private. Keeping the row (instead of
deleting it) gives the audit row that constitution VIII asks for on durable changes.

**Alternatives**:

- Storing mutes in the payload. That would make them visible to every member and public.
- A per-deck mute. The spec puts it out of scope.

## D365 — Public, share, search and Ask see content only

**Decision**: every non-member path uses an allow-list.

- **Public DTO**: `toPublicItem` gets `eventPublicPayload()`, which keeps `allDay, start, end, timeZone, location,
  url` and `preview` (with the link card's `imageLookup`/`imageRemoved` stripped). `notify` is never copied.
- **Public pages**: `renderEvent` shows the date and time in the event's own zone, labelled with it, plus
  the location and the link preview. It shows no relative status, because the HTML is cached until the
  next write.
- **Share previews**: events are shareable (unlike reminders). The OG description uses the date and
  location, never `notify`.
- **Search**: `item_search_text` gets a `WHEN 'event'` branch that keeps only `location`, `url`,
  `preview.title` and `preview.description`. Dates, the zone, `publicId` and `notify` (user ids) are never
  indexed. `ai/payload-text.ts` mirrors the branch for Ask and embeddings.
- **Members**: they see `notify` (including picked ids) in the member DTO. They are deck members and the
  editor needs it. Mutes are not in `notify`.

**Rationale**: FR-005, FR-006, SC-004. Allow-lists fail closed if a payload key is added later.

**Alternatives**: hiding `notify` from members who aren't the creator. Nothing in the spec asks for
it, and the read-only editor section needs it.

## D366 — "Coming up" in `GET /me/pending`

**Decision**:

- **Response**: `pendingListSchema` gains `comingUp: ComingUpEntry[]`, where an entry is
  `{ kind: 'event', itemId, title, deck{slug,name}, startsAt, endsAt, allDay, timeZone, location }`.
- **Which events**: published, live events in the member's decks whose first notice `fire_at <= now()`
  and whose `ends_at > now()`. They are then filtered through `eventAudience` and the member's mute, sorted
  by `startsAt`, and capped at `PENDING_LIST_MAX`.
- **Bell**: `bellState()` keeps counting `items` only (FR-021).
- **Order on screen**: "Waiting on you", then "Coming up", then the existing "Upcoming" (the member's own
  hidden reminders).
- **Window**: an event with zero notify times never enters the window, because it has no first notice.

**Rationale**: it reuses the existing endpoint, the 60-second refetch, the offline "last known list" and
the service worker's `PENDING_CHANGED` refresh (US5-5) without a second query.

**Alternatives**:

- A separate `GET /me/coming-up`. That's two caches and two offline states.
- Merging events into `items`. That would light the bell.

## D367 — Status over time: one pure function plus a minute clock

**Decision**:

- **Phase**: `eventPhase(card, now)` returns `upcoming | today | now | ended`, plus
  `{ startsIn }`. It lives in `@gobbit/shared/event-time` (zod-free, `Intl` only), together with
  `formatEventWhen(card, viewerTz)`.
- **Meaning of each phase**:
  - "today" uses the *viewer's* calendar day for timed events and the event's dates for all-day events;
  - "now" covers `[starts_at, ends_at)`;
  - beyond 7 days the card shows the date.
- **Web**: a `useMinuteClock()` hook (one shared interval, paused while the page is hidden) re-renders
  event cards.

**Rationale**: FR-007 and FR-008, SC-005. One function serves the card, the list, the notification area
and tests across three zones and a DST change.

**Alternatives**: computing the status on the server. It would go stale between fetches, and stale even
more offline.

## D368 — Calendar file: a small RFC 5545 writer in `@gobbit/shared/ics`

**Decision**:

- **Writer**: a zod-free module `toIcs(event, { cardUrl, now })` writes one `VEVENT`:
  - `UID = <itemId>@gobbit`, `DTSTAMP`, `SUMMARY`, `LOCATION`;
  - `URL` = the card link, and `DESCRIPTION` = the card link plus the event's own link;
  - timed events: `DTSTART` and `DTEND` in UTC (`…Z`);
  - all-day events: `DTSTART;VALUE=DATE`, and `DTEND;VALUE=DATE` = the end date + 1 (exclusive).
- **Formatting**: text is escaped (`\\ ; , \n`) and lines are folded at 75 octets.
- **Download**: the web app builds the file client-side in a lazy chunk and downloads a Blob, so it
  works offline for a loaded card (FR-022, US6-3).

**Rationale**:

- **The `ics` npm package (3.x)** pulls in `yup` and `nanoid` (a second schema library next to Zod) and
  can't emit a `TZID`/`VTIMEZONE` either.
- **`ical-generator`** targets Node and is larger.
- **The format we need** is about 60 lines with a well-defined grammar, unit-tested against fixtures and
  checked by importing into Google Calendar, Apple Calendar and Outlook (SC-006).
- **UTC instants** import as the correct moment in every app. The event's zone is in the description
  text. The trade-off is recorded under constitution VII.

**Alternatives**:

- A server route `GET /items/{id}.ics`. It doesn't work offline (US6-3).
- A `VTIMEZONE` built from tzdata. That would mean shipping tz rules for little benefit.

## D369 — Activity log names the event's sub-fields

**Decision**: add `when`, `location`, `link` and `notify` to `itemEventFields`. For `type = 'event'`,
`diffFields` compares these groups (start, end, allDay and timeZone are `when`) instead of reporting
`payload`. Other types are unchanged. Web copy: "time", "location", "link", "notifications".

**Rationale**: FR-023 asks for the field names, including the audience and the notify times. A bare
"details" would hide a moved start. Only names are stored, never values (ADR-057).

**Alternatives**: keeping `payload`. It's less useful in the log, and FR-023 asks for more.

## D370 — Events are not ingest-dedup candidates

**Decision**: `dedup.repo` excludes `event` from candidates, as it already does for `reminder`. A
shared link card with the same URL as an event is not a duplicate of it. The spec's event-vs-event rule
(same link and same start date) has no producer in this feature, because ingestion and import don't create
events. The rule is noted for the follow-up that lets ingestion propose events (see plan, "Settle before
starting").

**Rationale**: a recurring class page linked by a weekly event must not block sharing the page itself.

**Alternatives**: a new duplicate check in the editor. That's new UI the spec doesn't describe.

## D371 — Limits and env

**Decision**: the defaults live in `@gobbit/shared/events-cards/constants.ts`, re-exported zod-free as
`@gobbit/shared/event-constants`. `env.ts` reads overrides with `cappedInt`, where the env may only lower
the shared cap, which the DB CHECK also enforces:

| Env var | Default | Meaning |
|---------|---------|---------|
| `EVENT_NOTIFY_TIMES_MAX` | 3 | most notify-before times |
| `EVENT_NOTIFY_BEFORE_MAX_DAYS` | 365 | longest notify-before |
| `EVENT_START_MAX_DAYS` | 1826 | furthest start (5 years) |
| `EVENT_LOCATION_MAX` | 200 | location length (code points) |

These two are not caps. The grace minutes use `positiveInt`. The hour can be 0, which `positiveInt`
rejects, so it gets a new `intInRange(0, 23, default)` helper in `env.ts`:

| Env var | Default | Meaning |
|---------|---------|---------|
| `EVENT_ALLDAY_NOTICE_HOUR` | 9 | all-day notice hour, 0–23 |
| `EVENT_NOTICE_GRACE_MINUTES` | 5 | late-send grace after the start (D360) |

The 037 settings `REMINDER_SWEEP_BATCH`, `NOTIFY_MAX_ATTEMPTS` and `NOTIFY_RETRY_BASE_SECONDS` apply to
event deliveries unchanged.

**Rationale**: FR-025 and constitution VIII. The pattern is the same as 037's.

## D372 — Link plumbing by type set

**Decision**: `LINK_BEARING_TYPES = ['link', 'event']` in `@gobbit/shared`. It replaces the
`type === 'link'` checks. An event without a `url` is filtered out by the existing `payload->>'url'` /
`needsLinkSnapshot` guards. The sites are:

- snapshot enqueue and the snapshot job;
- `link-checks.repo.due`, `loadLink` (manual check and dismiss) and `listLinkFlagged`;
- the snapshot and backfill candidates;
- `assets.repo` orphan detection (critical: otherwise media-sweep deletes event snapshots);
- `public-dtos`, `item-dtos` `linkHealth`, `link-preview-fields`, `applied-preview`;
- web `api/link-checks.ts`, `review-diff.ts` and `ReviewEditForm.tsx`.

The partial index `items_link_preview_public_id_idx` is recreated with `type IN ('link','event')`.
`sourceKind` treats an event with a `url` as `link`.

**Rationale**: FR-001 and US1-6: the "same preview, stored preview image and link checks as a link card".

## D373 — Coordination with `042-checklists`

**Decision**:

- **Numbers**: both features are numbered 042 and both add a card type and a migration. Events reserve D356–D375 and
  ADR-076. The migration takes the next free number when it is generated (`0022_events`, or `0023_events`
  if checklists merges first). Drizzle snapshots are regenerated on rebase, never hand-merged.
- **Shared extension points**: `notification_deliveries.kind` (D361) and the `pendingListSchema`
  sections (D366). Checklists add their own `kind` value and their own section.
- **Search**: whichever merges second rebases its `item_search_text` `CASE` branch on top of the other's.

**Rationale**: both specs extend the same delivery key, pending list and search function. Agreeing on the
shape now keeps the second PR a rebase, not a redesign.
