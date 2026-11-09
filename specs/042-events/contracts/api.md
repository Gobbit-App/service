# API contract: Events

All member routes use session auth and problem+json errors, and answer 404 for anything the caller
can't see. After the route changes, run `pnpm api:openapi`.

## Items

- **`POST /decks/{id}/items`** accepts `type: 'event'` with the payload in
  [data-model.md](../data-model.md). Errors:
  - 400: schema.
  - 422 `payload.end` (before the start), `payload.start` (more than `EVENT_START_MAX_DAYS` ahead),
    `payload.location` (too long), `payload.notify.before` (more than 3 entries, a duplicate, too long,
    or a non-day unit on an all-day event).
  - 422 `/problems/event-audience-unknown-member` when `payload.notify.audience.userIds` holds an id that
    isn't a live member.
  - Personal decks store `audience = { mode: 'me', userIds: [] }`.
  - A start in the past is accepted (no notices are scheduled; every moment is `skipped/past_at_save`).
- **`PATCH /items/{id}`**: as today.
  - A changed `payload.notify` from anyone but the creator (or an owner or co-owner when the creator
    is no longer a member) → 409 `/problems/event-notify-locked`, and nothing in the patch is applied (D363).
  - A change of `type` to or from `event` → 409 `/problems/type-change-not-supported`.
  - A changed `payload.start` re-runs the 5-year check. Notices are re-synced in the same transaction (D359).
- **`POST /items/{id}/link-check`** and **`DELETE /items/{id}/link-flag`** accept events that have a `url`.
  Events without a `url` → 409 `/problems/not-a-link`, as for other non-link types.
- **`GET /decks/{id}/items?flag=link`** includes events with a flagged link.
- **Lifecycle routes** (publish via PATCH, archive, restore, delete, undelete) are unchanged. Publish,
  restore and undelete mark moments already passed as skipped (FR-015).
- **`Item.event`** is present only for events, on member paths only:

```ts
{
  startsAt: string; endsAt: string; allDay: boolean; timeZone: string;
  notices: { amount: number; unit: 'minutes' | 'hours' | 'days'; fireAt: string;
             state: 'pending' | 'planned' | 'skipped' }[];
  muted: boolean;         // the caller's own mute only
  inAudience: boolean;    // the caller would be notified (ignoring the mute)
  canEditNotify: boolean; // D363
}
```

- **`PUT /items/{id}/mute`** → 204 (idempotent). **`DELETE /items/{id}/mute`** → 204 (idempotent).
  - 409 `/problems/not-an-event`.
  - 409 `/problems/event-not-in-audience` (only for `PUT`; `DELETE` always succeeds for a reader).
  - 404 when the caller can't read the item.

## Me

- **`GET /me/pending`** → `{ items: PendingItem[]; upcoming: PendingItem[]; comingUp: ComingUpEntry[] }`

```ts
type ComingUpEntry = {
  kind: 'event'; itemId: string; title: string; deck: { slug: string; name: string };
  startsAt: string; endsAt: string; allDay: boolean; timeZone: string; location: string | null;
};
```

`comingUp` holds events in the caller's audience, not muted and readable, whose first notice
`fireAt ≤ now < endsAt`, soonest `startsAt` first, at most `PENDING_LIST_MAX`. The bell counts only
`items`.

- `GET/PUT /me/notification-preferences`: unchanged (`reminderEmails` only; there is no event email).

## Public and share (no change in routes)

- `/public/{slug}` read API and public search: events appear with `payload` restricted to
  `{ allDay, start, end?, timeZone, location?, url?, preview? }`. `notify`, `event.notices`, `muted`,
  `inAudience` and `canEditNotify` are never present.
- `/p/{slug}/i/{id}`: the event's date and time in its own zone ("Thu 3 Dec, 18:00–20:00 (Asia/Jerusalem)"
  / "Thu 3 Dec – Sat 5 Dec"), plus the location and link preview. No relative status.
- `/s/...` share preview: OG title = the card title; description = date · location. The audience is never
  included.

## Push message (service worker)

`{ title: <card title>, body: "<deck> · <start in event zone>[ · <location>]", tag: "event:<itemId>:<noticeId>", url: "/i/<itemId>" }`

There is no body text (FR-013). The tag is per notice, so two notices for the same event don't replace
each other silently.
