# Handoff: make e2e self-contained (own stack, own users, no environment, no tokens)

Written 2026-11-17, at the end of the 046 (member profile) work, for a new session. **Do after the 046
branch is merged to `main`**: rebase this branch on `main` first, because it converts the 046 profile specs.
Start with `/speckit-specify` using the **Goal** below, then the normal spec-kit flow (`/speckit-clarify` →
`/speckit-plan` → …). This is test infrastructure: its own E2E tier is "none", but it changes how the smoke
and full tiers run, so constitution V needs the decision below. Specs are public: keep personal data and
secrets out.

## Goal

An e2e run brings up its own stack with an empty database, runs, and throws everything away. Each test
gets its own users and data, created through the product, so a spec can never depend on, collide with or
exhaust state left by another spec. Multi-member journeys (invite, shared deck, two members' avatars) are
written like any other test.

## Hard requirements (from the owner, 2026-11-17)

1. **E2E never relies on an environment variable.** Nothing in `e2e/` (specs, fixtures, config, global setup)
   reads `process.env`: not a base URL, not `CI`, not a secret, not a feature switch. Configuration lives in
   checked-in code (one `e2e/` config module), and values the test needs about the stack come from the harness
   that started it (for example Playwright's `webServer` / a returned base URL), not from the shell.
2. **E2E never uses a pre-made user token or any stored credential.** No `SMOKE_SESSION_TOKEN`,
   `E2E_MEMBER_B_TOKEN`, `E2E_MEMBER_C_TOKEN`, `SMOKE_INVITEE_USERNAME`, no seeded session, no bearer minted
   outside the test. Every identity a test uses is created inside that test by signing up and signing in
   (magic link through a test mailbox) or inviting another fresh user.
3. The stack the tests talk to is created for the run and destroyed after it, locally and in CI, with no
   manual step and no reliance on what is already running.

Consequences to design for, not around:

- The fake Cloudinary signs upload answers with the API's `CLOUDINARY_API_SECRET`, today passed to both the
  stack and the tests through the environment. The stack and the fixtures must share that dummy secret as a
  constant in checked-in code (the stack overlay and `e2e/` import the same value), never as a variable.
- `retries`, workers and reporter currently depend on `process.env.CI`; replace with explicit config or CLI flags
  set by the stack runner.
- `EXPECTED_SHA` / `BASE_URL` in `global-setup.ts` exist for the deployed instance (see the next section).

## The premise, corrected (facts checked in the repo)

"E2E runs against a real database that is not disposable" is only partly true.

Already true:

- **CI is disposable.** Both e2e jobs (`ci.yml` job `e2e`, and `e2e-full.yml`) start a Compose project
  `gobbit-e2e` (`infra/docker-compose.yml` + `infra/docker-compose.local.yml`, which adds a `db` service on a
  named volume) on a fresh runner, seed it, run Playwright, and the runner is discarded.

Not true, and the real problems:

1. **One standing owner, shared by all tests.** The seed (`packages/db/seed/run-seed.ts`, rule D49) creates
   exactly one account and one user plus one bearer session (`SMOKE_SESSION_TOKEN`). Every spec, in parallel
   workers, acts as that user. Specs clean up their own decks (D50), but state on the user itself is shared and
   mutated: name, username, avatar, per-user rate-limit counters, favorites. Evidence from 046: profile specs
   changed the owner's names while the cover spec ran; `PATCH /me/profile` hit its per-user hourly limit (429)
   because one user saved its profile in dozens of tests; the override `PROFILE_UPDATE_RATE_PER_HOUR=1000` in
   `infra/docker-compose.local.yml` is a workaround for exactly this.
2. **No way to create a second member.** Sign-in needs an emailed magic link, self-invites are refused, and the
   seed makes one user. So multi-member specs were written with optional env tokens
   (`E2E_MEMBER_B_TOKEN`, `E2E_MEMBER_C_TOKEN`, `SMOKE_INVITEE_USERNAME`) that nothing provisions, and they
   **skip silently** (10 skipped in the last full run). A skipped test is not coverage.
3. **Local runs are not disposable.** `pnpm compose:up` keeps a persistent `pgdata` volume, and `pnpm test:e2e`
   points at whatever stack is running (`BASE_URL`), so local state accumulates.
4. **The same specs also run post-deploy against the real deployed instance**
   (docs/design/testing.md: "after every deploy", with a bearer minted by `/auth/token-exchange` from a cookie
   session). That needs a target URL and an identity, which the hard requirements above forbid for e2e. See
   "Post-deploy checks" below: it has to become something else.

## Constraint: do not mock the database

Constitution V: smoke tests are real journeys, "nothing inside Gobbit faked; only third-party hosts may be
replaced, at the network edge" (D149, D151). Constitution III: invariants live in Postgres (CHECKs, triggers
such as the username hold, `pg_trgm`, `pgvector`). A mocked or in-memory database would skip exactly what e2e
exists to prove. So the answer to "mock or new DB" is **a new real DB per run** (already the CI shape) plus
isolation inside it. A mock would be a constitution amendment (versioned) and needs the owner's decision first.

## Suggested direction (to confirm in `/speckit-clarify` and `/speckit-plan`)

1. **The stack belongs to the run.** Playwright's `webServer` (or a `globalSetup` that returns teardown) starts a
   uniquely named Compose project with its own volume and network, waits for `/health`, and always runs
   `down -v` afterwards (also on failure and on Ctrl-C). `pnpm test:e2e` is then one command that needs Docker and
   nothing else. CI calls the same command; no workflow step seeds, exports a token or sets an e2e variable, which
   also removes the need for workflow-file edits for future e2e work.
2. **Per-test users via real sign-in** (spec 010 already plans "magic-link sign-in through a test mailbox"). A
   fixture creates a fresh user per test (`user-<id>@example.test`): request a magic link, read it from a test
   mailbox, follow it. The stack overlay (checked in, so not an e2e variable) sets `REGISTRATION_MODE=open` (the
   default `waitlist` sends unknown addresses to the waitlist), uses a mailer the tests can read (the console
   mailer logs links; or `MemoryMailer` behind a test-only route; or a Mailpit container), and gives sign-in
   rate limits headroom. Each test then has its own per-user rate-limit budget, which removes the need for the
   1000/h override.
3. **Multi-member helpers on top:** `member(role)` = a fresh user invited to the test's deck with that role and
   signed in (invite by email, accept through the invite magic link). An owner and two members become three lines
   in a test. The skips and the three env variables disappear.
4. **No seed for e2e.** The seed stays minimal for local development (D49); the e2e stack does not run it, since
   every test creates its own owner. (The first sign-in creates the user and the personal deck, which the seeded
   bearer session never had.)
5. **Parallelism:** with per-test users, workers stop interfering; revisit `workers` / `fullyParallel` afterwards
   and drop `retries` crutches where the cause was shared state.

### Post-deploy checks (needs an owner decision)

The current smoke suite doubles as a post-deploy check against the deployed instance. That use needs a URL and
an identity, so it cannot be "e2e that never reads the environment and never uses a token". Options to put to
the owner:

- **A separate, tiny post-deploy probe, not Playwright e2e:** a script that checks `/health`, `/version.json`
  (the deployed commit), the landing page and anonymous 401/redirect behaviour, taking its single URL as a command
  line argument. No identity, no data written. Real journeys are proven on the disposable stack before deploy.
- Keep a minimal authenticated post-deploy smoke, accepted as an explicit exception to requirement 2 (and
  amend the requirement), if the owner wants signed-in checks after deploy.

Never point per-test sign-up at production: it would create real users.

### Alternative to evaluate, and probably reject

A test-only provisioning step that writes users and sessions straight into the database from Playwright's global
setup. It needs `DATABASE_URL`, duplicates session-token hashing, bypasses sign-in and so fakes the front door
that smoke exists to cover, and it still smuggles configuration in through the environment.

## What the new session should do first

1. Read: `docs/design/testing.md` (E2E sections), `specs/010-e2e-journeys/{spec,plan,research}.md` (its
   real-journeys plan may already cover part of this: reconcile, do not duplicate), `specs/011-e2e-nightly/`,
   `e2e/playwright.config.ts`, `e2e/global-setup.ts`, `e2e/fixtures/{api,web,cloudinary}.ts`, `e2e/lib/env.ts`,
   `.github/workflows/{ci.yml,e2e-full.yml}`, `infra/docker-compose.local.yml`, `packages/db/seed/*`,
   `apps/api/src/mail/*`, `apps/api/src/routes/auth.ts` (`/auth/token-exchange`), constitution V and ADR-053.
   Then `grep -rn "process.env" e2e/` to list every variable the suite reads today: that is the migration
   checklist for requirement 1.
2. Decide with the owner: the mailbox, the post-deploy question above, and whether the requirements need a
   constitution V amendment (a new principle line: "e2e is self-contained: no environment, no tokens").
3. Specify, then plan with the traceability table as usual. The feature makes no decision about people, so the
   Accountability table is "None", with that reason.
4. Migrate in this order so `main` stays green: the stack runner and teardown plus the mailbox first; then the
   `member()` fixture; then convert the 046 profile specs (the first consumers and the reason for this work);
   then the rest of `e2e/tests/full` and `e2e/tests/smoke`; finally delete `e2e/lib/env.ts`, the `E2E_*` /
   `SMOKE_*` / `CLOUDINARY_API_SECRET` / `BASE_URL` / `EXPECTED_SHA` reads, the skips, the seeded smoke session in
   the workflows, and the `PROFILE_UPDATE_RATE_PER_HOUR` override in `infra/docker-compose.local.yml`.

## Practical notes learned in 046

- **The push token in the authoring environment had no `workflow` scope**: edits to `.github/workflows/*` were
  rejected on push. Run the work where the token has it, or hand the workflow changes over as a snippet.
- **The PWA service worker bypasses `page.route`.** Specs that fake Cloudinary images need
  `test.use({ serviceWorkers: 'block' })` (see `cover.spec.ts` and the photo describe in `profile.spec.ts`);
  otherwise images start getting real 404s once the worker takes over.
- **`:focus-visible` follows the last input:** after a mouse click a script `focus()` does not match; press a key
  first when testing keyboard focus styles.
- **Lazy chunks race measurements:** the calc card grows by about 150 px when its lazy code loads; wait for its
  result before taking layout measurements (`cover.spec.ts`, "at 360px …").
- **CI artifacts** (traces, `error-context.md`, screencast frames) are the fastest way to diagnose a failure:
  `gh run download <run> -R Gobbit-App/service -n e2e-full-report -D <dir>`; the trace's `*-trace.network` shows
  each request's status and whether the service worker made it.
- The full e2e run is triggered by the `e2e:full` PR label and re-runs on each push while it stays.
- Docker Hub pulls occasionally fail ("failed to copy … cloudfront"); rerun with `gh run rerun <id> --failed`.
- **No Docker or Postgres in the authoring sandbox:** integration and e2e tests could not be run locally during
  046, and CI was the only runner. Plan small, CI-verified steps.

## Open questions for the owner

- Post-deploy: replace the authenticated smoke with a no-identity probe (recommended), or keep one authenticated
  exception?
- Mailbox: reuse the console or memory mailer with a test-only read route, or add a Mailpit container to the
  compose overlay?
- Should "e2e is self-contained (no environment, no tokens)" become a line in constitution V?
