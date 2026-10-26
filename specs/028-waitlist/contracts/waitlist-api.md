# Contract: Waitlist join and confirm

Both routes are anonymous: session auth is ignored (a signed-in caller is treated as a stranger), and neither reads `c.var.user`. Both sit behind the waitlist's own per-IP anonymous limiter (`publicRateLimit`, D219).

## 1. `POST /waitlist` (OpenAPI; public URL `/api/waitlist`)

| | |
|---|---|
| Auth | none |
| Body | `WaitlistJoinRequest` (`application/json`) |
| 202 | `{ "ok": true }`: new entry, pending entry resent, already confirmed/invited, existing user, honeypot drop (indistinguishable) |
| 400 | `application/problem+json` `/problems/validation` with field errors (malformed email, unknown kind, note too long, unknown fields) |
| 429 | `/problems/rate-limited` + `Retry-After`: per IP (in memory) or per email (`waitlist:email:<sha256>`, checked before any lookup). The detail is the same for both limits; the reason is in the decision event |

```json
{ "email": "parent@example.test", "kind": "family", "note": "School and clinic numbers", "utmSource": "school-group" }
```

```json
{ "ok": true }
```

Order inside `waitlist.service.join` (contract-relevant because it decides what leaks):

1. Schema validation (`400`).
2. Honeypot non-empty → event `waitlist.join` `dropped`/`honeypot`, return (`202`). No row.
3. Per-email counter → event `waitlist.join` `refused`/`per_email`, `429`. The per-IP limit already ran in middleware, and its `onLimited` hook records `rate_limit.refused` (`bucket: 'waitlist'`, `ipHash`).
4. User with this email exists → existing-user mail, event `unchanged`/`existing_user`, return.
5. Live entry: `pending` → new token, update fields, audit row `resent`, confirmation mail, event `resent`; `confirmed`/`invited` → event `unchanged`/`already_confirmed`|`already_invited`, return.
6. No live entry → insert `pending` plus audit row `created` in one transaction, confirmation mail, event `created` (`INSERT … ON CONFLICT` on the partial unique index turns a concurrent duplicate into step 5).

Each mail send records `waitlist.mail` (`sent`, or `failed` at error level) with `template`. All events carry `requestId`, `emailHash` and `ipHash` (keyed, D239) and never the address. The full list is in the plan's Accountability table.

The response is sent only after step 4–6 finish (mail included), so timing doesn't separate a honeypot drop from a real request by more than the mail call. The honeypot path awaits a no-op of similar cost. Exact timing equality is not a goal; the content is identical.

CSRF: JSON requests from the same origin pass `middleware/csrf.ts` as today; there is no cookie-based state to protect.

## 2. `GET /waitlist/confirm?token=<token>` (outside OpenAPI, like `/auth/callback`; public URL `/api/waitlist/confirm`)

| | |
|---|---|
| Auth | none |
| Query | `token`: the base64url token from the mail |
| 303 | `Location: ${APP_URL}/welcome?confirmed=1` on success |
| 303 | `Location: ${APP_URL}/welcome?confirm=invalid` for an unknown, used or expired token, or a missing `token` |
| 200 | without `APP_URL`: `{ "confirmed": true \| false }` |
| 429 | per-IP limit (shared bucket) |

Event `waitlist.confirm`:

- `confirmed`, with `entryId`, plus audit row `confirmed` in the same transaction;
- `invalid`, with reason `missing`, `unknown`, `used` or `expired`. The reason comes from a second lookup by token hash (`findByTokenHash`) after the atomic update matched nothing.

The link in the mail is `${API_URL}/waitlist/confirm?token=…` (same base as sign-in links). `Cache-Control: no-store`; `Referrer-Policy: no-referrer` so the token isn't leaked to the landing page's analytics (031).

## 3. Service API (internal, for 029, 030 and 032)

```ts
waitlist.join(input: {
  email: string; kind: WaitlistKind; note?: string; utmSource?: string;
  source: 'landing' | 'sign_in'; ip: string; website?: string;
  skipRateLimits?: boolean;            // 029's gate: magic-link limits already applied
}): Promise<void>;

waitlist.confirm(token: string): Promise<{ confirmed: boolean }>;

// Used by 032 inside its own transaction; throw a 409 problem when the entry is in the wrong state.
// Both write a `waitlist_events` row with actor_id in the same transaction (D240).
waitlist.markInvited(r: { id: string; invitedBy: string; userId: string }): Promise<WaitlistEntryRow>;
waitlist.remove(r: { id: string; removedBy: string }): Promise<WaitlistEntryRow>;
```

`join` never throws for the "already listed / existing user / honeypot" cases. It throws only for validation (`400`), rate limits (`429`) and infrastructure errors.

## 4. Worker job `prune-waitlist`

Scheduled `WAITLIST_PRUNE_CRON`; deletes expired `pending` and old `removed` entries (D220), never their `waitlist_events` rows; records `waitlist.prune` `pruned` with `jobId`, `pendingDeleted` and `removedDeleted`.

## 5. SQL

```sql
SELECT * FROM waitlist_summary ORDER BY week DESC, kind, source, status;
```

| week | kind | source | status | entries |
|------|------|--------|--------|---------|
| 2026-11-02 | family | landing | confirmed | 12 |
| 2026-11-02 | family | landing | pending | 3 |
| 2026-11-02 | other | sign_in | pending | 2 |
