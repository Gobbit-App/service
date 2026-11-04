# API contract: Reminders

All member routes: session auth, problem+json errors, 404 for anything the caller can't see.

## Items

- `POST /decks/{id}/items` accepts `type: 'reminder'` with the payload in
  [data-model.md](../data-model.md). Errors: 400 schema; 422 `payload.deadline` (past or too far),
  `payload.dismiss.userIds` (not a writer of this deck); personal decks store `mode: 'me'`.
- `PATCH /items/{id}`: as today; a changed `payload.deadline` must be future; a changed
  `payload.dismiss` by anyone but the creator (or an owner when the creator left) → 403
  `/problems/reminder-dismissers`.
- `DELETE /items/{id}`: an editor may delete a reminder they created.
- `GET /decks/{id}/items?status=upcoming`: hidden reminders the caller may see (owners/maintainers:
  all; others: their own), soonest reveal first, cursor = `(reveal_at, id)`.
- `Item.reminder` (present only for reminders):

```ts
{
  deadline: string; revealAt: string; timeZone: string;
  state: 'pending' | 'done' | 'dismissed';
  dismissedBy: string | null; dismissedAt: string | null; resolution: string | null;
  hidden: boolean;            // reveal time not reached
  canDismiss: boolean;        // caller is an eligible dismisser (D293)
  canChangeDismissers: boolean;
}
```

- `POST /items/{id}/dismiss` body `{ done: boolean, resolution?: string }` → 200 `Item`.
  403 `/problems/not-a-dismisser`; 409 `/problems/invalid-transition` when not pending or not a
  reminder; 422 `resolution`.
- `POST /items/{id}/restore` on a dismissed reminder clears the outcome.

## Me

- `GET /me/pending` → `{ items: PendingItem[]; upcoming: PendingItem[] }`
  `PendingItem = { kind: 'reminder'; itemId; title; deck: { slug; name }; deadline; revealAt; overdue }`
- `GET /me/notification-preferences` → `{ reminderEmails: boolean }`; `PUT` same body.
- `POST /me/push-subscriptions` `{ endpoint, keys: { p256dh, auth }, label? }` → 204;
  400 `/problems/push-host-not-allowed`; 404 when push isn't configured.
- `DELETE /me/push-subscriptions` `{ endpoint }` → 204 (idempotent).
- `POST /me/push-subscriptions/test` → 202 `{ devices: number }`; 429 over 5/hour.

## Config

`GET /config` gains `push: { publicKey: string } | null`.
