# Research: Waitlist admin and invite

Decisions continue the project-wide D numbering. Phase 9 reserves D217–D240. This feature owns **D234–D238**. D234 outlives the feature (Phase 12 reuses it) and becomes ADR-064 at close-out ("platform admins"); the others stay here.

## What exists today

- Users are created in one place, `usersService.findOrCreateByEmail()` (D25). 029 splits it into a lookup for sign-in and one guarded registration entry point (`usersService.register(email, reason)`, reasons `deck_invite` and `waitlist_invite`); this feature calls it with `waitlist_invite`.
- Sign-in links: `magic_links` rows with `purpose` `sign_in | invite`, a per-row `expires_at`, and an optional `next`; `GET /auth/callback` consumes, resolves the user, runs `ensurePersonalDeck` (Phase 3B) and opens the session in one transaction.
- `GET /me` returns `{ user: { id, email, displayName }, decks }` (`meSchema` in `packages/shared/src/schemas/auth.ts`).
- There is no notion of a platform-wide admin. Deck roles (`resolveRole`, `can()`) are per deck. Phase 12's plan names `PLATFORM_ADMINS` for `/admin/domains`.
- 028 adds `waitlist_entries` (statuses `pending | confirmed | invited | removed`, `invited_at`, `invited_by`, `user_id`) and `waitlistService`; 029 adds `REGISTRATION_MODE`.
- Account settings live at `/settings` (`apps/web/src/settings/SettingsScreen.tsx`, `SettingsSection`); deck settings at `/d/$slug/settings` (`deck-admin/`, D184). Routes are code-split by TanStack Router's `autoCodeSplitting`; `pnpm budget` checks initial JS.

## D234 — Platform admins from an env list

- **Decision**: `PLATFORM_ADMINS` (comma-separated emails, trimmed, lower-cased, empty by default) parsed in `env.ts`. `access/platform-admin.ts` exports `isPlatformAdmin(user, env)` and a service guard `requirePlatformAdmin(user)` that throws the standard 404 problem (`/problems/not-found`) for everyone else — signed-out callers get the usual 401 from session auth first. `GET /me` gains `isPlatformAdmin: boolean`. Admin routes live under `/admin/*` in OpenAPI with tag `admin`.
- **Rationale**: one or two operators; an env list needs no migration, no UI to grant itself, and can't be changed by a compromised app session. 404 matches ADR-004 ("what you can't see doesn't exist") and doesn't advertise the surface. Phase 12 reuses the same helper for `/admin/domains`, so it is worth an ADR.
- **Alternatives considered**: a `users.is_platform_admin` column (needs a way to set it — SQL or a bootstrap path — and widens what a DB write can grant); account owner of a "system" deck (overloads deck roles); 403 for non-admins (reveals the surface).

## D235 — Admin waitlist API

- **Decision**: three routes, all behind `requirePlatformAdmin`:
  - `GET /admin/waitlist?status=&kind=&cursor=&limit=` — default `status=confirmed`; order by `confirmed_at` ascending for `confirmed`, `invited_at` descending for `invited`, `created_at` descending otherwise; keyset cursor; `limit` ≤ 100 (default 50); response includes `counts` per status for the current `kind` filter.
  - `POST /admin/waitlist/{id}/invite` — `201` on first invite, `200` on resend of an `invited` entry; `409 /problems/waitlist-not-confirmed` for `pending`, `409 /problems/waitlist-removed` for `removed`; `404` unknown id.
  - `DELETE /admin/waitlist/{id}` — `pending|confirmed` → `removed`, `204`; `409 /problems/waitlist-invited` for invited; already removed → `204` no-op.
  Rules live in a new `waitlist-admin.service.ts`; SQL in 028's `waitlist.repo.ts` (new list/lock/mark functions).
- **Rationale**: the three things the demo and housekeeping need, nothing more. Default to `confirmed` because that's the invite queue; oldest confirmed first is first-come-first-served.
- **Alternatives considered**: offset paging (fine at this size, but keyset matches `GET /decks/{id}/events`); a single `PATCH { status }` (hides the invite side effects behind a field write); bulk invite (deferred, spec).

## D236 — Invite in one transaction, mail after commit

- **Decision**: `waitlistAdmin.invite(admin, id)`:
  1. In one transaction: lock the entry `FOR UPDATE`; check status; `usersService.register(email, 'waitlist_invite')` (returns the existing user when the email already has one — a deck invite may have created it meanwhile); set `status = invited`, `invited_at = now()`, `invited_by = admin.id`, `user_id`; insert a `sign_in` magic link with `expires_at = now() + WAITLIST_INVITE_TTL_DAYS` and `next = null`.
  2. After commit: send `waitlistInviteEmail({ link, ttlDays })` ("You're in"); on failure record `waitlist.mail` `failed` (`template: invite`, `entryId`) and return `{ entry, mailSent: false }` (200/201 still), so the screen offers "Resend".
  Resend on an `invited` entry skips step 1's writes except a new magic link (older unused links stay valid until they expire — the account exists, so they grant nothing a normal sign-in wouldn't).
  The personal deck is **not** created here; `consumeMagicLink` runs `ensurePersonalDeck` on first sign-in as for everyone (Phase 3B), which is what demo 5 checks. `WAITLIST_INVITE_TTL_DAYS` default 7 (`WAITLIST_INVITE_TTL_DAYS_DEFAULT` in `@gobbit/shared`).
- **Rationale**: the row lock serialises concurrent invites (second admin gets 200 resend semantics only if the first committed; otherwise waits). Reusing `sign_in` links needs no enum migration and the callback already handles them; a longer TTL fits "email sits in an inbox for a few days". Mail after commit avoids sending a link for a rolled-back account.
- **Alternatives considered**: a new `magic_link_purpose` `waitlist_invite` (migration and a callback branch for no behaviour difference); creating the deck at invite (duplicates Phase 3B and would hide a broken onboarding path, exactly what the demo guards); mail inside the transaction (a slow provider holds the lock; a send that succeeds before a rollback leaves a dead link); expiring older links on resend (extra writes; no security gain once the account exists).

## D237 — Admin screen in the PWA

- **Decision**: route `/admin/waitlist` (`apps/web/src/routes/admin.waitlist.tsx`, code-split) rendering `apps/web/src/admin/WaitlistScreen.tsx`: status tabs with counts, kind select, a list of entry rows (email, kind label, note with `dir="auto"`, source, dates), and per-row actions — Invite (confirmed), Resend (invited), Remove (pending/confirmed, with confirm). A "Waitlist" link in `SettingsScreen` renders only when `me.isPlatformAdmin`. The waitlist query key's root is added to `NOT_PERSISTED` in `apps/web/src/api/persist.ts` (as the review queue and activity log are, D188), so emails never reach IndexedDB; offline shows "The waitlist needs a connection." Kind labels come from 028's `WAITLIST_KIND_LABELS` in `@gobbit/shared/waitlist`.
- **Rationale**: the operator already has the PWA on their phone; a separate admin app doubles auth and deploys. Code-splitting keeps the budget; not persisting avoids storing other people's emails on a device (constitution IV spirit).
- **Alternatives considered**: SQL only (fails SC-001 on a phone); an API-rendered HTML admin page (needs its own CSRF and form handling for writes); persisting like deck data (other people's personal data offline).

## D238 — Every admin action and refusal is recorded

- **Decision**: constitution VIII (ADR-060). Uses 028's `decisionLogger` (D239) and `waitlist_events` audit table (D240).
  - **Durable record**:
    - the entry row keeps `invited_by`/`invited_at` and `removed_by`/`removed_at` (they ship in 028's `0018_waitlist`);
    - each invite, resend and removal also inserts a `waitlist_events` row (`invited`, `invite_resent`, `removed`, with `actor_id` = the admin) in the same transaction as the change;
    - those rows have no email and survive the 30-day prune, so "who removed this, and when" stays answerable after the entry is gone;
    - the account created by an invite carries `registered_via = 'waitlist_invite'` and `registered_by` = the admin (029's D241).
  - **`waitlist.admin`**, one per write call, with `actorId`, `entryId` and `action` (`invite` / `remove`):
    - invite outcomes: `invited`, `resent`, `linked_existing` (the email already had an account), or `refused` with reason `pending`/`removed`/`not_found`;
    - remove outcomes: `removed`, `unchanged` (already removed), or `refused` with reason `invited`/`not_found`.
  - **`waitlist.admin_list`**, one per list call: `actorId`, `status`, `kind?`, `returned` (count), `page` (first or next). Reading the list reveals emails, so who looked is recorded too.
  - **`waitlist.mail`** (028) with `template: 'invite'`, `sent`/`failed`, `entryId`.
  - **`admin.denied`** (warn), one per refused request to `/admin/*`: reason `not_admin` (signed in, with `actorId`) or `signed_out`, plus `route`.
  - **`admin.config`** at API start-up: `count` of configured admins (never the emails), `warn` when the count is 0 in production.
- **Rationale**: platform admins see every waiting person's email and can create accounts, so their actions are the ones most worth being able to review. An id-only log line answers "who" but can't be alerted on by outcome, and it is gone when log retention ends. The audit row is cheap and already exists from 028. Recording list reads costs one line per screen load. The denied events show a member probing admin addresses, which a 404 hides from everyone else.
- **Alternatives considered**: log lines only (the earlier draft; no closed outcome set, nothing durable); a generic `admin_events` table (028's `waitlist_events` already covers waitlist actions; Phase 12 decides for `/admin/domains`); logging the email (personal data in logs).
