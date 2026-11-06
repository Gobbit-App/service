# infra

| File | Used by | What it is |
| --- | --- | --- |
| `docker-compose.yml` | Dokploy (deployed, cloned from `main`) | `api` + `worker` + `web` (GHCR images; `worker` is the API image with the `worker` entrypoint), no database (the API uses the shared Postgres, D67) and no Umami (the shared one, D341), no host ports, rotated container logs, all non-secret deployed values as defaults; only `web` has Traefik labels and joins `dokploy-network` |
| `docker-compose.local.yml` | `pnpm compose:{up,down}` | Adds the local `db` (pgvector/pg17), builds both images from source, publishes ports on `127.0.0.1` (web on 8080), plain-HTTP defaults, API in `development` mode; a local `umami` only with `--profile analytics` (port 3001, alias `gobbit-umami`) |
| `db-init/` | local `db` first start | Creates the `vector` and `pg_trgm` extensions |

## Deployed layout

```
phone ─HTTPS─▶ Cloudflare ─tunnel─▶ cloudflared (Dokploy compose service)
                                         │  dokploy-network
                                         ▼
                                      Traefik ── Host(gobbit.niranhome.win) ──▶ web:80 (Caddy, apps/web/Caddyfile)
                                                                                  │ default network
           /api/* (strip), /s/*, /p/*, /welcome, / w/o session, sitemap, robots ──┤──▶ api:3000 ──▶ shared Postgres (DATABASE_URL)
                                                     everything else ─────────────┘    static files, SPA fallback
                                                                                       worker ──▶ shared Postgres (pg-boss jobs: embeddings, ingestion)
                                                                                         └─▶ shared URLs on the internet (SSRF-guarded), Cloudinary, LLM providers
                               /stats/script.js, /stats/api/send (strip /stats) ──▶ shared Umami (own Dokploy project, dokploy-network; other /stats/* → 404)
```

**The repo drives the deploy (D341, ADR-073):** the Dokploy Compose service is a *Git* source (repository `https://github.com/Gobbit-App/service.git`, branch `main`, Compose path `./infra/docker-compose.yml`, Autodeploy on). Every deploy clones `main` and runs this file as committed, so a merged change (new service, env var, healthcheck) reaches production with nothing to copy, and CI's e2e job has already run the same file with `up --wait`. Never edit the Compose in Dokploy; change it here. The CI webhook sends `ref: refs/heads/main`, which Dokploy checks against the branch. Dokploy writes its environment to `infra/.env` in the clone, next to the file.

Dokploy environment for this Compose project — secrets only (D52): `DATABASE_URL`, `RESEND_API_KEY`, `CLOUDINARY_URL`, and optionally `OPENROUTER_API_KEY` (embeddings, Ask and ingestion; preferred) or the direct fallbacks `OPENAI_API_KEY` (embeddings) and `ANTHROPIC_API_KEY` (Ask and ingestion), plus `RESEND_WEBHOOK_SECRET` for email-in, and `LOG_HASH_KEY` (required: keys the hashes in decision events, ≥ 32 characters). `api` and `worker` share one environment (the `x-api-env` anchor), so every variable reaches both: the worker uploads, fetches and calls the extraction model. Setting up the shared database (role, database, extensions, external port, TLS) is in the root `README.md` → *Shared database*. Everything else (`API_URL`, `APP_URL`, `MAIL_PROVIDER`, `MAIL_FROM`, `CLIENT_IP_HEADER`, …) is a default in `docker-compose.yml`. Optional overrides: `API_IMAGE_TAG` / `WEB_IMAGE_TAG` (default `latest`), `PUBLIC_HOST`, `TRAEFIK_ENTRYPOINT`, `ASK_MODEL`, `EMBEDDING_MODEL`, `EXTRACT_MODEL`, `EXTRACT_ESCALATION_MODEL`, `INGEST_DAILY_CAP`, `SHORTCUT_URL` (the published Shortcut's iCloud link) and `INGEST_EMAIL_DOMAIN` (email-in, together with `RESEND_WEBHOOK_SECRET` and `RESEND_API_KEY`; see the root `README.md` and `docs/shortcut/README.md`). Email-in also needs MX records for that domain pointing at Resend; the webhook reaches the API through `web` (`/api/webhooks/resend/inbound`), so no extra route is needed. There is no Dokploy "Domains" entry; the router comes from the `web` labels. `COOKIE_SECURE` defaults to `true` and must stay that way.

## Waitlist

Decision events are JSON lines on the `api` / `worker` stdout (constitution VIII, ADR-060, `docs/design/waitlist.md`). People appear only as `emailHash` / `ipHash` (HMAC with `LOG_HASH_KEY`). Until a monitoring backend exists (PLAN.md Phase 11), read them with `jq`:

| Event | Query | Alert when (default) |
| --- | --- | --- |
| Joins by outcome | `jq -c 'select(.event=="waitlist.join") \| [.outcome,.reason,.source]' \| sort \| uniq -c` | volume baseline only |
| Honeypot drops | `jq 'select(.event=="waitlist.join" and .outcome=="dropped")'` | > 50 per hour, or > 50% of joins over 6 hours |
| Per-email refusals | `jq 'select(.event=="waitlist.join" and .reason=="per_email") \| .emailHash'` | > 20 per hour, or one hash in 3 windows in a day |
| Per-IP refusals | `jq 'select(.event=="rate_limit.refused" and .bucket=="waitlist") \| .ipHash'` | > 30 per hour, or one hash in 3 windows in a day |
| Confirms | `jq -c 'select(.event=="waitlist.confirm") \| [.outcome,.reason]'` | confirmed ÷ created < 30% over 7 days; `invalid` > 20 per hour |
| Mail | `jq 'select(.event=="waitlist.mail" and .outcome=="failed")'` | any failure; > 5% per hour |
| Prune | `jq 'select(.event=="waitlist.prune")'` (worker) | no event for 8 days |

To follow one address, hash it with the same key: `node -e "const c=require('crypto');console.log(c.createHmac('sha256',process.env.LOG_HASH_KEY).update(process.argv[1].trim().toLowerCase()).digest('hex').slice(0,16))" someone@example.test`, then `jq 'select(.emailHash=="<hash>")'`.

**Raising a limit for a launch event**: set `WAITLIST_JOIN_PER_IP_PER_HOUR` (default 10) or `WAITLIST_JOIN_PER_EMAIL_PER_HOUR` (default 3) in the Dokploy environment and redeploy; remove it afterwards. An invalid value stops the API from starting.

**Clearing one address's counter** (the per-IP bucket is in memory and resets within the hour or on restart):

```sql
DELETE FROM rate_limit_counters
WHERE key = 'waitlist:email:' || encode(sha256(convert_to(lower(trim('someone@example.test')), 'UTF8')), 'hex');
```

**One entry's history** (rows outlive the prune and hold no email):

```sql
SELECT action, source, actor_id, created_at FROM waitlist_events
WHERE entry_id = (SELECT id FROM waitlist_entries WHERE email = lower('someone@example.test'))
ORDER BY created_at;
```

### Landing page

`apps/web/Caddyfile` sends `/` to the API's landing page (rewritten to `/welcome`, header `X-Gobbit-Via: root`) only when the request carries no `gobbit_session` cookie; `/welcome` and `/welcome/joined` always go to the API with any client `X-Gobbit-Via` removed. If the rule breaks, members land on the waitlist page or strangers on an empty app shell; the `via` counts show it:

| Event | Query | Alert when (default) |
| --- | --- | --- |
| Landing renders by route | `jq -c 'select(.event=="landing.render") \| [.state,.via]' \| sort \| uniq -c` | `via` `root` drops to 0 for an hour while `direct` continues; `signed_in` share jumps |
| Form outcomes | `jq -c 'select(.event=="landing.form") \| [.outcome,.reason,.fields]' \| sort \| uniq -c` | `refused` > 30 per hour; `invalid` > 50% of posts over 6 hours |

## Waitlist admin

Platform admins are the emails in `PLATFORM_ADMINS` (Dokploy environment, comma-separated; redeploy to change). They invite and remove entries at `/admin/waitlist` in the PWA; `/admin/*` answers 404 to everyone else (`docs/design/auth.md#platform-admins-d234`). Invite links stay valid `WAITLIST_INVITE_TTL_DAYS` (default 7).

| Event | Query | Alert when (default) |
| --- | --- | --- |
| Admins configured | `jq 'select(.event=="admin.config") \| [.level,.count]'` | any `warn` (no admins in production); `count` differs from the previous start |
| Admin actions | `jq -c 'select(.event=="waitlist.admin") \| [.action,.outcome,.reason,.actorId]' \| sort \| uniq -c` | > 50 invites per admin per hour; > 20 removals per hour |
| Who read the list | `jq -c 'select(.event=="waitlist.admin_list") \| [.actorId,.status,.returned,.page]'` | volume baseline only |
| Refused admin requests | `jq -c 'select(.event=="admin.denied") \| [.reason,.actorId,.route]'` | ≥ 5 per actor per hour |
| Invite mail | `jq 'select(.event=="waitlist.mail" and .template=="invite" and .outcome=="failed")'` | any failure (resend from the Invited tab) |

**Actions by one admin** (rows outlive the prune and hold no email):

```sql
SELECT action, entry_id, created_at FROM waitlist_events
WHERE actor_id = (SELECT id FROM users WHERE email = lower('admin@example.test'))
ORDER BY created_at DESC LIMIT 100;
```

The history of one entry is the `waitlist_events` query in § Waitlist.

## Registration gate

`REGISTRATION_MODE` (default `waitlist`) closes sign-up: unknown addresses asking for a sign-in link are put on the waitlist instead (`docs/design/auth.md#registration-gate-d222d224-d241`). Set `REGISTRATION_MODE=open` in the Dokploy environment and redeploy to open it; any other value stops the API from starting.

| Event | Query | Alert when (default) |
| --- | --- | --- |
| Mode in effect | `jq 'select(.event=="registration.mode") \| [.level,.mode]'` | any `warn` (production running `open`) |
| Sign-in requests | `jq -c 'select(.event=="auth.magic_link") \| [.outcome,.reason]' \| sort \| uniq -c` | `refused` > 30 per hour; `waitlisted` share > 3× its 7-day average |
| Callbacks | `jq -c 'select(.event=="auth.callback") \| [.outcome,.reason]' \| sort \| uniq -c` | `failed` > 25% over 1 hour with ≥ 20 callbacks; `closed` > 10 per day |
| Registrations | `jq -c 'select(.event=="users.register") \| [.outcome,.via]' \| sort \| uniq -c` | any `created` with `via` `open_sign_in` while production runs `waitlist` (must be impossible) |

How users came in (rows from before the gate show `NULL`):

```sql
SELECT registered_via, count(*) FROM users GROUP BY 1;
```

## Landing analytics

Self-hosted [Umami](https://umami.is) (v3, PostgreSQL only, pinned in `docker-compose.yml`) counts landing-page visitors (D231–D233, ADR-062). The browser loads `/stats/script.js` and posts to `/stats/api/send` on the app origin; Caddy proxies only those two paths to `ANALYTICS_UPSTREAM`, by default the container of the Umami that several projects share (`services-umami-4viuzs-umami-1:3000`, its own Dokploy project, reached over `dokploy-network`; D341). That project owns Umami's image, database, secrets and dashboard hostname; this Compose only points at it. If the shared container is renamed, change the default in `docker-compose.yml`. Nothing carries the tag unless `ANALYTICS_SITE_ID` is set. Then the landing page, public pages and share previews carry it, and the SPA loads it for signed-in members; every payload is reduced to route patterns, screen names, the member id and four content events (033, ADR-066).

Setup (once):

1. Deploy with `ANALYTICS_SITE_ID` still empty (the API logs `analytics.config` `disabled`).
2. In the shared Umami's dashboard, add a website for the public host (e.g. `gobbit.niranhome.win`).
3. Set `ANALYTICS_SITE_ID` to the website's id in Dokploy and redeploy. `/welcome`, `/p/…`, `/s/…` and the app now send views (`analytics.config` lists `surfaces`); sign-in, error pages, the sitemap and robots never do.
4. In your own browsers run `localStorage.setItem('umami.disabled', '1')` on the app origin so you are not counted (smoke tests do the same).

Conversion for a period (D233): an Umami funnel `/` or `/welcome` → `/welcome/joined`. Umami undercounts (blockers, visitors and members who declined); the record of sign-ups is `waitlist_summary`, and the record of landing views is `landing.render` (D243):

| Check | Query | Alert when (default) |
| --- | --- | --- |
| Tag on/off | `jq -c 'select(.event=="analytics.config") \| [.outcome,.host]'` | `disabled` in production after rollout |
| Record of views | `jq -c 'select(.event=="landing.render" and .state=="default" and .via!="app")' \| wc -l` (per day) | — |
| Umami vs record | Umami's daily visitors for the website vs the count above | renders > 0 and Umami 0 for 24 hours while `enabled`; Umami < 20% of renders over 7 days |
| Collect endpoint | Caddy access log for `/stats/api/send` | 5xx > 5% over 1 hour |
| Consent mode | `jq -c 'select(.event=="analytics.config") \| .consent'` | anything but `opt_in` while `enabled` |
| Consent changes | `jq -c 'select(.event=="analytics.consent" and .outcome=="changed") \| [.from,.value,.source]'` | more than 5 changes to `declined` in 24 hours |
| App vs record | Umami's `card-created` events vs `item_events` creations by members who allowed it (query below) | Umami < 50% of that count over 7 days |

Analytics consent (035, D265, D281, ADR-068) is opt-in: nothing is sent until someone allows it. Members answer in the app (prompt or Settings → Privacy; one value per account, every change is an `analytics_consent_events` row); visitors answer in the banner on API pages, and that choice stays in their browser. Read the declined count before the cross-check:

```sql
SELECT coalesce(analytics_consent::text, 'unanswered') AS choice, count(*) FROM users GROUP BY 1;
-- who changed what, when (latest first)
SELECT user_id, from_value, to_value, source, created_at FROM analytics_consent_events ORDER BY created_at DESC LIMIT 50;
-- card creations by members who allowed analytics (last 7 days), for the cross-check
SELECT count(*) FROM item_events e JOIN users u ON u.id = e.actor_user_id
WHERE e.kind = 'created' AND e.created_at > now() - interval '7 days'
  AND u.analytics_consent = 'allowed';
```

## Backups (Phase 0 step 7)

Nightly logical dump of the `gobbit` database to the S3-compatible store on the NAS, using the same Dokploy S3 destination the other services already back up to. The database lives on the shared Dokploy-managed Postgres (D67), so this uses Dokploy's built-in database backups.

1. In Dokploy, open the shared Postgres database service → **Backups** → add a schedule: database `gobbit`, destination = the NAS bucket, prefix `gobbit/`, daily at 03:00, keep 30. Every other database on that instance gets its own schedule with its own prefix, including `umami` (prefix `umami/`, weekly is enough: analytics only).
2. Run it once by hand and check the object appears on the NAS.
3. If the shared database moves to a cloud provider, use the provider's backups (or keep this schedule pointed at the new host) and update this section.

Card images live on Cloudinary and are not part of this backup.

### Restore (rehearse once, then quarterly)

Into a throwaway database on any machine with Docker:

```bash
# 1. fetch the latest dump from the NAS bucket (mc / aws s3 cp / the NAS UI)
# 2. start an empty pgvector Postgres
docker run -d --name gobbit-restore -e POSTGRES_USER=gobbit -e POSTGRES_PASSWORD=gobbit -e POSTGRES_DB=gobbit \
  -p 127.0.0.1:55432:5432 pgvector/pgvector:pg17
# 3a. plain SQL dump (.sql or .sql.gz)
gunzip -c <dump>.sql.gz | psql postgres://gobbit:gobbit@127.0.0.1:55432/gobbit
# 3b. custom-format dump (.dump)
pg_restore --no-owner -d postgres://gobbit:gobbit@127.0.0.1:55432/gobbit <dump>.dump
# 4. check: the latest migration and a row count
psql postgres://gobbit:gobbit@127.0.0.1:55432/gobbit -c "select status from health" -c "select count(*) from decks"
```

Demo for PLAN.md Phase 0 step 7: the restored database shows the health row (and, once there are any, the decks). Write the date and the time it took here:

- _not yet rehearsed_
