# Research: Waitlist with double opt-in

Decisions continue the project-wide D numbering. Phase 9 reserves D217–D240; this feature owns **D217–D221**, **D239** and **D240**. D217–D219 are proposed to become **ADR-061 (registration gate and waitlist)** at Phase 9 close-out, together with 029's gate decisions; D220–D221 need no ADR. D239 is the first implementation of constitution VIII (ADR-060) and is reused by every later feature; D240 applies it to the waitlist.

## What exists today

- **Users** are created only in `usersService.findOrCreateByEmail()` (`apps/api/src/services/users.service.ts`). Its comments already reserve it for the Phase 9 gate (029).
- **Sign-in links** (D22–D26): `POST /auth/magic-link` always answers `200` for a well-formed email; tokens are `base64url(randomBytes(32))` and only `sha256(token)` is stored (`magic_links.token_hash`, `lib/tokens.ts`: `generateToken`, `hashToken`).
- **Rate limits**:
  - D39: `rate_limit_counters` in Postgres, fixed one-hour windows; `rateLimits.enforce(key, limit)` throws `429 /problems/rate-limited` with `Retry-After`; keys in `lib/rate-window.ts` `rateKeys`.
  - D175: an in-process per-IP LRU (`lib/anon-rate-limiter.ts`) through `middleware/public-rate-limit.ts` for anonymous routes, so strangers don't write counter rows.
- **Mail**: `Mailer` (`ResendMailer` / `ConsoleMailer` / `MemoryMailer`) with templates in `apps/api/src/mail/templates.ts` (`signInEmail`, `inviteEmail`, `escapeHtml`).
- **Redirects**: `lib/auth-redirect.ts` builds `${APP_URL}…` landing URLs, falling back to the API when `APP_URL` is unset.
- **Pruning**: weekly pg-boss jobs (`prune-search-queries`, `prune-ingest-jobs`, `prune-deleted-items`) with cron constants in `@pb/shared` and a factory per job (`jobs/prune-search-queries.ts`).
- **Database**: enums are `pgEnum`s declared from `@pb/shared` tuples (`schema/common.ts`); `set_updated_at()` trigger function from `0002_invariants`; hand-written SQL is appended to generated migrations (`0007_default_deck`). No view exists yet. Latest migration: `0017_share_status`.

## D217 — `waitlist_entries` table and statuses

- **Decision**: one table, `waitlist_entries`, one row per email request:
  - `kind` enum `family | community | personal | other`.
  - `source` enum `landing | sign_in`.
  - `status` enum `pending | confirmed | invited | removed`.
  - Optional `note` (≤ 500 code points) and `utm_source` (≤ 64, `[a-z0-9_-]`).
  - Confirmation token hash and expiry.
  - `confirmed_at`, `invited_at`, `invited_by`, `user_id`, `removed_at`, timestamps.

  Rules:
  - The email is stored normalized (`normalizeEmail`), and a CHECK keeps it lower-case.
  - A partial unique index on `email WHERE status <> 'removed'` allows one live entry per email; a removed email can join again.
  - CHECKs tie timestamps to status:
    - `pending` ⇒ token hash and expiry present;
    - `confirmed`/`invited` ⇒ `confirmed_at` present;
    - `invited` ⇒ `invited_at` present;
    - `removed` ⇒ `removed_at` present.
  - Transitions are enforced in `waitlist.service`, not a trigger: the only writers are the service and 032's admin service, which goes through it.
- **Rationale**: the statuses are the funnel PLAN.md demo 6 reports on. Status-consistency CHECKs keep the view honest even if a later writer forgets a column (constitution III). A partial unique index matches how `users_email_active_uq` handles soft deletes.
- **Alternatives considered**:
  - **A `waitlist_events` log instead of a status column**: the status column stays (the view and the CHECKs need it), but D240 adds `waitlist_events` alongside it as the audit record constitution VIII requires.
  - **Storing waitlist people as `users` rows with a `waitlisted` flag**: every user-facing query would need to exclude them, and a waitlisted email would look like an account to the invite flow and to sign-in. The gate (029) depends on "user exists ⇔ may sign in".
  - **Status transition trigger**: duplicates service logic for two writers; the CHECKs already catch inconsistent rows.

## D218 — Join and confirm: one service, no enumeration, double opt-in

- **Decision**:
  - **Service.** `waitlist.service.join({ email, kind, note?, utmSource?, source, ip, website?, skipRateLimits? })` holds every rule. `POST /waitlist` (OpenAPI, JSON) calls it with `source = 'landing'`; 030's HTML form calls the same function; 029's gate calls it with `source = 'sign_in'`, `kind = 'other'`.
  - **Answers.** Every well-formed request answers `202 { ok: true }`. The outcome differs only in what happens next:

    | Case | Row | Mail |
    |------|-----|------|
    | Honeypot filled | none | none (log line `[waitlist] honeypot drop`) |
    | Email belongs to a user | none | `waitlistExistingUserEmail` (sign-in address) |
    | No live entry | insert `pending`, new token | `waitlistConfirmEmail` |
    | `pending` entry | update kind/note/utm (form source only), new token (old one stops working) | `waitlistConfirmEmail` |
    | `confirmed` / `invited` | unchanged | none |

  - **Confirm.** `GET /waitlist/confirm?token=` runs one atomic `UPDATE … SET status = 'confirmed', confirmed_at = now(), confirm_token_hash = NULL WHERE confirm_token_hash = $1 AND status = 'pending' AND confirm_expires_at > now() RETURNING id`, then answers `303` to `${APP_URL}/welcome?confirmed=1`. An unknown, used or expired token answers `303` to `/welcome?confirm=invalid`. Without `APP_URL`, both answer `200` JSON `{ confirmed: boolean }`. The confirm URL lives under the API origin (`${API_URL}/waitlist/confirm`), like `/auth/callback`.
  - **Token TTL.** `WAITLIST_CONFIRM_TTL_DAYS = 7`. A token is 32 random bytes; only its sha256 is stored (`lib/tokens.ts`).
  - **Mail wording.** It depends on `source`: `landing` says "confirm your place on the waitlist"; `sign_in` says "you're not on Gobbit yet; confirm to join the waitlist" (029 relies on this).
  - **Mail failures.** The mail is sent after the row commits. A send failure is logged without the address and still answers `202`, so the visitor can retry from the form.
- **Rationale**:
  - Double opt-in means invites (032) go only to addresses someone controls, and it stops the form being used to sign up other people.
  - The same answer in every case extends D22's no-enumeration rule: the waitlist must not become an "is this email a Gobbit user?" oracle.
  - A `GET` confirm is what a mail client can open. Its outcome is idempotent, so mail-scanner prefetch is harmless.
  - One service keeps the rules identical for the API, the HTML form and the sign-in gate (constitution I).
- **Alternatives considered**:
  - **Single opt-in**: anyone could add anyone; invites would go to unverified addresses.
  - **Reusing `magic_links` with a new purpose** for confirmation tokens: those rows are about sessions and are consumed by `/auth/callback`. Mixing in a non-session purpose risks a confirm token opening a session if a branch is missed. A column on the entry is simpler and single-purpose.
  - **A `POST` confirm behind an interstitial page**: protects against prefetch, but adds a page and a click for no gain here.
  - **`409` for an already-listed email**: enumeration.

## D219 — Spam controls: honeypot plus two rate limits, no CAPTCHA

- **Decision**:
  - **Honeypot.** A `website` field: the HTML form hides it from people (030), and the JSON schema accepts it as an optional string. Any non-empty value is a silent drop (D218 table).
  - **Per-IP limit.** Default `WAITLIST_JOIN_PER_IP_PER_HOUR = 10`, counted in memory with the anonymous limiter: its own `createAnonRateLimiter` bucket, via `publicRateLimit` on `/waitlist` and on 030's `POST /welcome`. JSON callers get `429` problem+json; the HTML form re-renders the landing page with a "try again in about N minutes" notice (030, D228).
  - **Per-email limit.** Default `WAITLIST_JOIN_PER_EMAIL_PER_HOUR = 3`, counted in `rate_limit_counters` under `waitlist:email:<sha256(email)>`. It is checked before any lookup, so a `429` reveals nothing (same order as D39). It caps confirmation mails to one address.
  - **Operator-tunable.** Both values are read from env vars of the same name (`positiveInt(default)` in `env.ts`, like `INGEST_DAILY_CAP`); the defaults live in `limits.ts`. An invalid value fails start-up. Raising the per-IP limit for a launch event is an env change and a redeploy, no code (D240, runbook).
  - **Confirm endpoint.** It shares the per-IP bucket.
  - **Gate calls.** Calls from 029's gate skip both limits, because `POST /auth/magic-link` has already applied its own email and IP limits.
- **Rationale**: a honeypot stops the generic form bots that make up most junk at no cost to people. The rate limits stop targeted flooding and protect the mail budget and sender reputation. Both reuse existing mechanisms; no new dependency, no third-party script (CSP stays `'self'`), and no accessibility cost.
- **Alternatives considered**:
  - **CAPTCHA / Turnstile**: a third-party script and origin (CSP change, privacy notice), and friction against demo 3's "under 30 seconds on a phone". Revisit in Phase 11 if the drops log shows targeted abuse.
  - **A time-to-submit check**: needs a signed timestamp in the form; marginal over the honeypot for now.
  - **Only a DB per-IP counter**: every anonymous request would write a row (D175 avoided this).

## D220 — Retention: weekly prune

- **Decision**:
  - A weekly worker job, `prune-waitlist` (cron `WAITLIST_PRUNE_CRON = '0 6 * * 0'`, after the other Sunday prunes), deletes:
    - `pending` entries whose `confirm_expires_at` is more than `WAITLIST_PENDING_RETENTION_DAYS = 30` days in the past;
    - `removed` entries whose `removed_at` is more than 30 days in the past.
  - It returns the count and logs it (no addresses).
  - Factory `createPruneWaitlist({ waitlist, now })`, same shape as `createPruneSearchQueries`.
- **Rationale**: an unconfirmed address is personal data we never had consent for; 7 days to confirm plus 30 days of grace bounds it at 37 days (SC-005). Removed entries keep their row for 30 days so the summary of a recent week stays stable.
- **Alternatives considered**: deleting at expiry (the summary loses recent "pending" counts the operator wants to compare with confirmations); keeping forever (no reason to).

## D221 — `waitlist_summary` view

- **Decision**: a plain SQL view, hand-written and appended to the generated migration (Drizzle doesn't manage it; the TS layer never reads it):

  ```sql
  CREATE VIEW waitlist_summary AS
  SELECT date_trunc('week', w.created_at)::date AS week,   -- ISO week start (Monday)
         w.kind, w.source,
         CASE WHEN w.status = 'invited'
                   AND EXISTS (SELECT 1 FROM sessions s WHERE s.user_id = w.user_id)
              THEN 'joined' ELSE w.status::text END AS status,
         count(*)::int AS entries
  FROM waitlist_entries w
  GROUP BY 1, 2, 3, 4;
  ```

  - "Joined" means an invited entry whose user has ever had a session. A session is created only by a successful sign-in (or a token exchange after one). `sessions` rows are revoked, never deleted, and are removed only with the user.
  - The view runs as its owner and holds no secrets (no emails, tokens or notes), only counts.
- **Rationale**: demo 6 asks for a SQL view. A view needs no code, no route and no screen, and it can't drift from the table. Deriving `joined` from `sessions` keeps auth free of waitlist writes: 029 and 032 don't have to update the entry when someone signs in.
- **Alternatives considered**:
  - **A materialized view**: the list is small (hundreds to thousands of rows), so it doesn't need refreshing.
  - **A `joined_at` column set in the sign-in callback**: couples the auth transaction to the waitlist for a statistic.
  - **An admin API endpoint for counts**: 032 can add one on top of the view if the screen wants it.

## D239 — Decision events and keyed log hashes (first use of constitution VIII)

- **Decision**:
  - **Helper.** `apps/api/src/lib/decision-event.ts` exports `decisionLogger(component)`. It returns `record(event, { outcome, reason?, ...fields })` over `childLogger(component)`, and its level comes from a per-event map (`info` / `warn` / `error`). Each event's outcomes and reasons are `as const` tuples in the module that emits it, so a typo is a type error. `requestId` comes from the Hono context (`c.var.requestId`) and `jobId` from pg-boss. The convention is in `docs/design/api-conventions.md#decision-events`.
  - **Keyed hashes.** `apps/api/src/lib/log-hash.ts` exports `logHash(value)`: HMAC-SHA256 with `LOG_HASH_KEY`, hex, first 16 characters, and email values are normalized first. The same address always gives the same hash, so the operator can follow one person across events, and nobody without the key can reverse it with a dictionary. Events carry `emailHash` / `ipHash`, never the value.
  - **`LOG_HASH_KEY`.** Required in production (start-up fails without it). Outside production it defaults to a fixed development key. It is rotated by changing the env var; hashes then stop matching older logs, which is acceptable.
  - **Tests.** `apps/api/test/capture-logger.ts` (existing) collects lines; a new `expectDecision(lines, event, { outcome, reason })` next to it asserts them. Every event in a plan's Accountability table has such an assertion.
- **Rationale**: constitution VIII needs one shape for every record so that one `jq` query or one alert rule works across features. Unkeyed sha256 of an email is reversible with a list of likely addresses, so it isn't enough for Principle IV.
- **Alternatives considered**:
  - **Plain sha256** (as the rate-limit keys use): reversible by dictionary. The rate-limit keys stay as they are, because they live in the database, not in shipped logs.
  - **Reusing an existing secret** (`RESEND_WEBHOOK_SECRET`, the Cloudinary secret): it would couple log hashes to a third-party credential's rotation.
  - **OpenTelemetry events / metrics now**: the monitoring backend is a separate decision (PLAN.md Phase 11 item 2). JSON lines are readable by any backend chosen later.

## D240 — Waitlist accountability: events, audit rows and operator controls

- **Decision**:
  - **Events.** Every outcome emits a decision event (D239). The full list, with levels, how each is watched and the default alert thresholds, is the plan's Accountability table.
    - `waitlist.join` has these outcomes:
      - `created` and `resent`;
      - `unchanged`, with reason `already_confirmed` or `already_invited`;
      - `existing_user`;
      - `dropped`, with reason `honeypot`;
      - `refused`, with reason `per_email`.
    - `waitlist.confirm`: `confirmed`, or `invalid` with reason `missing`, `unknown`, `used` or `expired`. The reason comes from a second lookup by token hash that runs only after the atomic `UPDATE` matched nothing; the response is unchanged.
    - `waitlist.mail`: `sent` or `failed`, with field `template` set to `confirm`, `existing_user` or `invite`.
    - `waitlist.prune`: `pruned`, with `pendingDeleted` and `removedDeleted`.
    - `rate_limit.refused`: the per-IP refusal, emitted by the limiter's `onLimited` hook with `bucket: 'waitlist'`, `ipHash` and `retryAfterSec`. 029–032 and the Phase 11 retrofit reuse this name for every bucket.
  - **Audit rows.** The migration adds `waitlist_events` (`id`, `entry_id` uuid without a foreign key so the row outlives the prune, `action` enum `created | resent | confirmed | invited | invite_resent | removed`, `actor_id` FK `users` `ON DELETE SET NULL`, `source`, `created_at`). Each state change inserts its row in the same transaction. The table holds no email, note or token. The prune deletes entries, never their events, so who invited or removed whom stays reviewable. 032's admin actions write here with `actor_id`.
  - **Operator controls.**
    - The two limits are env vars (D219).
    - Clearing one address's per-email counter is a documented SQL statement in the runbook.
    - The per-IP bucket resets on its own within the hour or on an API restart.
    - The runbook (`infra/README.md` § Waitlist) covers reading the events with `jq`, the alert thresholds, raising the limits for an event, and clearing a counter.
- **Rationale**: constitution VIII. Every answer the visitor can't tell apart (D218) is told apart in our records: a honeypot drop, a refusal and an "already listed" each have their own outcome. The audit table keeps admin accountability past the prune without keeping personal data. The env limits answer the owner's question of what control an operator has without a code change.
- **Alternatives considered**:
  - **A request-log line only** (today's behaviour for 429s): it can't distinguish per-IP from per-email, or a honeypot from a real join.
  - **Logging the raw email at debug level**: it breaks Principle IV the moment someone turns debug on in production.
  - **An admin UI for the limits**: an env var is enough for one or two operators. A UI means storing config in the database, which needs its own audit.

## Settled with the owner

- 2026-10-26: 10 joins per IP per hour and 3 per email per hour are fine as defaults. The operator must be able to see and control them, which D240 provides: env-tunable limits, a decision event on every refusal and drop, a friendlier 429 on the form, and a runbook.
