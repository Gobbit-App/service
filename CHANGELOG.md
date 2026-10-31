# Changelog

Changes that matter when deploying or running Gobbit: new or changed environment variables,
services and manual steps. Feature detail lives in `specs/` and `docs/`; the full list of
variables is in `README.md` → *Environment Variables (Production)*.

Every change that adds, renames, removes or makes an environment variable required gets an entry
here in the same PR. Mark entries that stop a deploy from starting without action as
**Action required**.

## Unreleased

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
