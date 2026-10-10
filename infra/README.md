# infra

| File | Used by | What it is |
| --- | --- | --- |
| `docker-compose.yml` | Dokploy (deployed) | `api` + `web` (GHCR images), no database (the API uses the shared Postgres, D67), no host ports, all non-secret deployed values as defaults; only `web` has Traefik labels and joins `dokploy-network` |
| `docker-compose.local.yml` | `pnpm compose:{up,down}` | Adds the local `db` (pgvector/pg17), builds both images from source, publishes ports on `127.0.0.1` (web on 8080), plain-HTTP defaults, API in `development` mode |
| `db-init/` | local `db` first start | Creates the `vector` and `pg_trgm` extensions |

## Deployed layout

```
phone ─HTTPS─▶ Cloudflare ─tunnel─▶ cloudflared (Dokploy compose service)
                                         │  dokploy-network
                                         ▼
                                      Traefik ── Host(gobbit.niranhome.win) ──▶ web:80 (Caddy, apps/web/Caddyfile)
                                                                                  │ default network
                                                     /api/* (strip) and /s/* ─────┤──▶ api:3000 ──▶ shared Postgres (DATABASE_URL)
                                                     everything else ─────────────┘    static files, SPA fallback
```

Dokploy environment for this Compose project — secrets only (D52): `DATABASE_URL`, `RESEND_API_KEY`, `CLOUDINARY_URL`. Setting up the shared database (role, database, extensions, external port, TLS) is in the root `README.md` → *Shared database*. Everything else (`API_URL`, `APP_URL`, `MAIL_PROVIDER`, `MAIL_FROM`, `CLIENT_IP_HEADER`, …) is a default in `docker-compose.yml`. Optional overrides: `API_IMAGE_TAG` / `WEB_IMAGE_TAG` (default `latest`), `PUBLIC_HOST`, `TRAEFIK_ENTRYPOINT`. There is no Dokploy "Domains" entry; the router comes from the `web` labels. `COOKIE_SECURE` defaults to `true` and must stay that way.

## Backups (Phase 0 step 7)

Nightly logical dump of the `gobbit` database to the S3-compatible store on the NAS, using the same Dokploy S3 destination the other services already back up to. The database lives on the shared Dokploy-managed Postgres (D67), so this uses Dokploy's built-in database backups.

1. In Dokploy, open the shared Postgres database service → **Backups** → add a schedule: database `gobbit`, destination = the NAS bucket, prefix `gobbit/`, daily at 03:00, keep 30. Every other database on that instance gets its own schedule with its own prefix.
2. Run it once by hand and check the object appears on the NAS.
3. If the shared database moves to a cloud provider, use the provider's backups (or keep this schedule pointed at the new host) and update this section.

Card images live on Cloudinary and are not part of this backup.

### Restore (rehearse once, then quarterly)

Into a throwaway database on any machine with Docker:

```bash
# 1. fetch the latest dump from the NAS bucket (mc / aws s3 cp / the NAS UI)
# 2. start an empty pgvector Postgres
docker run -d --name pb-restore -e POSTGRES_USER=pb -e POSTGRES_PASSWORD=pb -e POSTGRES_DB=pb \
  -p 127.0.0.1:55432:5432 pgvector/pgvector:pg17
# 3a. plain SQL dump (.sql or .sql.gz)
gunzip -c <dump>.sql.gz | psql postgres://pb:pb@127.0.0.1:55432/pb
# 3b. custom-format dump (.dump)
pg_restore --no-owner -d postgres://pb:pb@127.0.0.1:55432/pb <dump>.dump
# 4. check: the latest migration and a row count
psql postgres://pb:pb@127.0.0.1:55432/pb -c "select status from health" -c "select count(*) from decks"
```

Demo for PLAN.md Phase 0 step 7: the restored database shows the health row (and, once there are any, the decks). Write the date and the time it took here:

- _not yet rehearsed_
