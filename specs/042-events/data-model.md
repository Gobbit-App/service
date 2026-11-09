# Data model: Events (042)

Migration `0022_events` (renumbered if `042-checklists` merges first, D373) plus a hand-written
`down/0022_events.down.sql`. Compare the new enum value as text inside the migration
(`type::text = 'event'`): a value added by `ALTER TYPE … ADD VALUE` can't be used in the same
transaction.

## Enums

| Enum | Change |
|------|--------|
| `item_type` | add `event` (`packages/shared/src/enums.ts` `itemTypes`; `enums.test.ts` keeps DB ↔ shared in sync) |
| `notification_kind` (new) | `reminder`, `event` |
| `event_notice_state` (new) | `pending`, `planned`, `skipped` |

Non-DB unions in `@gobbit/shared`:

- `eventAudienceModes = ['everyone','people','me','nobody']`
- `eventNoticeUnits = ['minutes','hours','days']`
- `eventNoticeSkipReasons = ['past_at_save','past_at_publish','past_at_restore','started']`. Per-person
  skips (`muted`, `no_channel`, `ineligible`) are decision events, not notice states.
- `itemEventFields` gains `when`, `location`, `link` and `notify` (D369; `item_events.changes` is `text[]`
  with no DB list, so the database doesn't change).

## `items.payload` for `type = 'event'` (D356, D357)

Strict Zod schema `eventPayloadSchema` in `packages/shared/src/events-cards/schema.ts`, registered in
`schemas/payloads.ts` `payloadSchemas.event`. It is subject to the usual payload ≤ 8192 bytes and body
≤ 600 code points.

| Field | Type | Rules |
|-------|------|-------|
| `allDay` | boolean | required |
| `start` | string | `allDay` → `YYYY-MM-DD`; else an ISO instant with offset. ≤ `EVENT_START_MAX_DAYS` ahead of now (server, create and update only when `start` changes); any past is allowed |
| `end` | string? | same form as `start`; `end ≥ start` (dates) / `end > start` (instants) |
| `timeZone` | string | IANA, `Intl` check (`isTimeZone`, shared with reminders) |
| `location` | string? | trimmed, 1–`EVENT_LOCATION_MAX` code points; plain text |
| `url` | string? | the link card's URL rules (`http(s)`, length) |
| `preview` | object? | exactly the link card's `preview` (server-owned fields handled by `link-preview-fields`, D372) |
| `notify.before` | `{ amount: int ≥ 0, unit }[]` | 0–`EVENT_NOTIFY_TIMES_MAX` entries, unique; ≤ `EVENT_NOTIFY_BEFORE_MAX_DAYS` in total; `allDay` → `unit = 'days'` only. Default `[{ amount: 1, unit: 'days' }]` |
| `notify.audience` | `{ mode, userIds: uuid[] }` | `userIds` non-empty only for `people` (≤ `REMINDER_PEOPLE_MAX`, reused), live deck members (service); personal deck → forced `{ mode: 'me', userIds: [] }` |

These DB CHECKs back the Zod rules (constitution III):

- `items_event_payload_chk`: for `type::text = 'event'`, `allDay` is a boolean; `start` and `timeZone`
  are strings; `location`, if present, has `char_length ≤ 200`; `notify.before` is an array with
  `jsonb_array_length ≤ 3`.
- `event_cards_span_chk` (below): end after start.

## `event_cards` (new; one row per event item, D358)

| Column | Type | Notes |
|--------|------|-------|
| `item_id` | uuid PK | FK `items` ON DELETE CASCADE |
| `deck_id` | uuid | FK `decks`; kept in step on a deck move |
| `all_day` | boolean | |
| `starts_at` | timestamptz(3) | timed: `start`; all-day: `start` 00:00 in `time_zone` |
| `ends_at` | timestamptz(3) | effective end, exclusive (timed: `end` or start + 1 h; all-day: (end or start) + 1 day 00:00 in zone) |
| `time_zone` | text | |
| `updated_at` | timestamptz(3) | `set_updated_at` trigger |

- CHECK `event_cards_span_chk (ends_at > starts_at)`.
- Index `event_cards_ends_idx (ends_at)` for "Coming up" and `(deck_id)`.
- Trigger `items_event_sync` (AFTER INSERT OR UPDATE OF type, payload, deck_id ON items, `WHEN
  type::text = 'event'`) upserts the row.
- A CHECK on `items` isn't possible across tables. Changing a card's type to or from event is refused
  by the service (FR-003), and `event_cards` cascades on purge.

## `event_notices` (new; one row per notify moment per start, D359)

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `item_id` | uuid | FK `items` ON DELETE CASCADE |
| `starts_at` | timestamptz(3) | the start this moment was computed for |
| `before_amount` | integer | ≥ 0 |
| `before_unit` | text | `minutes`/`hours`/`days` (CHECK) |
| `fire_at` | timestamptz(3) | computed by `eventNoticeMoments` (DST-aware days, all-day hour) |
| `state` | `event_notice_state` | `pending` → `planned` (claimed by the sweep) or `skipped` |
| `skip_reason` | text? | one of `eventNoticeSkipReasons`; CHECK `(state = 'skipped') = (skip_reason IS NOT NULL)` |
| `planned_at` | timestamptz(3)? | CHECK `(state = 'planned') = (planned_at IS NOT NULL)` |
| `created_at`, `updated_at` | timestamptz(3) | |

- UNIQUE `event_notices_once_uq (item_id, starts_at, before_amount, before_unit)`: a moment already
  planned for the same start is never recreated (FR-014).
- Partial index `event_notices_due_idx (fire_at) WHERE state = 'pending'`.

**State transitions**

```text
(insert, fire_at > now) ──► pending ──sweep, in grace──► planned      (terminal)
                               │ └──sweep, too late────► skipped/started
(insert, fire_at ≤ now) ───────┴─────────────────────► skipped/past_at_{save|publish|restore}
pending ──notify time removed / start moved──► deleted (only pending rows are ever deleted)
```

## `event_mutes` (new, D364)

| Column | Type | Notes |
|--------|------|-------|
| `item_id` | uuid | FK `items` ON DELETE CASCADE |
| `user_id` | uuid | FK `users` ON DELETE CASCADE |
| `muted` | boolean | `false` after unmute (the row stays as the last-change record) |
| `created_at`, `updated_at` | timestamptz(3) | |

PK `(item_id, user_id)`.

## `notification_deliveries` (changed, D361)

| Change | Detail |
|--------|--------|
| + `kind` | `notification_kind NOT NULL DEFAULT 'reminder'` (existing rows → `reminder`) |
| + `notice_id` | uuid NULL, FK `event_notices` ON DELETE CASCADE |
| `deadline` | for events = the notice's `fire_at` |
| CHECK | `notification_deliveries_kind_chk ((kind = 'event') = (notice_id IS NOT NULL))` |
| UNIQUE | `notification_deliveries_once_uq` replaced by `(item_id, kind, notice_id, deadline, user_id, channel, target) NULLS NOT DISTINCT` |

Events plan `channel = 'push'` only.

## Other DB changes

- `item_search_text(type, title, body, payload, entities)`: `CREATE OR REPLACE` with a `WHEN 'event'`
  branch that keeps only `location`, `url`, `preview.title` and `preview.description` (D365).
- `items_link_preview_public_id_idx`: recreated `WHERE type IN ('link','event')` (D372).

## Down file

`down/0022_events.down.sql` refuses while any `type = 'event'` item exists (as 0021 does). Otherwise it:

1. drops `event_mutes`, `event_notices` and `event_cards`, the trigger and the function;
2. restores the old unique key, then drops `kind`/`notice_id` and the new enums;
3. restores the 0021 `item_search_text` and the link-only index.

The `item_type` value is kept, because Postgres can't drop an enum value. A round-trip integration test
covers it (constitution III).

## Server-owned DTO additions (member item DTO, `toItemDto`)

`item.event` (present only for `type = 'event'`, member paths only, never in `toPublicItem`):

```text
{ startsAt, endsAt, allDay, timeZone,                    // from event_cards
  notices: [{ amount, unit, fireAt, state }],            // for the current start
  muted: boolean,                                        // the caller's own mute
  inAudience: boolean,                                   // caller would be notified
  canEditNotify: boolean }                               // D363
```

## Shared pure functions (unit-tested, no I/O)

| Function | Module | Used by |
|----------|--------|---------|
| `eventSpan(payload)` → `{ startsAt, endsAt }` | `events-cards/span.ts` | service validation, web, ICS (mirrors the trigger; parity int test) |
| `eventNoticeMoments(payload, limits)` | `events-cards/moments.ts` | `eventHook` → `syncNotices`; editor "will be skipped" hint |
| `eventAudience(input)` | `events-cards/audience.ts` | sweep plan, `stillDue`, "Coming up", DTO `inAudience` |
| `canEditEventNotify(input)` | `events-cards/audience.ts` | service (D363), DTO |
| `eventPhase(span, now)`, `formatEventWhen(span, viewerTz)` | `event-time` (zod-free subpath) | web card, notification area, public pages (absolute form only), push text |
| `toIcs(event, opts)` | `ics` (zod-free subpath) | web "Add to calendar" |
