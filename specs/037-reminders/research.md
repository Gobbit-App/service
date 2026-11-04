# Research: Reminders and the notification area

Decisions D291–D299 (039 reserves D300–D319). Durable record: ADR-070.

## D291 — Data model: payload is the source, the DB derives the rest

- **Decision**: a reminder's payload is `{ deadline, showBefore: { amount, unit }, dismiss: { mode:
  'me' | 'writers' | 'people', userIds }, timeZone }`. A `BEFORE INSERT OR UPDATE` trigger on
  `items` sets `reveal_at = deadline − showBefore` for `type = 'reminder'` (null otherwise), and an
  `AFTER` trigger upserts `reminders(item_id, deck_id, deadline)`. Outcome, dismissal and
  `notified_deadline` live only in `reminders` (server-owned, never in the payload).
- **Rationale**: the editor round-trips the payload like every other type (draft, size limits,
  activity `payload` field); the derived columns can't drift from it (constitution II); the reveal
  test is one column on `items` that every read path already scans.
- **Alternatives**: deadline only in `reminders` with a join on every read (more joins on hot
  paths); a generated column (`timestamptz` casts aren't immutable).

## D292 — One reveal predicate on every member read path; anonymous paths exclude the type

- **Decision**: `itemRevealedWhere()` = `items.reveal_at is null or items.reveal_at <= now()`,
  applied wherever `itemHasVisibleCategory()` is (list, category, favorites, link flags, archived,
  search arms, category counts, dedup candidates). Hidden reminders are reachable only by
  `GET /items/{id}` (+ edit/archive/delete) for the creator and roles with
  `category.read_private`, and by `GET /decks/{id}/items?status=upcoming` (owners/maintainers: all
  hidden; others: their own). Public pages, public API/search, share previews and the sitemap
  filter `type <> 'reminder'`.
- **Rationale**: same shape as D38 (one predicate, everywhere); `now()` in SQL keeps a single
  clock per statement.
- **Alternatives**: filtering in services (easy to miss a path).

## D293 — Eligible dismissers: one pure function with an owner fallback

- **Decision**: `reminderDismissers({ rule, createdBy, members, categoryVisibilities })` returns
  user ids: candidates by rule (`me` → creator; `writers` → every member with `item.update`;
  `people` → listed ∪ creator), filtered to live accepted members with `item.update` who can see at
  least one of the card's live categories; when empty, the deck's owners. Personal decks force
  `me`. Only the creator changes `dismiss` (owners too once the creator isn't a member); an editor
  may delete their own reminder (`item.delete` bypass for `createdBy === user` on reminders only).
- **Rationale**: dismiss, `canDismiss`, the pending list and the notifier must agree; a pure
  function is unit-tested once.

## D294 — Dismiss archives; lifecycle moves keep notifications once

- **Decision**: `POST /items/{id}/dismiss { done, resolution? }` → `reminders.outcome = done |
  dismissed`, `dismissed_by/at`, `resolution`, item `status = archived`, item event `completed` or
  `dismissed` (same tx). Restore clears the outcome. Restore, undelete or publish of a reminder
  whose deadline has passed sets `notified_deadline = deadline` (overdue in-app only); a deadline
  edit must be in the future and, being a new value, notifies again. Dismissing a hidden reminder
  is allowed (it is just archived early).
- **Rationale**: FR-018/019, edge cases "restored after the deadline", "deadline edited".

## D295 — Sweep and deliveries: claim, plan and record in one transaction

- **Decision**: worker schedule `reminder-sweep` every minute. In one transaction: claim ≤ 200 due
  reminders (`published`, live, `outcome = pending`, `deadline <= now()`, `notified_deadline is
  distinct from deadline`) `FOR UPDATE SKIP LOCKED`, set `notified_deadline = deadline`, compute
  dismissers and insert `notification_deliveries (item_id, deadline, user_id, channel, target)`
  `ON CONFLICT DO NOTHING`. Then deliver due `pending` rows: claim (`status = sending`, attempts+1,
  commit), send, mark `sent` / `pending` with backoff (`base × 2^(n−1)`) / `failed` / `gone`.
  Rows stuck in `sending` for > 10 minutes become `interrupted` (never re-sent: at most once).
- **Rationale**: FR-014/SC-003 across restarts; email idempotency key = delivery id.
- **Alternatives**: one pg-boss job per reminder scheduled at the deadline (rescheduling on every
  edit/restore; harder to reason about after downtime).

## D296 — Web Push: `web-push` encrypts, `safe-push` sends

- **Decision**: `webpush.generateRequestDetails(subscription, payload, { vapidDetails, TTL: 1 day,
  urgency: 'high', topic })` builds the request; `createSafePush` POSTs it with the IP guard, no
  redirects, a 10 s timeout and only to allow-listed hosts (`fcm.googleapis.com`,
  `*.push.services.mozilla.com`, `*.notify.windows.com`, `web.push.apple.com`,
  `*.push.apple.com`). 404/410 delete the subscription; 429/5xx retry; other 4xx fail. Payload:
  `{ title, body: "<deck> · due <time>", url: "/i/<id>", tag: <item id> }`.
- **Rationale**: ADR-048 (all outbound through a guarded client) without re-implementing RFC 8291.
- **Env**: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (all or none; `/config.push`
  exposes the public key only).

## D297 — Subscriptions and preferences

- **Decision**: `POST /me/push-subscriptions` (upsert by endpoint; host must be allow-listed),
  `DELETE /me/push-subscriptions` `{ endpoint }`, `POST /me/push-subscriptions/test` (sends to the
  caller's devices now, rate-limited 5/h); `GET`/`PUT /me/notification-preferences`
  `{ reminderEmails }` (`users.reminder_emails`, default true).

## D298 — Pending items and the bell

- **Decision**: `GET /me/pending` → `{ items: PendingItem[], upcoming: PendingItem[] }`, where
  `PendingItem = { kind: 'reminder', itemId, title, deck: { slug, name }, deadline, revealAt,
  overdue }`; `items` = revealed, published, pending reminders the caller may dismiss (overdue
  first, then deadline), `upcoming` = hidden reminders they created. The bottom bar shows a bell
  (`ui/icons` `bell`) with a light (`pending`/`overdue`), `aria-label` "Notifications, N pending";
  `/notifications` lists both sections. Refetch on focus, after dismiss and on a service-worker
  `push-received` message; offline shows the persisted list with a stale note.
- **Rationale**: FR-021–024; `kind` leaves room for other items (FR-023).

## D299 — Limits

| Name | Default | Env |
| --- | --- | --- |
| Max show-before | 365 days | `REMINDER_MAX_SHOW_BEFORE_DAYS` (may lower) |
| Max deadline distance | 1826 days (5 y) | `REMINDER_MAX_DEADLINE_DAYS` |
| Resolution length | 600 code points | `REMINDER_RESOLUTION_MAX` (may lower) |
| Delivery attempts | 5 | `NOTIFY_MAX_ATTEMPTS` |
| Retry base | 60 s | `NOTIFY_RETRY_BASE_SECONDS` |
| Claimed per tick | 200 | `REMINDER_SWEEP_BATCH` |

The shared Zod schemas enforce the defaults as hard caps; the server applies the env values.
