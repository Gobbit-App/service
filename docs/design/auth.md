# Authentication, personal deck, authorization, visibility, rate limits

_Overview: [architecture.md](../architecture.md). Decisions: [adr.md](../adr.md)._

## Authentication

### Magic links (D22–D26)

1. `POST /auth/magic-link { email }` always answers `200 { ok: true }` (no account enumeration; a malformed email is `400`). Rate limits run first (see below). The link token is `base64url(randomBytes(32))`; only `sha256(token)` is stored in `magic_links.token_hash`.
2. The mail (`Mailer`: `ResendMailer` / `ConsoleMailer` / `MemoryMailer`, chosen by `MAIL_PROVIDER`) carries `${API_URL}/auth/callback?token=…`. Sign-in links live `MAGIC_LINK_TTL_MINUTES` (15), invite links `INVITE_TTL_DAYS` (7).
3. `GET /auth/callback?token=` consumes the link with one atomic `UPDATE … WHERE used_at IS NULL AND expires_at > now() RETURNING *` (zero rows → invalid/used/expired, reason derived afterwards). The user is found, or created through the registration gate below, in exactly one place, `users.service.register()` (D25, D224). For invites it sets `accepted_at`. In the same transaction, `usersService.ensurePersonalDeck()` makes sure the user has a personal deck (Phase 3B) before the cookie session opens; a failure there rolls the whole callback back and redirects to `/auth/error?reason=onboarding`. It answers `303` to `${APP_URL}${next}` (or `${API_URL}/me` without `APP_URL`); `next` must be a relative path (`^/[^/\\]`). A bad link → `303 ${APP_URL}/auth/error?reason=…` or `401 /problems/magic-link-invalid`.

### Registration gate (D222–D224, D241)

- **Mode**: `REGISTRATION_MODE` is `waitlist` (default, closed) or `open`. The process logs `registration.mode` at start-up, at `warn` when production runs `open`.
- **At request time**: after the rate limits, `POST /auth/magic-link` looks the address up (`usersService.findExisting`, never creates). With the gate closed an unknown address gets no link: it is passed to `waitlist.service.join` (`kind: other`, `source: sign_in`, limits skipped because the sign-in limits already ran) and receives the waitlist mail. The answer is the same `200 { ok: true }` either way (D22).
- **One creation point**: `usersService.register(email, reason, { requestId, actorId? })` is the only caller of `usersRepo.createWithAccount`. Reasons: `deck_invite` (invites, any mode), `waitlist_invite` (032, any mode) and `open_sign_in` (callback, only when `open`; otherwise `RegistrationClosed`). New rows record `registered_via` and `registered_by` (the inviter); rows that predate the gate have both null.
- **Closed callback**: a sign-in link for an address without a user (e.g. requested before the gate closed) fails with `MagicLinkFailure('closed')`; the transaction rolls back, so the link stays unused and no user, deck or session is left. The route answers `303 ${APP_URL}/auth/error?reason=closed` or `401 /problems/magic-link-invalid` ("Registration is closed").
- **Decision events**: `auth.magic_link` (`sent`/`waitlisted`/`refused` · `per_email`/`per_ip`), `auth.callback` (`signed_in`/`failed` · reason), `users.register` (`created`/`existing`/`refused` · `registration_closed`, with `via`, `actorId`), `registration.mode` (`configured`). Queries and thresholds: `infra/README.md` § Registration gate.

#### Deviations

- `register` takes a context object `{ requestId, actorId? }` instead of a bare `actorId` (decision events need the request id).
- `requestMagicLink` checks the limits with `rateLimits.check` instead of `enforce`, so a refusal is recorded before the 429.
- `registration.mode` is recorded in `server.ts` after the listener starts, correlated by a per-process `bootId` (the decision logger accepts `bootId` besides `requestId`/`jobId`), not in `app.ts`, which every test builds.
- The "Join the waitlist" links on `/sign-in` and `/auth/error?reason=closed` ship with 030 (they target `/welcome`).

### Sessions (D27–D31)

- `sessions` rows are opaque random tokens stored as hashes, `kind` `cookie | bearer`, sliding lifetime `SESSION_TTL_DAYS` (90): `last_seen_at`/`expires_at` are bumped in one `UPDATE` at most once an hour.
- Cookie `gobbit_session`: `HttpOnly`, `SameSite=Lax`, `Path=/`, `Secure` per `COOKIE_SECURE`, `Domain` per `COOKIE_DOMAIN` (host-only when unset).
- **Precedence**: `Authorization: Bearer` first; the cookie only when no bearer header exists. A bad bearer is `401 /problems/session-invalid` even with a valid cookie.
- `POST /auth/token-exchange` (cookie-authenticated only) mints a separate `bearer` session and returns `{ token, expiresAt }` once.
- `POST /auth/logout` revokes the current session (clears the cookie); `POST /auth/logout-all` revokes all of the user's sessions.
- Lookup is by hash, then `timingSafeEqual` on the stored hash. All expiry logic reads the injected clock `now()` (D42).

### CORS and CSRF (D32)

`hono/cors` with `CORS_ORIGINS` and `credentials: true`. `middleware/csrf.ts` wraps `hono/csrf` over `CORS_ORIGINS` plus the API's own origin, for cookie-authenticated unsafe requests; requests with an `Authorization` header skip it. Rejections are `403` problem+json.

## Personal deck and first card (Phase 3B)

Supersedes D25's "no deck is auto-created": every account gets exactly one personal deck, ensured on every sign-in (new users, invitees, and accounts that predate this phase; no backfill migration).

- **Marker**: `decks.is_default` (TS `isDefault`) marks the personal deck. Its `kind` is `personal`, but other decks can also be `personal`, so code finds it only by the flag: `decks.repo#findDefaultForAccount(accountId)`.
- **DB invariants** (migration `0007_default_deck`, hand-written part appended to the generated SQL; down file `migrations/down/0007_default_deck.down.sql`): partial unique index `decks_default_per_account_uq` on `(owner_account_id) WHERE is_default AND deleted_at IS NULL`; CHECK `decks_default_is_personal` (`NOT is_default OR kind = 'personal'`); CHECK `decks_slug_not_reserved` (`slug <> 'me'`); trigger `decks_protect_default` (BEFORE DELETE OR UPDATE OF deleted_at, is_default) raising `default_deck_protected` (P0001) unless `pg_trigger_depth() > 1`, so an account delete can cascade.
- **Ensure**: `usersService.ensurePersonalDeck(user)` sits next to `register()`. It inserts with `ON CONFLICT DO NOTHING` and reads the row back (`ensureDefault`), so it is idempotent. `GET /auth/callback` runs consume link, find or create user, ensure deck, open session in one transaction (`buildCallbackRepos` in `services/index.ts`). An ensure failure is logged (`[auth] onboarding failed`) and surfaces as `MagicLinkFailure('onboarding')`.
- **Address**: the stored slug is `personal-<accountId>` and is never shown. `resolveDeck` maps `me` to the caller's default deck (404 when there is none), and `toDeckDto` returns `slug: 'me'` when `isDefault`. `me` is `RESERVED_DECK_SLUG` in `@pb/shared`, which no other deck can take. The default name is `PERSONAL_DECK_NAME` ("My deck") and can be renamed.
- **409 rules** (`/problems/personal-deck`): deleting the deck, patching `slug` or `isPublic` on it, and inviting a member to it. Renaming is allowed.
- **Landing (web)**: `pickLanding` in `lib/last-deck.ts` opens the last deck if it is still listed, else `me`, else the only deck, else the home list. The home empty state reads "No decks yet".
- **Card editor (web)**: `/d/$slug/new` (`routes/d.$slug.new.tsx`) renders `CardEditor` inside the deck layout. It creates text and link cards only, with the category defaulting to the deck's default one. `useCreateItem` posts to `POST /decks/{id}/items` and invalidates every item list. API field errors show in `role="alert"` (`problemMessages`). The "Add card" link (`AddCardLink`) appears only for roles with `item.create`.

## Authorization (D33–D35)

- `resolveRole(user, deck, membership)`: users of the deck's `owner_account_id` are implicitly `owner`; otherwise the **accepted** membership's role; pending or none → no role.
- `can(role, permission)` (`@pb/shared` authz) is a pure table over the `Permission` union; the matrix is unit-tested exhaustively.
- `authorize()` combines both: no role → `404` (ADR-004); role lacking the permission → `403 /problems/forbidden` with `permission` and `role` extension members.
- `GET /decks` and `GET /me` return owned ∪ accepted-member decks, each with the caller's `role`.
- Memberships: `GET /decks/:id/members` (implicit owner first, pending included), `POST /decks/:id/invites { email, role }` (creates the user if needed, pending membership + invite link; `201`, resend `200`, accepted member `409`, self `400`), `DELETE /decks/:id/members/:userId`.
- Role change (D185): `PATCH /decks/:id/members/:userId { role }` needs `member.invite` + `member.remove` (owners and co-owners). `409` for the caller's own role (`/problems/own-role`), a user of the owner account (`/problems/implicit-owner`), a pending invite (`/problems/invite-pending`, re-invite instead) and for demoting the last `owner` membership of a deck whose account has no users (`/problems/last-owner`; `memberships.repo.updateRole` locks the deck's owner rows `FOR UPDATE` in the same transaction). The same role is a `200` no-op; the new role applies on the next request (roles are resolved per request).
- A resend to a pending member replaces the invite: the membership takes the new `role`, inviter and `invited_at`, and every unused invite link of that membership is expired (it reports `reason=expired`), so only the newest link works.
- `owner` memberships (co-admins) get every owner permission except `deck.delete`: `DELETE /decks/:id` additionally requires the caller to belong to the deck's owner account (`403 /problems/forbidden`, `permission: deck.delete`, `role: owner`). This is the one rule outside the `can()` matrix (D34 had deferred resource-level rules).

## Visibility (D38)

`visibleCategoriesWhere(role)` (`access/visibility.ts`) is the single predicate: owner/maintainer → all; editor/reader → `shared` + `public`; no role → `public` (Phase 8). It is applied in:

1. category listing,
2. item listing (`EXISTS` over `item_categories ⋈ categories`, so pagination stays consistent),
3. item get (no visible category → `404`),
4. the `?category=` slug filter (invisible → `404`),
5. `categoryIds` validation on create/patch (invisible → `400`),
6. the item DTO (`categoryIds` lists only visible categories).

## Rate limits (D39–D40)

Postgres table `rate_limit_counters`, fixed one-hour windows, `INSERT … ON CONFLICT DO UPDATE SET count = count + 1 RETURNING count`. Keys and limits (from `@pb/shared`): `magic-link:email:<sha256>` 5, `magic-link:ip:<ip>` 20, `callback:ip:<ip>` 30; Phase 6 adds `media-sign:user:<id>` 60 and `link-preview:user:<id>` 30 (008). The email counter is checked before any user lookup, so a `429 /problems/rate-limited` (with `Retry-After`) reveals nothing. Rows older than two windows are purged on ~1% of increments. The client IP is the socket address unless `CLIENT_IP_HEADER` names a trusted header; `X-Forwarded-For` is never trusted implicitly.
