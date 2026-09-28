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

- `DEV_API_TOKEN` / `X-Dev-User` authentication is a **development-only** mechanism (see `docs/architecture.md`). Deployments exposed to the internet must set `DEV_AUTH_ENABLED=false` or use a strong random token (≥ 32 characters).
- The default database credentials in `.env.example` and `infra/docker-compose.yml` are for local development only.
