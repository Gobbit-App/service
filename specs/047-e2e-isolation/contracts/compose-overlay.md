# Contract: `infra/docker-compose.e2e.yml`

Layered after `docker-compose.yml` and `docker-compose.local.yml`; used only by the runner. Values marked
`${…}` come from the runner's generated `e2e/.stack/compose.env`, never from the shell.

| Service | Change | Why |
|---------|--------|-----|
| `db` | `ports: !reset []` | no fixed host port; concurrent runs |
| `api` | `ports: !reset []`; environment: `REGISTRATION_MODE=open`, `MAIL_PROVIDER=smtp`, `SMTP_URL=smtp://mailpit:1025`, `API_URL=${API_URL}`, `APP_URL=${APP_URL}`, `CLOUDINARY_URL=${CLOUDINARY_URL}`, `PLATFORM_ADMINS=${PLATFORM_ADMINS}`, `LOG_HASH_KEY=${LOG_HASH_KEY}`, `MAGIC_LINK_PER_IP_PER_HOUR=100000`, `CALLBACK_PER_IP_PER_HOUR=100000`, `PROFILE_UPDATE_RATE_PER_HOUR` unset (production default) | open sign-up and a readable mailbox; per-IP limits only (D435) |
| `worker` | same mail settings as `api` (shares `x-api-env`) | worker mail also lands in the mailbox |
| `web` | `ports: !override ["127.0.0.1:${WEB_PORT}:80"]`; `networks: !override [default]` | chosen port; no external `dokploy-network` |
| `mailpit` (new) | image `axllent/mailpit:<pinned version>`; `ports: ["127.0.0.1:${MAILBOX_PORT}:8025"]`; healthcheck on `/api/v1/info`; SMTP on 1025 reachable only inside the project | the test mailbox (D433) |
| top level | `networks: !reset {}` is not used; the external `dokploy-network` stays declared but unused | Compose does not require unused external networks to exist |

Not set, deliberately: any AI key (ingestion and search stay text-only, as today in CI), `ANALYTICS_SITE_ID`
(analytics off), VAPID keys (push off), `INGEST_EMAIL_DOMAIN`.

Pinned image versions follow the existing practice (the `umami` image is pinned); the plan task picks the
current Mailpit release and records it.
