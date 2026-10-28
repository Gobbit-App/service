# Implementation notes: 032-waitlist-admin

Plan: `specs/032-waitlist-admin/plan.md`, tasks: `tasks.md`. Branch `feat/032-waitlist-admin`, on `feat/029-registration-gate` (it needs 029's `users.service.register('waitlist_invite')`; nothing from 030 or 031). E2E tier: full — one admin journey and one negative spec in `e2e/tests/full/waitlist-admin.spec.ts`.

## Decisions not specified by the plan

- **The guard is `/admin/*` middleware, registered before the routes' Zod validation.** A non-admin gets the same `404 /problems/not-found` for every admin URL, malformed ids and bad query strings included, so validation errors can't reveal the surface. `admin.denied` records the route pattern label only.
- **`PlatformAdmin` is a branded user type** returned by the guard; the admin service accepts only that. `GET /me` reads the same list through `platformAdmins.is(user)`.
- **Concurrency**: the invite locks the entry `FOR UPDATE` (`waitlistRepo.lockById`) and calls `usersService.register` inside the same transaction. A deck invite that creates the same user concurrently can still hit the unique email index; that transaction rolls back (500) and a retry links the existing user (`linked_existing`). Rare enough with one or two admins; noted rather than handled.
- **028's placeholder `markInvited` / `remove` are gone from `waitlist.service`**; the only writers are `waitlist-admin.service` (with the admin actor and decision events).
- **Labels**: `WAITLIST_KIND_LABELS` and `WAITLIST_STATUS_LABELS` live in `@pb/shared/waitlist-constants` (028 shipped no labels); 030 can reuse them for the landing form.
- **Malformed ids answer `404` before any DB call** (an admin typo is just "not found").
- **`waitlist.admin_list` carries `page: 'first' | 'next'`** instead of the cursor itself.
- **Wiring**: `buildAdminServices` / `adminTxRepos` in `apps/api/src/admin-wiring.ts` (the `RegistrationDeps` type moved there) keep `app.ts` small.
- **No migration**: 028's `0018_waitlist` already has `invited_by`, `removed_at`, `removed_by`, the status CHECKs and the `(status, created_at)` index.
- **`admin.config`** is recorded in `server.ts` with 029's `bootId`, next to `registration.mode`.
- **Web**: the `admin` query-key root is in `NOT_PERSISTED` (emails never reach IndexedDB). The "email couldn't be sent" notice is kept by the screen, not the row, because a successful invite moves the row to another tab. `/admin/waitlist` renders "Not found" from `GET /me` for non-admins (no separate admin check route). The Settings link sits in a "Platform" section shown only when `me.isPlatformAdmin`.

## Deviations from the plan

- **E2E journey (T024)**: e2e can read neither the confirm nor the invite email and has no database access, so the `@full` journey is join (pending, via the public API) → find under Pending with the kind filter → remove with confirmation → listed under Removed. It runs only when the smoke owner is in `PLATFORM_ADMINS` on the target stack (skipped otherwise); the negative spec runs only when it isn't. Invite → first sign-in → personal deck with `general` is covered by `apps/api/test/admin-waitlist.int.test.ts`. Not run locally (no stack); typechecked.
- **ADR number**: the platform-admins ADR is ADR-064 (ADR-062 and ADR-063 are reserved by 031 and 030).
- **T054–T055** (quickstart on a deployed instance, converge) wait for the deploy.
