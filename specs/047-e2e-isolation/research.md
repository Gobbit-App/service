# Research: Self-contained e2e

Decisions D430–D442 (046 ends at D429). Facts were read from the repo on 2026-11-18, not from memory.

## D430: A runner owns the stack, not Playwright's `webServer`

**Decision**: `pnpm test:e2e` runs `e2e/run.ts`. It reaps stale stacks, starts the stack, waits for health, writes the stack file (D432), spawns `playwright test` with the arguments the user passed, and removes the stack in a `finally` and on `SIGINT`/`SIGTERM`.

**Rationale**:
- The API's public URL (`API_URL`, magic links, the CSRF origin check, D32) must contain the final port, so the ports have to be chosen before Compose starts. `webServer` needs its `url` at config time and the config is re-evaluated in every worker.
- Teardown must be ours to guarantee on failure and interruption (FR-001); a `try/finally` in the process that started the stack is the simplest guarantee.
- The runner is plain Node with no dependency, unit-testable (argv building, free ports, reaper), and the same command runs locally and in CI.

**Alternatives rejected**:
- **Playwright `webServer`**: fixed URL at config time, so two runs on one machine collide (FR-003); teardown depends on Playwright's own signal handling.
- **`globalSetup` returning a teardown**: cannot hand dynamic addresses to the config (config loads before it runs), and a killed Playwright leaves the stack.
- **A shell script**: not testable, and `pnpm` scripts differ across platforms.

## D431: Naming, ports, overlay, teardown, reaper

**Decision**:
- Project name `gobbit-e2e-<epoch base36>-<4 random chars>`; its own volume and network by Compose's project scoping.
- Layered files: `docker-compose.yml` + `docker-compose.local.yml` + new `docker-compose.e2e.yml`. The e2e overlay uses `!reset` to drop the fixed host ports of `db` and `api`, sets web's host port and Mailpit's from the generated env file, and sets `REGISTRATION_MODE=open`, `MAIL_PROVIDER=smtp`, `SMTP_URL=smtp://mailpit:1025`, raised per-IP sign-in limits (D435), `COOKIE_SECURE=false`, `API_URL`/`APP_URL` from the chosen web port, and no worker/Umami extras.
- The runner picks two free loopback ports by binding port 0 and closing, writes them and the other constants to `e2e/.stack/compose.env`, and passes `--env-file`. A bind error on `up` retries once with new ports.
- `docker compose ... up -d --build --wait --wait-timeout 300`, then a health wait on `/api/health` (migration equals the latest journal tag) and `/version.json` through the web port, folded in from today's `global-setup.ts`.
- Teardown: `down -v --remove-orphans`. Reaper at start: `docker compose ls --all --format json`, project names starting `gobbit-e2e-` whose embedded timestamp is older than 2 hours are removed. `--clean` removes every `gobbit-e2e-*` project.
- The external `dokploy-network` that the base file attaches to `web` is overridden in the e2e overlay (`networks: !override [default]`), so no shared network is created or needed.

**Rationale**: nothing outside the project is touched (FR-002), concurrent runs have distinct names, ports and volumes (FR-003), and a hard kill is cleaned by the next run without ever removing a live concurrent stack.

**Alternatives rejected**:
- **Random host ports via `docker compose port`**: the URL must be known before the API starts.
- **A single standing name `gobbit-e2e`**: today's CI shape; two local runs collide and a leftover blocks the next.
- **Removing every `gobbit-e2e-*` project at start**: would kill a concurrent run.

## D432: The stack file is how Playwright learns the addresses

**Decision**: The runner writes `e2e/.stack/stack.json` (gitignored; shape in `contracts/stack-file.md`). `e2e/lib/stack.ts` is the only module that reads it, synchronously, and Playwright's config, fixtures and specs import addresses from it. The file is the runner's hand-over; the shell is not involved.

**Rationale**: hard requirement 1 allows values "from the harness that started it". A file is read the same in the main process and every worker, with no process-level state. The runner deletes it at teardown.

**Alternatives rejected**:
- **Environment variables set by the runner**: forbidden by requirement 1 in spirit and in the repo-scan guard.
- **Playwright `globalSetup` returning values**: not visible to the config's `baseURL` or to workers except through env.
- **Fixed ports in checked-in config**: collides (D431).

## D433: Test mailbox is Mailpit through a new SMTP mailer

**Decision**: Add `MAIL_PROVIDER=smtp` with `SMTP_URL` (required with it) and an `SmtpMailer` built on `nodemailer`, selected in `createMailer`. The e2e overlay adds a pinned `axllent/mailpit` service; `e2e/lib/mailbox.ts` reads it over its REST API (`/api/v1/search?query=to:<address>`), waits for the message, and extracts the first link to the API's `/auth/callback`.

**Rationale**:
- Both the API and the worker build their mailer from the same env, so invites, sign-in links and reminder mail all land in one inbox that tests read through a real third-party-shaped boundary (only the mail host is replaced).
- It reconciles 010, which chose the same design (D150) but never built it; this plan builds it.
- SMTP is a normal production transport (self-hosters can use it), not a test hook.
- Checked in the repo: no SMTP client is installed (`rtk grep` finds only `resend` and `console` mailers), so `nodemailer` is the justified new dependency (constitution VII, IX). A hand-written SMTP client was considered and rejected (TLS, auth and edge cases).

**Alternatives rejected**:
- **Test-only read route over `MemoryMailer`**: a route in the product that returns sign-in links, even behind a flag; the worker's mail is invisible to it (010 rejected it for the first reason).
- **Parsing `docker compose logs`**: the console mailer logs JSON lines mixed with other traffic; couples tests to the Docker CLI.
- **Reading mail through Resend inbound**: needs a real domain and mixes with ingestion.

## D434: Open registration, unique addresses, one known admin address

**Decision**: The stack sets `REGISTRATION_MODE=open`, so a first sign-in registers the user and creates the personal deck (D222–D224, `open_sign_in`). Each user's address is `<tag>-<8 random chars>@example.test` (`example.test` is reserved; mail never leaves Mailpit). Each address is used once, so the per-email magic-link limit (5 an hour) is never reached. The stack also sets `PLATFORM_ADMINS` to one checked-in address (`ADMIN_EMAIL` in `stack-config.ts`, written by the runner into the generated env file); `waitlist-admin.spec.ts` signs that address in through the same real flow, and every other test uses an ordinary address.

**Rationale**: no seed is needed and the real front door is exercised. Checked in the two specs that depend on the registration mode: `registration-gate.spec.ts` asserts the uniform "Check your inbox" answer and static error pages, which are identical in open and waitlist mode; `waitlist-admin.spec.ts` needs a platform admin and waitlist rows, which the landing form creates in either mode.

**Accepted loss**: the e2e case "an unknown address lands on the waitlist instead of registering" cannot run on an open stack. The rule stays covered by `users.service`/`auth.service` unit and integration tests; the plan does not add a second stack for it.

**Alternatives rejected**:
- **A second API container in `waitlist` mode**: doubles moving parts for one case.
- **`waitlist` mode with users created through waitlist invites**: needs an admin first, which needs a user; the circle can only be broken with a seed.

## D435: Per-IP sign-in limits are env-tunable, raised only in the e2e overlay

**Decision**: Rename `RATE_MAGIC_LINK_PER_IP` / `RATE_CALLBACK_PER_IP` in `@gobbit/shared/limits` to `*_DEFAULT` and read `MAGIC_LINK_PER_IP_PER_HOUR` / `CALLBACK_PER_IP_PER_HOUR` in `env.ts` (same pattern as the profile limits). The e2e overlay sets both to 100000. Per-email and per-user limits keep their defaults; the `PROFILE_UPDATE_RATE_PER_HOUR: 1000` override in `docker-compose.local.yml` is deleted.

**Rationale**: every test comes from one address, so a per-IP budget of 20 an hour can never hold a suite that signs in hundreds of users. That is a property of a one-address environment, not of the product. Constitution VIII already wants limits env-tunable. Per-user limits stay at production values: with a user per test, no test can exhaust another's.

**Alternatives rejected**:
- **A distinct client IP per test** through a forwarded header: Caddy overwrites it for untrusted callers by default, and the API port is not exposed; it would need proxy configuration in the overlay that production never has.
- **Disabling the limiter in e2e**: would hide limit regressions; tests that exercise a limit (`profile` 429 cases) still run against the real value.

**Spec note**: FR-012 is tightened to say this (see spec).

## D436: The dummy Cloudinary secret is one checked-in constant

**Decision**: `e2e/lib/stack-config.ts` exports `CLOUDINARY_DUMMY = { cloudName, apiKey, apiSecret }`. The runner writes `CLOUDINARY_URL=cloudinary://<key>:<secret>@<cloud>` into the generated `compose.env`; `fixtures/cloudinary.ts` imports `apiSecret` from the same module to sign fake upload answers (012). No variable exists on either side for the tests to read.

**Rationale**: a YAML overlay cannot import TypeScript, so the runner (TypeScript) is the single place that turns the constant into stack configuration. The value is labelled dummy; specs are public.

**Alternatives rejected**: a literal in both the overlay and the fixtures (drifts); an environment variable (forbidden).

## D437: Identity fixtures

**Decision**: `fixtures/identity.ts` exports:
- `signUp(request, mailbox, tag)`: `POST /auth/magic-link` with an `Origin` of the web origin, wait for the mail, `GET` the link with redirects followed on an `APIRequestContext` so its cookie jar holds `gobbit_session` (the cookie session the browser also uses). Returns `{ api, email, user, storageState }`, where `user` comes from `GET /me`.
- `user` fixture: one fresh signed-in user per test; `api` is that user's cookie-authenticated request context; `context` opens browser contexts with the same `storageState`.
- `member(deck, role)`: a fresh user (own context) that the owner invites by email through `POST /decks/{id}/members`, who then opens the invite mail's link and lands in the deck with that role. Returns the same shape.
- `anon`, `smokeDeck` (a shared deck owned by `user`), `webDeck` (filled with one card per type) keep their names and shapes, so a spec converts by changing its import. Deck cleanup after the test is dropped except where a spec asserts deletion.

**Rationale**: reuses the real endpoints and mail; a test never sees a token. Writes with a cookie pass the CSRF check because requests carry the API's own origin (D32); if that proves awkward the fallback is `POST /auth/token-exchange` made inside the fixture, a bearer minted in the test, not stored.

**Alternatives rejected**: signing in through the UI for every user (slow, and only `sign-in.spec.ts` needs the UI path); a database helper that creates sessions (the handoff's rejected option).

## D438: Post-deploy is a no-identity probe

**Decision** (owner, clarification 2026-11-18): `infra/post-deploy-check.ts`, run as `pnpm post-deploy-check <url> --sha <sha> [--timeout-minutes 10]`, polls `<url>/api/health` and `<url>/version.json` until both report the commit (today's wait), then checks the landing page (`/welcome` returns 200 HTML with the sign-up form), that `GET <url>/api/decks` and `GET <url>/api/me` return 401 with `application/problem+json`, and that `/` redirects or serves the app shell. It prints one line per check and exits 1 naming the first failure. `smoke.yml` calls it with `vars.API_BASE_URL`-derived origin and `github.sha`; the secret and the other variables are removed.

**Rationale**: no identity, no data, one address argument; real journeys are proven on the disposable stack before the image is pushed (`image` needs `e2e`).

**Alternatives rejected**: an authenticated post-deploy smoke (excluded by requirement 2); no check (loses the "right commit is live" gate that `smoke.yml` gives today).

## D439: Retries, workers, reporter

**Decision**: The config holds constants: `retries: 0`, `timeout: 15000`, reporters `list` + `html`, `workers` left to Playwright's default. The workflows pass `--retries=1` on the CLI where they want it (the old behaviour for CI). No `CI` read.

**Rationale**: requirement 1; flags are part of the command, not the environment. After conversion, shared-state flakiness should be gone, so retries can be dropped (SC-005 measures it).

## D440: Transitional config and migration order

**Decision**: Add `playwright.isolated.config.ts` whose `testMatch` is a list file `e2e/converted.txt`-free constant (`CONVERTED` array in the config) and a new CI job `e2e-isolated` that runs `pnpm test:e2e`. The old config's `testIgnore` excludes the same list. Each conversion PR moves specs into the list. The final PR deletes the old config, `lib/env.ts`, `global-setup.ts`, the list and renames the isolated config to `playwright.config.ts`.

**Rationale**: both worlds run on `main` until the last PR; no PR leaves a spec unrun.

**Alternatives rejected**: a single big-bang PR (cannot be verified without Docker locally and is too large to review); a feature flag in fixtures (reintroduces an environment switch, 010 D152).

## D441: The seed stays for local development

**Decision**: `packages/db/seed` keeps creating the owner and the optional smoke session for local `api.http` use (D43, D49). No e2e code, workflow or compose file for e2e calls it. The seed docs say "local development only".

**Rationale**: removing a developer tool is out of scope; the requirement is about e2e.

## D442: Constitution V amendment (version 1.6.0, MINOR)

**Decision**: In principle V, replace "every PR and after every deploy" for smoke with "every PR", replace the "each e2e test creates and deletes its own `smoke-<id>` deck" line with: "E2E is self-contained: a run starts its own stack with an empty database and removes it; nothing under `e2e/` reads the environment or uses a stored credential; every test creates its own users through the real sign-in and invite flows. After a deploy, a no-identity probe checks health, the deployed commit and anonymous behaviour." Add ADR-081 and one row in `docs/architecture.md`.

**Rationale**: the rule outlives the feature and every plan gates on V; the handoff asked for a decision, and the plan proceeds on the assumption the owner agrees (listed under "Settle before starting").

**Alternatives rejected**: leaving V unchanged (the post-deploy and `smoke-<id>` lines would contradict the new practice).
