# Security Policy

## Reporting a vulnerability

Please **do not** report security issues through public GitHub issues, discussions or pull requests.

Use GitHub's private vulnerability reporting instead: **Security → Report a vulnerability** on this repository.

Include as much of the following as you can:

- Affected component (API route, migration, Docker image, workflow) and version/commit
- Steps to reproduce or a proof of concept
- Impact — what an attacker could read, change or break

You should get an acknowledgement within 7 days. Fixes are released as soon as practical and credited in the release notes unless you prefer otherwise.

## Supported versions

Only the latest commit on `main` receives security fixes while the project is pre-1.0.

## Scope notes

- Authentication is passwordless (magic links + server-side sessions, see `docs/architecture.md`). Deployments must use `COOKIE_SECURE=true`, a real mailer (`MAIL_PROVIDER=resend`), and set `CLIENT_IP_HEADER` only to a header the proxy controls. `SMOKE_SESSION_TOKEN` is an owner credential: keep it secret (≥ 32 random characters) and rotate it by re-running the seed.
- The default database credentials in `.env.example` and `infra/docker-compose.local.yml` are for local development only. The deployed `DATABASE_URL` uses a dedicated role that owns only the `gobbit` database on the shared instance. Keep that instance off the internet (LAN or private network), or require `sslmode=verify-full` when it isn't.
