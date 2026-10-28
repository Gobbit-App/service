# Waitlist (Phase 9, `specs/028-waitlist`, ADR-061)

People ask for an invite with an email address and a kind (`family`, `community`, `personal`,
`other`). Entries are double opt-in, never reveal whether an address is known, and are pruned when
nobody confirms them. The landing page (030), the sign-in gate (029) and the admin screen (032)
build on this.

## Table and statuses (D217)

- `waitlist_entries`: one row per request. Email stored normalized (lower-case CHECK), `kind`,
  `source` (`landing | sign_in`), `status` (`pending | confirmed | invited | removed`), optional
  `note` (≤ 500 code points) and `utm_source` (≤ 64, `[a-z0-9_-]`), confirm token hash + expiry,
  `confirmed_at`, `invited_at`, `invited_by`, `user_id`, `removed_at`.
- One live entry per email (partial unique index `WHERE status <> 'removed'`); a removed address
  can join again.
- CHECKs tie timestamps to status (`pending` ⇒ token hash and expiry; `confirmed`/`invited` ⇒
  `confirmed_at`; `invited` ⇒ `invited_at`; `removed` ⇒ `removed_at`). Transitions live in
  `waitlist.service` only.

## Join (D218, D219)

`waitlist.service.join()` holds every rule; `POST /waitlist` (JSON, `source = 'landing'`), 030's
HTML form and 029's gate (`source = 'sign_in'`, `skipRateLimits`) call it. Every well-formed
request answers `202 { ok: true }`; only the mail differs:

| Case | Row | Mail | `waitlist.join` outcome |
| --- | --- | --- | --- |
| Honeypot `website` filled | none | none | `dropped` · `honeypot` |
| Per-email limit reached | none | none (429) | `refused` · `per_email` |
| Email belongs to a user | none | existing-user (sign-in link) | `existing_user` |
| No live entry | insert `pending`, new token | confirm | `created` |
| `pending` | new token (old one dies); form fields updated for `landing` only | confirm | `resent` |
| `confirmed` / `invited` | unchanged | none | `unchanged` · `already_confirmed` / `already_invited` |

- The per-email check (3 per hour, `rate_limit_counters` key `waitlist:email:<sha256>`) runs before
  any lookup, so a known and an unknown address are refused alike.
- The per-IP limit (10 per hour) is its own in-memory bucket on `/waitlist/*` (join and confirm
  share it); its refusal records `rate_limit.refused` with `bucket: 'waitlist'`.
- Both limits are env vars (`WAITLIST_JOIN_PER_IP_PER_HOUR`, `WAITLIST_JOIN_PER_EMAIL_PER_HOUR`);
  an invalid value fails start-up.
- Mail goes out after the commit. A send failure records `waitlist.mail` `failed` (error level,
  no address) and still answers 202.

## Confirm (D218)

`GET /waitlist/confirm?token=` (outside OpenAPI, `Cache-Control: no-store`,
`Referrer-Policy: no-referrer`) runs one atomic `UPDATE … WHERE token_hash = $1 AND status =
'pending' AND expires > now()`. It answers `303` to `${APP_URL}/welcome?confirmed=1` or
`?confirm=invalid`; without `APP_URL`, `200 { confirmed }`. Tokens are 32 random bytes, stored as
sha256, valid 7 days. After a miss, a second lookup by hash tells `unknown`, `used` and `expired`
apart for the `waitlist.confirm` event only.

## Records (D239, D240)

- Decision events: `waitlist.join`, `waitlist.confirm`, `waitlist.mail` (`template` = `confirm |
  existing_user`), `waitlist.prune`, `rate_limit.refused`. Fields are ids and keyed hashes
  (`emailHash`, `ipHash` from `lib/log-hash.ts`, HMAC with `LOG_HASH_KEY`), never an address or
  IP. Levels and alert thresholds: `specs/028-waitlist/plan.md` § Accountability; reading them:
  `infra/README.md` § Waitlist.
- Audit rows: `waitlist_events` (`entry_id` without FK so it outlives the prune, `action`,
  `actor_id`, `source`, `created_at`), written in the same transaction as the change (`created`,
  `resent`, `confirmed`; 032 adds `invited`, `invite_resent`, `removed` with the admin as actor).

## Prune (D220)

Weekly `prune-waitlist` (Sunday 06:00) deletes `pending` entries whose link expired more than 30
days ago and `removed` entries removed more than 30 days ago; their `waitlist_events` rows stay.
It records `waitlist.prune` with both counts.

## Summary view (D221)

`waitlist_summary` (hand-written SQL in migration 0018) counts entries per ISO week, kind, source
and status; an `invited` entry whose user has ever had a session counts as `joined`. No emails,
tokens or notes. Read it with `SELECT * FROM waitlist_summary ORDER BY week DESC;`.

## Admin (032, D234–D238, ADR-064)

Platform admins (`PLATFORM_ADMINS`, [auth](auth.md#platform-admins-d234)) work the list from the
PWA at `/admin/waitlist` (linked from Settings → Platform), through `waitlist-admin.service` only:

- `GET /admin/waitlist?status=&kind=&cursor=&limit=` — default `confirmed`, oldest confirmed
  first; `invited` newest invite first, others newest first; keyset cursor, `limit` ≤ 100
  (default 50); `counts` per status for the kind filter.
- `POST /admin/waitlist/{id}/invite` — locks the entry, `users.service.register(email,
  'waitlist_invite')` (or links the existing user), marks it `invited` and mints a `sign_in`
  link valid `WAITLIST_INVITE_TTL_DAYS` (default 7) in one transaction; the "You're in" mail goes
  after commit. `201` first invite, `200` resend (a new link, older ones stay valid); `409`
  `waitlist-not-confirmed` / `waitlist-removed`. A failed send still answers with
  `mailSent: false` and the screen offers Resend. The personal deck appears on first sign-in
  (Phase 3B), not at invite.
- `DELETE /admin/waitlist/{id}` — pending/confirmed → `removed` (`204`, no-op when already
  removed); `409 waitlist-invited` for invited entries.

Each write inserts a `waitlist_events` row (`invited`, `invite_resent`, `removed`, `actor_id` =
the admin) in its transaction and records `waitlist.admin`; each list call records
`waitlist.admin_list`. The web never persists the admin query (`NOT_PERSISTED`). Queries and
alerts: `infra/README.md` § Waitlist admin.

### Deviations from the 032 plan

- The `/admin/*` guard runs before request validation, so non-admins get the same 404 for every
  admin URL; malformed ids are a 404 for admins too.
- The invite registers the user inside the locked transaction; a concurrent deck invite for the
  same address can fail it with a unique-index 500 (retry links the existing user).
- 028's placeholder `markInvited` / `remove` were removed from `waitlist.service`.
- `WAITLIST_KIND_LABELS` / `WAITLIST_STATUS_LABELS` were added to `@pb/shared/waitlist-constants`.
- The `@full` e2e journey removes a pending entry (e2e can't read mail); invite → first sign-in is
  an integration test. Details: `specs/032-waitlist-admin/implementation-notes.md`.

## Deviations from the 028 plan

- The confirm keeps the token hash on the row (status moves to `confirmed`), so a reused link reads
  as `used`, not `unknown`.
- The hash helper is `createLogHash(key)(kind, value)` (the key is injected once in services).
- The per-email check uses `rateLimits.check` instead of `enforce`, so the refusal is recorded
  before the 429 is thrown.
- The per-IP limiter is registered on `/waitlist/*` only: Hono's `/waitlist/*` also matches
  `/waitlist`, and a second registration counted each join twice. Its options stay local to
  `createApp`; 030 attaches its form route in the same place.
- `waitlistJoinSchema` trims and lower-cases the email before validating it.
- `markInvited` / `remove` existed in the service without decision events; 032 replaced them with
  `waitlist-admin.service` (admin actor, decision events).
