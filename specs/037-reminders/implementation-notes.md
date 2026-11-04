# Implementation notes: 037 reminders

Decisions the plan didn't make, and deviations from it. At close-out, deviations are copied to
[`docs/design/reminders.md`](../../docs/design/reminders.md#deviations).

## PR1: type, visibility, Upcoming, dismiss (T001–T016)

- **requestId on `Actor`**: decision events need the request id. `Actor` now has an optional
  `requestId`, which `getActor(c)` fills in. Reminder service methods read it from the actor
  instead of taking a separate argument; internal callers log `'internal'`.
- **Lifecycle hooks**: `items.repo` `update`/`restore`/`undelete` take an optional
  `inTx(tx)` callback. `items.service` passes `reopenReminder` or `markNotifiedIfPast` for reminder
  rows only, so the reminder row changes in the same transaction as the item.
- **Upcoming pagination**: the cursor reuses the item cursor codec, with `reveal_at` in the
  `createdAt` slot.
- **Proposals in Upcoming**: publishers see every hidden proposal; anyone else sees only their own.
  The plan didn't specify this.
- **Dismissed before reveal**: a reminder dismissed early stays hidden from the deck until its
  reveal time. It shows only in Upcoming and by id, because the reveal predicate is the only gate.
  This was accepted as harmless.
- **Embeddings**: `payloadText()` returns `''` for reminders, matching `item_search_text`.
- **Web (PR1 only)**:
  - `reminder` has labels, a draft pass-through and a placeholder field set, so the app
    type-checks;
  - it stays out of `CREATABLE_TYPES` until PR2 adds the reminder editor.
- **Notification statuses**: `notification_deliveries.status` has no `skipped` value. Opted-out or
  ineligible recipients get no row at all (planned for PR3).
