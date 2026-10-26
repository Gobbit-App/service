# Contract: Admin waitlist API

All routes: session auth (cookie or bearer); signed-out → `401 /problems/unauthorized`; signed-in but not in `PLATFORM_ADMINS` → `404 /problems/not-found` (identical body to an unknown route's problem). Tag `admin`, in OpenAPI; `pnpm api:openapi` regenerates `@pb/api-client`. Cookie-authenticated writes pass the existing CSRF middleware.

## 1. `GET /admin/waitlist`

| | |
|---|---|
| Query | `status` (`pending\|confirmed\|invited\|removed`, default `confirmed`), `kind` (optional), `cursor` (opaque), `limit` (1–100, default 50) |
| 200 | `AdminWaitlistPage` |
| 400 | Bad query |
| 401 / 404 | As above |

Order: `confirmed` → `confirmed_at ASC, id`; `invited` → `invited_at DESC, id`; `pending`/`removed` → `created_at DESC, id`.

```json
{
  "items": [
    {
      "id": "6f0c…",
      "email": "dana@example.test",
      "kind": "community",
      "note": "Our building's group keeps losing the plumber's number",
      "source": "landing",
      "status": "confirmed",
      "createdAt": "2026-11-02T09:12:00.000Z",
      "confirmedAt": "2026-11-02T09:14:31.000Z",
      "invitedAt": null,
      "removedAt": null,
      "invitedBy": null
    }
  ],
  "nextCursor": null,
  "counts": { "pending": 4, "confirmed": 1, "invited": 2, "removed": 0 }
}
```

## 2. `POST /admin/waitlist/{id}/invite`

| | |
|---|---|
| Body | none |
| 201 | First invite: `AdminWaitlistInviteResult` (`entry.status = invited`) |
| 200 | Resend for an already `invited` entry: `AdminWaitlistInviteResult` |
| 404 | Unknown id (or caller not admin) |
| 409 | `/problems/waitlist-not-confirmed` (pending), `/problems/waitlist-removed` (removed) |

`mailSent: false` when the provider failed after commit; the entry is invited and the account exists — call again to resend.

Effects: account via `usersService.register(email, 'waitlist_invite')` (existing account is linked, never duplicated); `sign_in` magic link valid `WAITLIST_INVITE_TTL_DAYS`; "You're in" email to the entry's address. No deck is created here.

## 3. `DELETE /admin/waitlist/{id}`

| | |
|---|---|
| 204 | Entry is now `removed` (or already was) |
| 404 | Unknown id (or caller not admin) |
| 409 | `/problems/waitlist-invited` |

## 4. `GET /me` (changed)

Adds `"isPlatformAdmin": true | false` to the response.

## 5. Sign-in from the "You're in" email (unchanged route)

`GET /auth/callback?token=…` → consumes the `sign_in` link, finds the account (it exists, so 029's gate passes), `ensurePersonalDeck` creates "My deck" with `general`, opens the session, `303 ${APP_URL}/` → the app lands in `/d/me`.

## 6. PWA route

`/admin/waitlist` (code-split). "Waitlist" link in `/settings` only when `me.isPlatformAdmin`. A non-admin opening the address directly sees the app's not-found view.
