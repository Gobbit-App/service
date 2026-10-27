# Data Model: Waitlist admin and invite

Reads and writes 028's `waitlist_entries`, Phase 1's `users`/`accounts` (through 029's `usersService.register`) and `magic_links`. No migration (028 ships the columns).

## Schema

No migration. 028's `0018_waitlist` ships every column and index this feature uses (`invited_at`, `invited_by`, `user_id`, `removed_at`, `removed_by`, CHECK `waitlist_removed_has_time`, index `waitlist_entries_status_confirmed_idx`), so the waitlist schema lands in one migration.

Existing 028 invariants this feature relies on (tested here from the admin path): `status = 'invited'` ⇒ `invited_at` NOT NULL (`user_id` is set on invite but not CHECKed, so a Phase 11 user delete can clear it); `status IN ('confirmed','invited')` ⇒ `confirmed_at` NOT NULL; one non-removed entry per email.

## State transitions (admin side)

| From | Action | To | Side effects |
|------|--------|----|--------------|
| `confirmed` | invite | `invited` | user registered (or existing linked), `invited_at`, `invited_by`, `user_id`; `sign_in` magic link (TTL `WAITLIST_INVITE_TTL_DAYS`); mail after commit |
| `invited` | invite (resend) | `invited` | new `sign_in` magic link; mail |
| `pending` / `confirmed` | remove | `removed` | `removed_at`, `removed_by`; no mail |
| `removed` | remove | `removed` | none (204) |
| `pending` | invite | — | 409 `/problems/waitlist-not-confirmed` |
| `removed` | invite | — | 409 `/problems/waitlist-removed` |
| `invited` | remove | — | 409 `/problems/waitlist-invited` |

## DTOs (`@pb/shared`, `schemas/waitlist-admin.ts`)

### `AdminWaitlistQuery`

`{ status?: WaitlistStatus = 'confirmed', kind?: WaitlistKind, cursor?: string, limit?: 1..100 = 50 }`

### `AdminWaitlistEntry`

| Field | Type | Notes |
|-------|------|-------|
| `id` | uuid | |
| `email` | string | admin-only DTO; never in logs |
| `kind` | `family \| community \| personal \| other` | |
| `note` | string \| null | plain text |
| `source` | `landing \| sign_in` | |
| `status` | `pending \| confirmed \| invited \| removed` | |
| `createdAt`, `confirmedAt`, `invitedAt`, `removedAt` | ISO string \| null | |
| `invitedBy` | `{ id, displayName } \| null` | |

### `AdminWaitlistPage`

`{ items: AdminWaitlistEntry[], nextCursor: string | null, counts: Record<WaitlistStatus, number> }` — `counts` respect the `kind` filter.

### `AdminWaitlistInviteResult`

`{ entry: AdminWaitlistEntry, mailSent: boolean }`

### `Me` (extended)

`meSchema` gains `isPlatformAdmin: boolean`.

## Env and constants

| Name | Where | Default |
|------|-------|---------|
| `PLATFORM_ADMINS` | `env.ts` → `string[]` (trimmed, lower-cased) | empty |
| `WAITLIST_INVITE_TTL_DAYS` | `env.ts` | `WAITLIST_INVITE_TTL_DAYS_DEFAULT` = 7 (`@pb/shared`) |
| `ADMIN_WAITLIST_PAGE_MAX` | `@pb/shared` | 100 |

## Mail

`waitlistInviteEmail({ link, ttlDays })` in `apps/api/src/mail/templates.ts`: subject "You're in — welcome to Gobbit"; text and HTML with the link, its lifetime, and that the sign-in screen works afterwards. Signed "Gobbit"; no admin name (owner, 2026-10-26).

## Web state

| Query key | Source | Persisted | Invalidated by |
|-----------|--------|-----------|----------------|
| `['me']` | `GET /me` | yes (existing) | sign-in/out |
| `['admin', 'waitlist', status, kind]` | `GET /admin/waitlist` (infinite) | **no** | invite, resend, remove |

## Audit rows (028's `waitlist_events`, D238)

| Admin action | `action` | `actor_id` |
|--------------|----------|------------|
| First invite | `invited` | admin |
| Resend | `invite_resent` | admin |
| Remove (pending/confirmed) | `removed` | admin |

Written by `markInvited`/`markRemoved` through `insertEvent` in the same transaction; refusals and no-ops write no row (their decision event records them). The account an invite creates carries `registered_via = 'waitlist_invite'`, `registered_by` = admin (029).
