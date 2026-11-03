# Reminders (037)

Plan: [`specs/037-reminders`](../../specs/037-reminders/plan.md) · Decisions D291–D299 ·
[ADR-070](../adr.md#adr-070-reminders-a-card-type-hidden-until-reveal-dismissed-once-notified-once-d291d299)

A reminder is a card type (`type = 'reminder'`) with a deadline. It stays hidden until its reveal
time (`deadline − showBefore`), shows on the deck once revealed, and is closed by one of the
people allowed to dismiss it.

## Data model (D291)

- **Payload** (the source, round-tripped by the editor):
  `{ deadline, showBefore: { amount, unit: minutes | hours | days }, dismiss: { mode: me | writers | people, userIds }, timeZone }`.
  Validated by `reminderPayloadSchema` in `@gobbit/shared/reminders`.
- **Derived by the DB** (migration `0021_reminders`):
  - a `BEFORE` trigger on `items` sets `items.reveal_at` (null for other types, CHECK-enforced);
  - an `AFTER` trigger upserts `reminders(item_id, deck_id, deadline)`.
- **Server-owned state** lives only in `reminders`: `outcome` (`pending | done | dismissed`),
  `dismissed_by/at`, `resolution` and `notified_deadline`.
- `item_search_text` indexes no payload text for reminders, and `payloadText()` (embeddings) skips
  it too.

## Visibility (D292)

- `itemRevealedWhere(role)` (`access/visibility.ts`) sits next to `itemHasVisibleCategory()` on
  every member read: lists, favorites, link flags, archived, both search arms, dedup candidates and
  category counts.
  - Members: `reveal_at is null or reveal_at <= now()`.
  - Anonymous readers: `type <> 'reminder'`. Public API, public pages, sitemap, public search and
    `shareMode()` never show a reminder.
- `items.service.loadItem` 404s a hidden reminder for anyone but its creator and roles that see
  private categories (owner, maintainer).
- **Upcoming**: `GET /decks/{id}/items?status=upcoming` lists hidden reminders, soonest reveal
  first (cursor on `reveal_at, id`).
  - Owners and maintainers see all of them; everyone else only their own.
  - Proposals appear only to publishers, or to the person who proposed them.

## Who can dismiss (D293)

- `reminderDismissers()` (`@gobbit/shared/reminders`) is the one rule used by dismiss,
  `reminder.canDismiss` and (later) the sweep and the pending list.
  - It starts from candidates by mode: `me` is the creator; `writers` is every member with
    `item.update`; `people` is the picked users plus the creator.
  - It keeps only live writers who can see one of the card's categories.
  - If nobody is left, the deck's owners can dismiss.
- Personal decks always store `me`.
- People picked for `people` must be writers (422 otherwise).
- Only the creator changes the rule (an owner can once the creator has left): 403
  `/problems/reminder-dismissers`.
- An editor may delete a reminder they created. Every other delete still needs `item.delete`.

## Dismiss and lifecycle (D294)

`POST /items/{id}/dismiss { done, resolution? }` runs in one transaction (`reminders.repo.dismiss`):

- sets the outcome (`done` or `dismissed`), who dismissed it and when, and the trimmed resolution;
- archives a published card;
- writes the `completed` or `dismissed` item event.

Errors:

- 403 `/problems/not-a-dismisser` when the caller isn't an eligible dismisser;
- 409 `/problems/invalid-transition` for a proposal, a non-reminder, or a reminder that is no longer
  pending (two people dismissing at once: one wins, the other gets 409).

Lifecycle moves (hooks passed to `items.repo` and run in the same transaction):

- **Restore** reopens the reminder (`reopenReminder`).
- **Restore, undelete and publishing a proposal** after the deadline set
  `notified_deadline = deadline` (`markNotifiedIfPast`). The reminder is then overdue in the app
  only and never sends a late notification.
- **A deadline edit** must be in the future (an unchanged past deadline is kept as is).

## Web (PR2)

- **Editor**: `Reminder` follows `Text` in the type picker. `editor/fields/ReminderFields.tsx` has
  a deadline (`datetime-local`, device zone), show before (amount + unit) and who can dismiss. The
  choice is hidden on personal decks and read-only (with a note) when
  `reminder.canChangeDismissers` is false. The draft model is `editor/reminder-draft.ts`; client
  checks are a required future deadline (an unchanged stored one is kept), the show-before cap and
  at least one picked person.
- **Card**: `reminders/ReminderStatus.tsx` renders the status line from `reminder-status.ts`
  ("Due in …", "Overdue by …", "Done by … · resolution", "Dismissed by …", "Shows on … · Due …").
- **Dismiss**: a `Dismiss` action in `CardActionBar` when the reminder is published, pending and
  `canDismiss`. It opens `reminders/DismissDialog.tsx` (native `<dialog>`, Done switch off, optional
  resolution with a counter, Mark done / Dismiss without marking done, disabled offline) and posts
  through `use-dismiss.ts`.
- **Upcoming**: `/d/$slug/upcoming` (`ItemFilter` `upcoming`), linked from the deck ⋯ menu for
  `item.update` roles.

## Pending list and bell (PR4, D298)

- **API**: `GET /me/pending` (`services/pending.service.ts`) answers `{ items, upcoming }` across
  the member's decks. `items` are revealed, published, pending reminders the member may dismiss
  (`reminderDismissers`), soonest deadline first so overdue ones lead. `upcoming` are their own
  hidden reminders while they can still act on them, soonest reveal first. Each entry has a `kind`
  (`reminder` today, FR-023), so other actionable things can join later.
- **Web**: `notifications/NotificationsBell.tsx` sits in the bottom bar on every bar page, with a
  light (accent, or `--color-danger` once one is overdue) and the counts in its accessible name.
  `/notifications` (`NotificationsScreen.tsx`) shows "Waiting on you" and "Upcoming"; each entry
  links to its card. Offline it shows the persisted last known list with a note.

## Limits (D299)

- The shared caps (`@gobbit/shared` `REMINDER_*`) are deadline ≤ 1825 days ahead, show-before
  ≤ 365 days and resolution ≤ 600 characters.
- The env variables `REMINDER_MAX_DEADLINE_DAYS`, `REMINDER_MAX_SHOW_BEFORE_DAYS` and
  `REMINDER_RESOLUTION_MAX` can only lower them.

## Decision events

`reminders` logger (`services/reminders.events.ts`), `warn` on refusals:

| Event | Outcomes / reasons |
| --- | --- |
| `reminder.dismiss` | accepted `done`/`dismissed`; refused `not_eligible`/`not_pending` |
| `reminder.dismissers` | refused `not_creator`/`not_writer` |
| `reminder.delete` | accepted `creator`; refused `not_creator` |

Each event carries `requestId` (taken from `Actor.requestId`), the user, the deck and the item id.

## Deviations

- `Actor` gained an optional `requestId` (set by `getActor(c)`). Services pass it to their decision
  events this way, instead of taking a separate parameter.
- A reminder dismissed before it was revealed stays hidden from the deck. It shows only in Upcoming
  and by id until its reveal time.
- `payloadText()` returns `''` for reminders, so embeddings use the title and body only.
- The Upcoming link shows for every `item.update` role, not only owners and maintainers: editors see
  their own hidden reminders there.
- Dismissing waits for the server (no optimistic update), and Upcoming's cache only replaces cards
  in place because it sorts by reveal time ascending.
- The overdue tone uses `--color-danger` (there is no warning colour).
- Push sending lives in `push/push-sender.ts` plus `createSafePush` in `fetch/safe-fetch.ts`,
  instead of the planned `push/{safe-push,web-push-request}.ts`. The subscription, preference and
  test routes share `routes/notifications.ts`.
- `reminder.notify` logs `skipped:ineligible` only for a picked person who lost write access;
  deck readers are never recipients, so they log nothing.
- A push endpoint that answers 404 is treated like 410: the subscription is removed (`gone`).
- The due time in emails and pushes is built from explicit `Intl` parts in the reminder's zone,
  so it reads the same on every Node build.
- Signing out turns off push on that device (server row first, then the browser subscription),
  so a shared phone stops getting the previous member's reminders.
- iPhone and iPad show an "Add to Home Screen" hint instead of the enable button until the app is
  installed, because Safari only allows web push from an installed app.
- `GET /me/pending` lives in its own `pending.service` and scans at most 1000 pending reminders
  per call (`PENDING_SCAN_MAX`), 100 per section (`PENDING_LIST_MAX`).
- The bell shows a light, not a number; the counts are in its accessible name. The pending list
  refetches on focus and every minute; a push also refreshes it in open windows (the service worker posts `gobbit:pending-changed`, `usePendingRefresh` invalidates).
