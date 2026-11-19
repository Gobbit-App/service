# Testing and test data

_Overview: [architecture.md](../architecture.md). Decisions: [adr.md](../adr.md)._

## Test Pyramid

### Unit tests

Location: `**/*.test.ts` (next to source)  
Environment: Node  
Test data: mocked/inline  
Examples:
- `@gobbit/shared/src/schemas/pagination.test.ts`: cursor encoding, Zod parse
- Service unit tests with mocked repos

### Integration tests

Location: `**/*.int.test.ts` (under `test/`)  
Environment: Node + Docker (Testcontainers PostgreSQL)  
Test data: built with `@gobbit/db/test` factories (`createSampleWorld()`)  
Examples:
- Repository tests (actual SQL via Drizzle)
- Service tests calling real repos
- API route tests via `setupApiTest()`

**Test isolation**: Each test file gets a fresh DB cloned from `template_pb`:
1. Global setup: creates template DB with all migrations
2. Per file: `withTestDb()` clones the template (fast), the file's tests run, the clone is dropped

### Search eval (`pnpm test:search`)

Location: `apps/api/test/*.search.test.ts` (vitest project `search`, excluded from `unit`)
Environment: Node + Docker (same template database as integration)
Test data: `searchCards` + `search-eval.json`, vectors from the committed `search-embeddings.json`
Gate: recall@5 ≥ 0.9 (see Search → Evaluation)

### E2E tests (self-contained, 046/047)

#### Choosing the tier: smoke vs full (constitution V, ADR-053)

Every feature and fix decides where its end-to-end coverage lives, records it in the plan ("E2E tier") and states it in the PR:

| Tier | Put it here when | Runs |
|------|------------------|------|
| `@smoke` (`e2e/tests/smoke/`) | It is on a critical journey (sign-in, reading a deck, creating or editing a card, photo upload, search, share/ingest submit, review publish), a regression would block core use, or it crosses a deployment boundary (proxy, CSP, env/secret, third-party call) | Every PR (planned, 010) and after every deploy; ≤ 5 min |
| `@full` (`e2e/tests/full/`) | Secondary paths, role variants, extra negatives and edge cases, async or costly third-party work, cross-browser and offline variants | Nightly (planned, 011); until then on demand: the `e2e:full` PR label runs `e2e-full.yml`, or `pnpm test:e2e tests/full` locally |
| none | Pure logic with no new UI or flow | Unit / integration tests only |

A bug that reached production gets its regression test at the tier and in the environment that would have caught it. Smoke tests are being rewritten as real-usage journeys (magic-link sign-in through the stack's mailbox, real `media/sign`, real worker; only third-party hosts faked): see [`specs/010-e2e-journeys`](../../specs/010-e2e-journeys/plan.md). The nightly full suite is outlined in [`specs/011-e2e-nightly`](../../specs/011-e2e-nightly/plan.md).

#### Current suite

Location: `e2e/tests/smoke/*.spec.ts` and `e2e/tests/full/*.spec.ts`
Environment: Playwright against a throwaway Compose stack the runner starts (047, [`specs/047-e2e-isolation`](../../specs/047-e2e-isolation/plan.md))
Tagging: every smoke test title includes `@smoke`

**Self-contained rule (047)**: e2e needs Docker with Compose ≥ 2.24 and nothing else. It reads no environment variable, uses no seed, no token and no standing account, and never touches a deployed instance. Every test signs in as its own fresh `<tag>-<id>@example.test` user through the real magic link, so tests share nothing and run in parallel. `e2e/lib/no-env.test.ts` scans `e2e/`, the workflows, the Compose files and the package scripts and fails on env access or on the retired variable names.

**Runner**: `pnpm test:e2e [--no-build] [--keep] [--clean] [-- <playwright args>]` (`e2e/run.ts`, contract in [`specs/047-e2e-isolation/contracts/runner.md`](../../specs/047-e2e-isolation/contracts/runner.md)).

- It starts a project `gobbit-e2e-<ts>-<rand>` from `infra/docker-compose.yml` + `docker-compose.local.yml` + `docker-compose.e2e.yml` on two free loopback ports, waits for `/api/health` (latest migration) and `/version.json`, runs Playwright, then removes the project and its volumes (also on Ctrl-C).
- `--no-build` reuses built images; `--keep` leaves the stack up for debugging (the next run reaps it after 2 hours); `--clean` removes every `gobbit-e2e-*` project and exits. Other arguments go to Playwright (`--grep @smoke`, `tests/full`, `--retries=1`).
- Exit codes: 0 passed, 1 tests failed, 2 prerequisite missing (Docker, Compose version), 3 stack did not start (logs in `e2e/.stack/stack.log`).
- Image builds get the real commit (`GIT_SHA`), recorded in the stack file; `health.spec` and `web.spec` assert `/health` and `/version.json` equal it.
- **Stack file**: `e2e/.stack/stack.json` (project, `webUrl`, `apiUrl`, `mailboxUrl`, `commit`, `startedAt`) is how specs find the stack (`e2e/lib/stack.ts`); it is deleted on teardown. Run Playwright by hand only against a stack kept with `--keep`.
- **Overlay** `infra/docker-compose.e2e.yml`: open registration, Mailpit as the SMTP mailbox, the real `umami` on the stack's Postgres with a dummy site id, dummy Cloudinary credentials (specs fake the Cloudinary hosts, signing with the same dummy secret), no AI, push or email-in keys, and no rate-limit overrides except the two per-IP sign-in limits. See [infra/README.md](../../infra/README.md).

**Fixtures** (`e2e/fixtures/identity.ts`):

- `user`: a fresh signed-in member; `api` is its cookie-session request context (writes carry the web origin, D32), `context` its browser context, `page()` a new page in it
- `newUser(tag, opts?)`: another fresh member; `{ consent: 'unanswered' }` keeps the first-visit analytics wall
- `member(deck, role)`: a fresh user invited to the deck (`POST /decks/{id}/invites`) and signed in
- `anon`: a request context with no credentials (401 checks)
- `smokeDeck`: a `smoke-<id>` deck owned by `user`, soft-deleted afterwards; `webDeck` adds a category and one card per type for the browser journeys
- Mailbox (`e2e/lib/mailbox.ts`): reads Mailpit over HTTP and returns the `/auth/callback?token=` link for an address. Default identities answer the analytics consent wall through the real `PUT /me/analytics-consent` (`declined`), and anonymous visitor contexts seed the consent in `localStorage`, so the wall never hides a journey

**Post-deploy probe**: `pnpm post-deploy-check <origin> --sha <commit> [--timeout-minutes N]` (`infra/post-deploy-check.ts`) replaces the authenticated smoke after a deploy. It sends GET requests only, with no identity and no environment: it polls until `/health` and `/version.json` report the commit, then checks the landing form and an anonymous refusal. `smoke.yml` runs it after each deploy.

**Search smoke (Phase 4)**: `search.spec.ts` checks three API cases: a phone number searched as digits without the dash, a query with no results, and the 400 for a blank `q`. `web.spec.ts` checks that a search from the header sheet opens `/search` with highlighted, tagged results, and checks the empty state.

**Browser smoke (D62)**: `web.spec.ts`, `share.spec.ts` and `lifecycle.spec.ts` (Phase 6: demo 2 archive → Undo → search miss → restore → search hit; delete with confirm, Undo and Undelete; unavailable deck/card links) run in Chromium with a Pixel 7 viewport against the stack's web origin, signed in as the test's own user. Each test seeds a smoke deck with one card per type and checks: the deck list, no horizontal overflow at 360 px, the calc result, category switching via the URL, favorites surviving a reload, and the private share preview.

## Seeding and test data (D49)

### Owner-only seed

`pnpm db:seed` (`packages/db/scripts/seed.ts` → `seed/run-seed.ts`) upserts exactly **one account and one user** — the owner — and nothing else. No decks, categories or cards are seeded; a fresh deployment starts empty.

- `SEED_OWNER_EMAIL` is required (the script exits non-zero without it); `SEED_OWNER_NAME` defaults to the email local part. Parsing lives in `seed/owner.ts` (`parseOwnerSeedEnv`).
- Ids are uuid v5 under `SEED_NAMESPACE` (`seedId('owner')` for the account, `seedId('owner/user')` for the user), so re-running upserts in place.
- Idempotent: `ON CONFLICT … DO UPDATE … WHERE … IS DISTINCT FROM`, so a second run with the same values leaves `updated_at` untouched; a changed name or email updates the row in place.
- Local development only: the script refuses `NODE_ENV=production` outright (Oct 1). A deployed instance is never seeded; the owner's first magic-link sign-in creates the user (D25).
- `SMOKE_SESSION_TOKEN` (D43, ≥32 chars) upserts one 365-day `bearer` session for the owner (`user_agent = 'smoke'`); re-running with a new token rotates it. It is for local `apps/api/api.http` use only; e2e does not read it (047). No other users are seeded.

### Test factories (`@gobbit/db/test`)

Integration tests build their own data; nothing depends on seeded rows.

- `factories.ts`: `createAccountUser`, `createDeck` (the trigger adds `general`), `defaultCategory`, `createCategory`, `createItem` (runs the card through `itemCreateSchema`, links categories, defaults to `general`), `addFavorite`. Ids come from `fixtureId(key)` — uuid v5 under a separate `FIXTURE_NAMESPACE`.
- `fixtures/sample-cards.ts`: the 25 Phase 1 cards (`SampleCard`: `ItemCreate` + category slugs + status/lang/favorite), and `SAMPLE_CATEGORIES`. Its unit test pins the shape the suites rely on: 23 published + 2 archived, 12 food (all published), 2 table, 1 calc, 1 favorite, he/el/en.
- `sample-world.ts`: `createSampleWorld(db)` reproduces the Phase 1 layout — owner (`owner@example.test`) with decks `personal` (empty), `family` (six categories + the 25 cards), `scratch` (empty), and a second user (`other@example.test`) with `other-personal`. `apps/api/test/helpers.ts#setupApiTest()` builds it once per suite and exposes it as `world`.

## Deviations

### 046 (profile e2e), resolved by 047

046 could not cover cross-member cases in e2e: it had one seeded member session, and sign-in needs an emailed link. Its workarounds were optional e2e-only variables for a standing invitee and two extra member tokens, a Cloudinary secret for the photo specs (cases skipped when unset), and a `PROFILE_UPDATE_RATE_PER_HOUR` override on the local stack. 047 removed all of them: per-test users and `member()` run the cross-member cases, the stack signs fake Cloudinary uploads with a checked-in dummy secret, and the override is gone. Still true: no route deletes a user, so the removed-creator placeholder (D429) is covered only at the integration tier (`profile.int.test.ts`), as is the personal deck's "no avatar" rule (with the web unit tests).

### 047 (e2e isolation)

Decisions the plan did not make:

- The overlay runs the real `umami` (from the local compose analytics profile) on the stack's Postgres (database `umami`, created by `infra/db-init-e2e/02-umami.sql`) with a dummy `ANALYTICS_SITE_ID`, so the landing tracker is real in smoke. It overrides the `db` volumes to mount the two init files individually (the local overlay mounts the whole `db-init` directory read-only).
- With a site id set, members see the consent wall on first visit; default identities answer it through the real `PUT /me/analytics-consent` (see Fixtures above).
- The runner passes the real commit (`GIT_SHA`, fallback `e2e`) to compose and both image builds.
- Overlay extras: `api` waits for a healthy Mailpit (pinned image, `readyz` healthcheck); `web` waits for a healthy umami.
- `member(deck, role)` invites through `POST /decks/{id}/invites`; the invite mail carries the same callback link. The profile spec's members are editors.
- Once every spec was converted, the token-based `e2e` job (`ci.yml`) and `full` job (`e2e-full.yml`) were removed and the new jobs took their names, so required-check names stay stable. The post-deploy probe takes `DEPLOY_SHA` (the no-env guard forbids the old name) and aborts each request after 10 s.
- `e2e/fixtures/api.ts` and `web.ts` were deleted rather than updated; `fixtures/cloudinary.ts` stays, env-free.
- Playwright keeps traces on failure (`retain-on-failure`).

Coverage changes and known issues:

- `smoke/share.spec.ts`: the stack has no AI key, so the real `POST /ingest` answers 503 "Ingestion is not configured" and the test asserts that. The "Sent" screen and "Your shares" link are no longer covered at smoke. Option: a dummy `OPENROUTER_API_KEY` in the overlay (the worker would then call out with a bad key; not done).
- Two smoke editor tests were removed because they stubbed Gobbit's own API, which smoke forbids: "image type unavailable without image storage" (to be re-added at the full tier with the cloud-name route stub) and "Fetch preview fills a link card" (covered by `link-preview.int.test.ts`).
- `full/profile.spec.ts`: the empty `test.fixme` for the removed-creator placeholder was dropped (the suite must have no skipped tests); the integration test covers it. Its Browse test opens with an explicit `i=` because the app omits `i` on the first card.
- Suspected product bugs, found and not fixed: (a) a second `page.goto` to the same deck in one browser context kept a stale persisted list (the refetch of `items?limit=20&category=…` was cancelled), so a card created between visits was missing; tests create cards before the first visit. (b) `smoke/lifecycle.spec.ts`: after Undo the list refetch did not include the undeleted card, flaky; the test polls `itemState` until published and reloads once. (c) The crop sheet ("Use photo") occasionally ignored the first click; `pickAndCrop` presses again while the button is visible, which hides a swallowed click, so treat recurrence as a signal.
- `smoke/editor.spec.ts` PDF test uses a fixed 600x650 viewport: the fake Cloudinary serves a 1x1 PNG per page and the viewer's 60 % IntersectionObserver made the page counter timing-dependent.
- `full/isolation.spec.ts` saves a profile 25 times per user (default limit 30 per hour); the 31st-save refusal is not exercised there.
- `full/analytics-consent.spec.ts` and the visitor/landing specs seed or answer consent rather than faking markup; the analytics tracker script itself is stubbed at the full tier only.
