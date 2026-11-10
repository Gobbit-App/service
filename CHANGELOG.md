# Changelog

Changes that matter when deploying or running Gobbit: new or changed environment variables,
services and manual steps. Feature detail lives in `specs/` and `docs/`; the full list of
variables is in `README.md` → *Environment Variables (Production)*.

Every change that adds, renames, removes or makes an environment variable required gets an entry
here in the same PR. Mark entries that stop a deploy from starting without action as
**Action required**.

## Unreleased

### 2026-11-10 — Card body limit raised to 2000 characters (D384)

- Migration `0024_card_body_2000` replaces the `items_body_len_chk` CHECK (600 → 2000 code
  points). Its down migration restores 600 as `NOT VALID`: longer bodies stay, new writes are
  checked. No new variables; nothing to set.

### 2026-11-09 — Event cards: shares become events (042, D370, D374–D378, ADR-076)

- Migration `0023_events_ingest` widens the `ingest_jobs.auto_publish` CHECK with
  `held_event_unverified`. Its down migration fails while a row holds that value.
- `POST /ingest` accepts an optional IANA `timeZone`. The share target and paste box send it;
  the iPhone Shortcut sends it once it gains the Format Date `VV` step
  (`docs/shortcut/README.md`). Without it, `INGEST_DEFAULT_TIME_ZONE` (from the backend entry below,
  default `UTC`) applies. No new variables; nothing to set.
- The `EVENT_*` and `INGEST_DEFAULT_TIME_ZONE` variables are now in the Compose `x-api-env`
  block, so the deployed stack passes them through when set.

### 2026-11-09 — Event cards: backend (042, D355–D376)

- Migration `0022_events` adds the `event` card type, `event_cards`, `event_notices`,
  `event_mutes` and a `kind` on `notification_deliveries`. Its down migration refuses while any
  event card exists.
- New optional limits, all with defaults (unset → nothing to set). The four caps may only lower
  the shared limit: `EVENT_NOTIFY_TIMES_MAX` (3), `EVENT_NOTIFY_BEFORE_MAX_DAYS` (365),
  `EVENT_START_MAX_DAYS` (1826), `EVENT_LOCATION_MAX` (200). Also `EVENT_ALLDAY_NOTICE_HOUR`
  (9, 0–23), `EVENT_NOTICE_GRACE_MINUTES` (5) and `INGEST_DEFAULT_TIME_ZONE` (`UTC`, an IANA
  zone). An out-of-range value or an unknown zone stops the API and the worker from starting.

### 2026-11-06 — Share visuals: GobbitBot, richer preview images (041, D343–D353, ADR-075)

- Preview fetches now identify as `GobbitBot/1.0` ([`docs/crawler.md`](docs/crawler.md)); link
  checks keep the browser-like identity.
- New optional `LINK_IMAGE_TRIES` (default 3), `LINK_ARTICLE_IMAGE_MIN_PX` (300) and
  `LINK_LOOKUP_TIMEOUT_MS` (2500). Unset → defaults; nothing to set.
- **After deploying (once)**: `pnpm links:image-backfill` (try `--dry-run` first) enqueues the
  snapshot job for existing link cards with text but no picture. Needs `DATABASE_URL`, plus
  `CLOUDINARY_URL` unless `--dry-run`, and a running worker. Runbook:
  `docs/design/links.md` → *Runbook: image backfill*.

### 2026-11-06 — Dead man's switches for the API and the worker (D342, ADR-074)

- **Action required (to get alerts)**: new optional `HEALTHCHECK_API_URL` and
  `HEALTHCHECK_WORKER_URL` (secrets, `https://` only; an `http://` value stops the process from
  starting). Create the two Healthchecks.io checks and set the ping URLs in the Dokploy
  environment (`infra/README.md` → *Monitoring*). Unset → no pings, no alerts.

### 2026-11-06 — The repo drives the deployed Compose (D341, ADR-073)

- **Action required (once, before merging)**: switch the Dokploy Compose service from *Raw* to
  *Git*: repository `https://github.com/Gobbit-App/service.git`, branch `main`, Compose path
  `./infra/docker-compose.yml`, Autodeploy on. From then on every deploy runs the committed file;
  never edit the Compose in Dokploy.
- Removed from the Compose: the `umami` service and its `UMAMI_DATABASE_URL`, `UMAMI_APP_SECRET`
  and `STATS_HOST` variables. Production already uses the shared Umami in its own Dokploy project;
  `ANALYTICS_UPSTREAM` now defaults to its container (`services-umami-4viuzs-umami-1:3000`).
  Locally, `--profile analytics` still runs a `umami` service from `docker-compose.local.yml`.
- `api`, `worker` and `web` logs rotate (json-file, 50 MB × 10).

### 2026-11-03 — Reminder notifications (037)

- **Action required (only to turn on web push)**: new optional `VAPID_PUBLIC_KEY`,
  `VAPID_PRIVATE_KEY` (secret) and `VAPID_SUBJECT` (`mailto:` or `https://`). Set all three or none
  (a partial set stops the API from starting); generate the pair with
  `pnpm dlx web-push generate-vapid-keys`. Unset → no push: Settings shows only the email switch
  and the push routes answer 404. Reminder emails go out through the existing `MAIL_PROVIDER`.
- New optional tuning variables `NOTIFY_MAX_ATTEMPTS` (default `5`), `NOTIFY_RETRY_BASE_SECONDS`
  (`60`) and `REMINDER_SWEEP_BATCH` (`200`). The worker runs a `reminder-sweep` every minute; it
  uses the notification tables from migration `0021_reminders`, so nothing to migrate.

### 2026-11-03 — Reminder cards (037)

- New optional variables `REMINDER_MAX_DEADLINE_DAYS` (default `1825`),
  `REMINDER_MAX_SHOW_BEFORE_DAYS` (`365`) and `REMINDER_RESOLUTION_MAX` (`600`). They can only
  lower these defaults; a higher value stops the API from starting. Migration `0021_reminders`
  (runs on API start) adds `items.reveal_at`, the `reminders` table with its triggers and the
  notification tables used later by 037. Nothing to do on deploy.

### 2026-11-03 — Analytics consent is opt-in (035 amendment, D281)

- **Action required (privacy)**: no new variables. Analytics now sends nothing until the person
  allows it. Members who never answered stop being counted and see a modal "Help improve
  Gobbit?" question (Allow / No thanks) on their next visit; visitors see the same kind of
  question on the landing, public and share pages. A visitor's device Allow never counts for a
  member. `analytics.config` now logs `consent: "opt_in"` (update any alert that expects
  `opt_out`, see `infra/README.md` § Landing analytics). Expect lower counts until people answer.

### 2026-11-03 — Analytics consent (035)

- **Action required (privacy)**: no new variables. Do Not Track is no longer honoured; analytics
  is on unless declined. Members see a one-time "Help improve Gobbit?" prompt (changeable in
  Settings → Privacy); visitors to the landing, public and share pages see a small banner. API
  pages now load `/analytics/page.js`, which injects the tracker only when the browser hasn't
  declined. Migration `0020_analytics_consent` adds three nullable `users` columns and the
  `analytics_consent_events` audit table (runs on API start). `analytics.config` logs
  `consent: "opt_out"`; counts by choice: `infra/README.md` § Landing analytics.

### 2026-11-01 — App analytics (033)

- **Action required (privacy)**: no new variables, but with `ANALYTICS_SITE_ID` set this deploy
  also measures the app (members identified by their Gobbit user id), public pages and share
  previews: route patterns, screen names and four content events only. The landing page and
  Settings now carry a privacy note; make sure invitees see it before the next invite batch.
  There is no per-surface switch: unset `ANALYTICS_SITE_ID` to turn analytics off everywhere.

### 2026-10-29 — Landing analytics (031, #66)

- **Action required (before deploying the new compose)**: `UMAMI_DATABASE_URL`,
  `UMAMI_APP_SECRET` (Dokploy secrets): the new `umami` service's own database on the shared
  Postgres and a random secret (`openssl rand -hex 32`). Without them only `umami` fails; setup
  in `infra/README.md` § Landing analytics. Re-paste `infra/docker-compose.yml` into Dokploy
  (Compose → *Raw*).
- `ANALYTICS_SITE_ID` (optional, API): Umami website id. Must be a UUID or the API refuses to
  start; unset → no tracker.
- `STATS_HOST` (optional, compose): Umami dashboard hostname (default
  `gobbit-stats.niranhome.win`).
- `ANALYTICS_UPSTREAM` (optional, web): Caddy upstream for `/stats/*` (default
  `gobbit-umami:3000`).

### 2026-10-29 — Registration gate (029, #63)

- `REGISTRATION_MODE` (optional, API + worker): `waitlist` (default, closed sign-up) or `open`.
  Any other value stops the API from starting.

### 2026-10-29 — Waitlist (028, #62)

- **Action required**: `LOG_HASH_KEY` (Dokploy secret, API + worker): ≥ 32 characters
  (`openssl rand -hex 32`), keys `emailHash`/`ipHash` in decision events. **Required in
  production**: the API refuses to start without it. Keep it stable; rotating it only breaks
  matching against older logs.
- `WAITLIST_JOIN_PER_IP_PER_HOUR` (optional, default 10), `WAITLIST_JOIN_PER_EMAIL_PER_HOUR`
  (optional, default 3): waitlist join limits.
