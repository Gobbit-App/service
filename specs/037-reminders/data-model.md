# Data model: Reminders (migration `0021_reminders`)

## Enum changes

- `item_type` + `reminder`
- `item_event_kind` + `completed`, `dismissed`
- NEW `reminder_outcome` = `pending | done | dismissed`
- NEW `notification_channel` = `email | push`
- NEW `notification_status` = `pending | sending | sent | failed | interrupted | gone | skipped`

## `items` (changed)

| Column | Type | Notes |
| --- | --- | --- |
| `reveal_at` | timestamptz(3) null | trigger-owned; CHECK `(type = 'reminder') = (reveal_at IS NOT NULL)` |

Index `items_reveal_idx (deck_id, reveal_at) WHERE reveal_at IS NOT NULL`.

## Reminder payload (`items.payload`, `type = 'reminder'`)

```json
{
  "deadline": "2026-11-05T09:00:00.000Z",
  "showBefore": { "amount": 24, "unit": "hours" },
  "dismiss": { "mode": "people", "userIds": ["…"] },
  "timeZone": "Asia/Jerusalem"
}
```

Validation (shared Zod + server): deadline ISO instant, future on create/change, ≤ max distance;
amount integer 0…(max in unit); `userIds` ≤ 50 unique uuids, empty unless `people`; `timeZone`
an IANA zone. Body/title limits as text cards.

## `reminders` (NEW, 1:1 with a reminder item)

| Column | Type | Notes |
| --- | --- | --- |
| `item_id` | uuid PK → items cascade | |
| `deck_id` | uuid not null | copied by trigger |
| `deadline` | timestamptz(3) not null | trigger-owned from payload |
| `outcome` | reminder_outcome default `pending` | |
| `dismissed_by` | uuid null → users set null | |
| `dismissed_at` | timestamptz(3) null | |
| `resolution` | text null | ≤ 600 code points CHECK |
| `notified_deadline` | timestamptz(3) null | the deadline whose notifications were planned |
| `created_at`/`updated_at` | | |

CHECK: `outcome = 'pending'` ⇔ `dismissed_at IS NULL` (dismissed_by may be null after user
deletion). Index `reminders_due_idx (deadline) WHERE outcome = 'pending'`.

State transitions: `pending → done | dismissed` (dismiss, archives the item);
`done | dismissed → pending` (restore). Deadline change keeps the outcome and leaves
`notified_deadline` as is (≠ new deadline ⇒ due again).

## `push_subscriptions` (NEW)

| Column | Type | Notes |
| --- | --- | --- |
| `id` | uuid PK | |
| `user_id` | uuid → users cascade | |
| `endpoint` | text unique | allow-listed host |
| `p256dh`, `auth` | text | subscription keys |
| `user_agent_label` | text null | "Chrome on Android" (short, for Settings) |
| `created_at`, `last_used_at` | timestamptz(3) | |

## `notification_deliveries` (NEW, audit + at-most-once)

| Column | Type | Notes |
| --- | --- | --- |
| `id` | uuid PK | email idempotency key |
| `item_id` | uuid → items cascade | |
| `deadline` | timestamptz(3) | which deadline |
| `user_id` | uuid → users cascade | |
| `channel` | notification_channel | |
| `target` | text | `email` or the push subscription id |
| `status` | notification_status | |
| `attempts` | int default 0 | |
| `next_attempt_at` | timestamptz(3) | |
| `last_error` | text null | code only (`http_503`, `timeout`) |
| `created_at`, `updated_at` | | |

Unique `(item_id, deadline, user_id, channel, target)`. Index `(status, next_attempt_at)`.

## `users` (changed)

| Column | Type | Notes |
| --- | --- | --- |
| `reminder_emails` | boolean not null default true | FR-012 |
