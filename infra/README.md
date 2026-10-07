# infra

| File | Used by | What it is |
| --- | --- | --- |
| `docker-compose.yml` | Dokploy (deployed) | `db` (pgvector/pg17) + `api` (GHCR image), no host ports, production defaults, Traefik labels, `dokploy-network` |
| `docker-compose.local.yml` | `pnpm compose:{up,down}` | Builds the API from source, publishes ports on `127.0.0.1`, plain-HTTP defaults |
| `db-init/` | `db` first start | Creates the `vector` and `pg_trgm` extensions |

## Deployed layout

```
phone ─HTTPS─▶ Cloudflare ─tunnel─▶ cloudflared (Dokploy compose service)
                                         │  dokploy-network
                                         ▼
                                      Traefik ── Host(gobbit.niranhome.win) && PathPrefix(/api), strip /api ──▶ api:3000
                                                                                                                │ default network
                                                                                                                ▼
                                                                                                             db:5432
```

Dokploy environment for this Compose project: `POSTGRES_PASSWORD`, `API_URL=https://gobbit.niranhome.win/api`, `CORS_ORIGINS=https://gobbit.niranhome.win`, `CLIENT_IP_HEADER=cf-connecting-ip`, `MAIL_PROVIDER=resend`, `RESEND_API_KEY`, `MAIL_FROM=Gobbit <hello@gobbit.niranhome.win>`; optionally `API_IMAGE_TAG` (default `latest`), `PUBLIC_HOST`, `TRAEFIK_ENTRYPOINT`. `COOKIE_SECURE` defaults to `true` and must stay that way.

## Backups (Phase 0 step 7)

Nightly logical dump of the `pb` database to the S3-compatible store on the NAS, using the same Dokploy S3 destination the other services already back up to.

1. In Dokploy, open this Compose project → **Backups** → add a schedule for the `db` service: type Postgres, database `pb`, user `pb`, password = `POSTGRES_PASSWORD`, destination = the NAS bucket, prefix `gobbit/`, daily at 03:00, keep 30.
2. Run it once by hand and check the object appears on the NAS.
3. If this Dokploy version only offers backups for Dokploy-managed databases (not services inside a Compose project), use **Volume Backups** on `pgdata` instead, or add a `pg_dump` sidecar that writes to the same bucket — and update this section.

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
