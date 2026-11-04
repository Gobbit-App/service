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

## PR3: notifications (T022–T027)

- **File layout**: `push/push-sender.ts` (`web-push` builds the encrypted request, `createSafePush`
  sends it) instead of `push/{safe-push,web-push-request}.ts`; one `routes/notifications.ts` for
  subscriptions, preferences and the test send.
- **Ineligible scope**: `skipped:ineligible` is logged only for a picked person who lost write
  access. Readers are never recipients, so no event is written for them.
- **404 = gone**: a push service answering 404 removes the subscription just like 410.
- **Due-time formatting**: built from explicit `Intl.DateTimeFormat` parts in the reminder's zone,
  so the text doesn't depend on the ICU build.
- **Sign-out drops push**: `signOut` calls `forgetPush` first (DELETE the server row, then
  unsubscribe); a failure is logged and sign-out continues.
- **iOS install hint**: on iPhone/iPad outside standalone mode Settings explains how to add the app
  to the Home Screen instead of offering the button.
- **Reading the subscription**: reads use `navigator.serviceWorker.getRegistration()`, because
  `ready` never resolves when no worker is registered (dev, private windows).
- **Crash test**: the int test backdates a `sending` row with the `set_updated_at` trigger turned
  off inside one transaction, so the interrupted path is exercised without a real crash.

## PR2: web editor, card, dismiss, Upcoming (T017–T021)

- **Upcoming link for every writer**: the contract links Upcoming for owners/maintainers only. The
  ⋯ menu shows it to every `item.update` role instead, because editors see their own hidden
  reminders there (the API already filters by role).
- **Zod-free constants subpath**: the editor and dialog import caps and units from
  `@gobbit/shared/reminder-constants` (`reminders/client.ts`), keeping zod out of the initial and
  editor chunks.
- **Deadline in the device zone**: the editor edits the deadline as `datetime-local` in the device
  zone and sends its zone. An untouched deadline sends the stored instant and zone back unchanged
  (`storedDeadline`), so editing the title of an overdue reminder doesn't trip the future-only
  check or move it to another zone.
- **Dismiss isn't optimistic**: the server arbitrates races (409), so the dialog waits for the
  answer and shows why it was refused. Lists and the card update from the response, then refresh.
- **Upcoming cache**: Upcoming sorts by reveal time ascending while `insertIntoPages` ranks newest
  first, so Upcoming only replaces a listed card in place (`replaceInPages`) and lets the refetch
  add or drop cards.
- **Warning tone**: the overdue status line uses `--color-danger`; the app has no warning colour
  variable.
- **No analytics event for dismiss**: the four content events stay as they are; dismissal is
  recorded by the item event (`completed`/`dismissed`).
- **Dismisser names**: the status line names "you", the member's display name, or "someone" when
  the dismisser is no longer a member.
- **E2E**: `e2e/tests/full/reminders.spec.ts` runs only the owner session, so "hidden for a
  reader" is covered by the API integration tests rather than the browser.

## PR4: pending list, bell, /notifications (T028–T031)

- **Separate `pending.service`**: `GET /me/pending` lives in its own service (decks repo + reminders
  repo) instead of growing `reminders.service`; it applies `reminderDismissers` exactly like
  dismiss and the notifier, and `canStillAct` (now exported) for Upcoming.
- **Bounded scan**: the repo reads at most `PENDING_SCAN_MAX` (1000) pending reminders across the
  member's decks, soonest deadline first, before filtering by who may act; each section is capped
  at `PENDING_LIST_MAX` (100). Overdue ones lead because the scan is ordered by deadline.
- **Upcoming on /notifications**: only the member's own hidden reminders, and only while they can
  still act on them (a creator demoted to reader loses them), matching the deck Upcoming rule for
  editors.
- **No number on the bell**: the bell shows a light only (accent, `--color-danger` when overdue);
  the counts are in its accessible name ("Notifications, 2 pending, 1 overdue").
- **Freshness**: the pending query refetches on focus (a notification tap brings the app forward)
  and every minute while open; every lifecycle change and dismiss invalidates it through
  `invalidateAfterLifecycle`. A push also refreshes open windows: the service worker posts `gobbit:pending-changed` (`tellOpenWindows`) and the bell's `usePendingRefresh` invalidates the pending query (T034, converge F1).
- **Offline**: the list comes from the persisted query cache with "Showing the last known list";
  a first load with no cache shows the offline error with retry.
- **E2E**: none — the API rules are covered by `pending.int.test.ts` and the UI by unit tests; the
  bell needs a reminder that is already revealed, which the nightly reminder journey can add later.
