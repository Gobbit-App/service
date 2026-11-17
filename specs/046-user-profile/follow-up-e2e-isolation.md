# Follow-up: make e2e isolated (own users, own data, disposable DB everywhere)

Handoff from the 046 (member profile) work, 2026-11-17, for a new session. Start it with
`/speckit-specify` using the **Goal** below, then the normal spec-kit flow (`/speckit-clarify` →
`/speckit-plan` → …). This is test infrastructure: its own E2E tier is "none", but it changes how the
smoke and full tiers run, so constitution V needs the decision below. Specs are public: keep personal
data and secrets out.

## Goal

Every e2e run starts from an empty database it created itself and throws it away afterwards, and every
test gets its own users and data, so a spec can never depend on, collide with or exhaust state left by
another spec. Multi-member journeys (invite, shared deck, two members' avatars) are written like any
other test, with no pre-provisioned tokens and no special environment.

## The premise, corrected (facts checked in the repo)

"E2E runs against a real database that is not disposable" is only partly true. The new session should
be clear about what already holds and what does not.

Already true:

- **CI is disposable.** Both e2e jobs (`ci.yml` job `e2e`, and `e2e-full.yml`) start a Compose project
  `gobbit-e2e` (`infra/docker-compose.yml` + `infra/docker-compose.local.yml`, which adds a `db` service
  on a named volume) on a fresh runner, seed it, run Playwright, and the runner is discarded. No shared
  or production database is involved.

Not true, and the real problems:

1. **One standing owner, shared by all tests.** The seed (`packages/db/seed/run-seed.ts`, rule D49)
   creates exactly one account and one user plus one bearer session (`SMOKE_SESSION_TOKEN`). Every spec,
   in parallel workers, acts as that user. Specs clean up their own decks (D50), but state on the user
   itself is shared and mutated: name, username, avatar, per-user rate-limit counters, favorites.
   Evidence from 046: the profile specs set the owner's names while the cover spec ran; `PATCH /me/profile`
   hit its per-user hourly limit (429) because one user saved its profile in dozens of tests; the override
   `PROFILE_UPDATE_RATE_PER_HOUR=1000` in `infra/docker-compose.local.yml` is a workaround for exactly this.
2. **No way to create a second member.** Sign-in needs an emailed magic link, self-invites are refused,
   and the seed makes one user. So multi-member specs are written with optional env tokens
   (`E2E_MEMBER_B_TOKEN`, `E2E_MEMBER_C_TOKEN`, `SMOKE_INVITEE_USERNAME`) that nothing provisions, and they
   **skip silently** (10 skipped in the last full run). A skipped test is not coverage.
3. **Local runs are not disposable.** `pnpm compose:up` keeps a persistent `pgdata` volume, and
   `pnpm test:e2e` points at whatever stack is running (`BASE_URL`), so local state accumulates.
4. **The same specs also run post-deploy against the real deployed instance** (docs/design/testing.md:
   "after every deploy", a bearer minted with `/auth/token-exchange` from a cookie session). That path
   necessarily uses a real database and must stay read-mostly and self-cleaning. This is why the suite was
   built around one standing user, and the change must not break it.

## Constraint: do not mock the database

Constitution V: smoke tests are real journeys, "nothing inside Gobbit faked; only third-party hosts may be
replaced, at the network edge" (D149, D151). Constitution III: invariants live in Postgres (CHECKs,
triggers such as the username hold, `pg_trgm`, `pgvector`). A mocked or in-memory database would skip
exactly what e2e exists to prove. So the answer to "mock or new DB" is **a new real DB per run** (already the
CI shape) plus isolation inside it. A mock would be a constitution amendment (versioned) and needs the
owner's decision first.

## Suggested direction (to confirm in `/speckit-clarify` and `/speckit-plan`)

Principle: per-test identities, created through the product the way a person would, on a stack that is
created for the run and destroyed after.

1. **Per-test users via real sign-in** (preferred; spec 010 already plans "magic-link sign-in through a
   test mailbox"). A fixture creates a fresh user per test (`user-<id>@example.test`): request a magic link,
   read it from a test mailbox, follow it (cookie session), optionally `POST /auth/token-exchange` for a
   bearer. The e2e stack needs `REGISTRATION_MODE=open` (the default `waitlist` sends unknown addresses to
   the waitlist), a mailer a test can read (the console mailer logs links; or `MemoryMailer` behind a
   test-only read route; or a Mailpit container in the compose overlay), and headroom on the sign-in rate
   limits (`magic-link:email` / `magic-link:ip`). Each test then has its own per-user rate-limit budget,
   which removes the need for the 1000/h override.
2. **Multi-member helpers on top:** a `member(role)` fixture is a fresh user invited to the test's deck with
   that role and signed in (invite by email, accept through the invite magic link). An owner and two
   members become three lines in a test. The three optional env vars and their skips go away.
3. **The seed stays minimal (D49)** for the standing owner that post-deploy smoke needs. PR and full runs stop
   depending on it beyond, at most, a first bootstrap.
4. **Disposable stack by default, locally too:** one command (for example `pnpm e2e:stack`) that brings up a
   uniquely named Compose project with its own volume, runs migrations, runs the suite, and always runs
   `down -v` (trap on failure). `pnpm test:e2e` against an already running stack stays for debugging. CI keeps
   the same shape with an explicit `down -v` step (`if: always()`), so it does not rely on runner disposal.
5. **Post-deploy smoke:** keep one standing user and the existing self-cleaning rules; mark which specs may run
   in that mode (a tag or project, for example `@deployed-safe`) and keep the cross-member journeys PR and
   nightly only. Never point per-test sign-up at production (it would create real users).
6. **Parallelism:** with per-test users, workers stop interfering; revisit `workers` / `fullyParallel`
   afterwards and drop `retries` crutches where the cause was shared state.

Alternative to evaluate, and probably reject: a test-only provisioning step that writes users and sessions
straight into the database from Playwright's global setup. It needs `DATABASE_URL`, duplicates session-token
hashing, bypasses sign-in, and cannot run post-deploy. Faster, but it fakes the front door that smoke exists
to cover.

## What the new session should do first

1. Read: `docs/design/testing.md` (E2E sections), `specs/010-e2e-journeys/{spec,plan,research}.md` (its
   real-journeys plan may already cover part of this: reconcile, do not duplicate), `specs/011-e2e-nightly/`,
   `e2e/playwright.config.ts`, `e2e/global-setup.ts`, `e2e/fixtures/{api,web,cloudinary}.ts`, `e2e/lib/env.ts`,
   `.github/workflows/{ci.yml,e2e-full.yml}`, `infra/docker-compose.local.yml`, `packages/db/seed/*`,
   `apps/api/src/mail/*`, `apps/api/src/routes/auth.ts` (`/auth/token-exchange`), constitution V and ADR-053.
2. Decide with the owner: per-test sign-in vs. a database-level helper; which mailbox; what runs post-deploy.
3. Specify, then plan with the traceability table as usual. The feature makes no decision about people, so
   Accountability is "None", with that reason.
4. Migrate in this order so `main` stays green: stack and teardown plus the mailbox first; then the `member()`
   fixture; then convert the 046 profile specs (the first consumers and the reason for this work); then the rest
   of `e2e/tests/full`; finally remove the `E2E_*` and `SMOKE_INVITEE_USERNAME` variables, the skips and the
   `PROFILE_UPDATE_RATE_PER_HOUR` override.

## Practical notes learned in 046

- **The push token in the authoring environment had no `workflow` scope**: edits to `.github/workflows/*` were
  rejected on push. Run the work where the token has it, or hand the workflow changes over as a snippet.
- **The PWA service worker bypasses `page.route`.** Specs that fake Cloudinary images need
  `test.use({ serviceWorkers: 'block' })` (see `cover.spec.ts` and the photo describe in `profile.spec.ts`);
  otherwise images start getting real 404s once the worker takes over.
- **`:focus-visible` follows the last input:** after a mouse click a script `focus()` does not match; press a
  key first when testing keyboard focus styles.
- **Lazy chunks race measurements:** the calc card grows by about 150 px when its lazy code loads; wait for its
  result before taking layout measurements (`cover.spec.ts`, "at 360px …").
- **The personal deck exists only after a real sign-in**, not for the seeded bearer session; per-test sign-in
  gets it for free (the "no avatar in a personal deck" e2e check is skipped today for that reason).
- **CI artifacts** (traces, `error-context.md`, screencast frames) are the fastest way to diagnose a failure:
  `gh run download <run> -R Gobbit-App/service -n e2e-full-report -D <dir>`; the trace's `*-trace.network`
  shows each request's status and whether the service worker made it.
- The full e2e run is triggered by the `e2e:full` label on a PR and re-runs on each push while it stays.
- Docker Hub pulls occasionally fail ("failed to copy … cloudfront"); rerun with `gh run rerun <id> --failed`.
- **No Docker or Postgres in the authoring sandbox:** integration and e2e tests could not be run locally during
  046, and CI was the only runner. Plan small, CI-verified steps.

## Open questions for the owner

- Is per-test real sign-in through a test mailbox acceptable for PR and full runs (spec 010 already proposed
  it)? If a faster path is wanted, which part of "nothing inside Gobbit faked" may be relaxed, and is that an
  amendment?
- Which specs, if any, must run against the deployed instance after each deploy, and may they create throwaway
  users there?
- Mailbox: reuse the console or memory mailer with a test-only read route, or add a Mailpit container to the
  compose overlay?
