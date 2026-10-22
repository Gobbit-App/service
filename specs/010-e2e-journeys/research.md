# Research: Smoke tests as real-usage journeys

Decisions D148–D155 for [plan.md](./plan.md). The tier decisions (D148, D149, D155) are durable and become ADR-053 in `docs/architecture.md`.

## D148: Two tiers, chosen by tag

**Decision**: Playwright tests carry exactly one tier tag:
- `@smoke`: critical journeys. Runs on every PR (Compose) and after every deploy. Budget ≤ 5 min of test time.
- `@full`: everything else that needs a browser or a running stack. Runs nightly ([011](../011-e2e-nightly/plan.md)). Budget ≤ 30 min.

`@quarantine` excludes a test from both gates (D155). Folders mirror the tags (`tests/smoke/`, `tests/full/`) so that reviewers see the tier in the diff.

**Rationale**: A single suite either grows until nobody waits for it, or stays small and leaves secondary paths untested. Tags let one config, one set of fixtures and one report serve both tiers.

**Alternatives rejected**:
- **One suite on every PR**: too slow once roles, card types and channels multiply.
- **Separate repos or configs per tier**: duplicates the fixtures.
- **Smoke only after deploy (today)**: catches regressions after members do.

## D149: Smoke tests are journeys

**Decision**: A smoke test follows one member task from start to finish through the UI (catalogue S1–S8). It crosses web → API → worker → DB for real, and asserts what the member would see. Field-level and rule-level checks belong in unit and int tests, or in `@full`.

**Rationale**: Today's feature checks passed while every production upload failed. They had stubbed the API's own sign endpoint to isolate the editor. A journey cannot stub inside Gobbit, by definition.

**Alternatives rejected**:
- Keeping feature checks and adding a few journeys on top: smoke time grows, and the shortcuts stay.

## D150: Test mailbox through SMTP and Mailpit

**Decision**: Add `MAIL_PROVIDER=smtp` with `SMTP_URL` (nodemailer). The PR stack points it at Mailpit, and `e2e/lib/mailpit.ts` reads the latest message for an address through Mailpit's REST API. After deploy, sign-in keeps the `SMOKE_SESSION_TOKEN` cookie, and `@mailbox` journeys are skipped.

**Rationale**:
- Real magic-link and invite flows need a readable inbox.
- Mailpit is a single, widely used container with a stable API.
- SMTP is a production-grade transport (self-hosters can use it too), so it isn't a test hook in the product.
- nodemailer is the standard Node SMTP library.

**Alternatives rejected**:
- **Parsing `docker compose logs` for the console mailer's output**: brittle, and the logs are now JSON lines with other traffic.
- **A test-only `/test/mailbox` API endpoint**: a dangerous route to leave in the product, even behind a flag.
- **Reading deployed mail through Resend inbound (email-in)**: possible later, but it needs a dedicated domain route, and it mixes smoke traffic into the ingestion webhook.

## D151: Fakes at the network edge only

**Decision**:
- **Cloudinary**: the browser's calls to `api.cloudinary.com` and `res.cloudinary.com` are rerouted by Playwright to the `fakes` container. The fake upload endpoint recomputes the SHA-1 signature from the posted parameters and the test secret, and answers like Cloudinary: `{ public_id }`, or 401 `{ error: { message: "Invalid Signature …" } }`. A test can ask it to refuse an upload (for example `X-Fake-Refuse: resolution`).
- **LLM**: `OPENROUTER_BASE_URL` becomes an env var (default unchanged). The env schema refuses it when `NODE_ENV=production`. The fake implements `/v1/chat/completions` with a fixed, schema-valid extraction derived from the input, and `/v1/embeddings` with hashed bag-of-words vectors, so related text lands near each other in the semantic arm.

**Rationale**: The API, worker and web run unmodified, so failures inside Gobbit are real failures. Verifying signatures in the fake would have caught the class of bug that reached production.

**Alternatives rejected**:
- **Real Cloudinary and LLM on every PR**: secrets in PR jobs (fork PRs can't have them), cost, and third-party flakiness.
- **Selecting the in-process fakes (`fake-extractor.ts`) by env**: skips the HTTP client and its error handling, so it's less real.

## D152: One journey source, three environments

**Decision**: `E2E_ENV` (`pr` | `deployed` | `nightly`) selects fixture behaviour:
- `signIn`: magic link, or the cookie.
- `persona`: invites, or skip.
- `photoHost`: fake route, or real with cleanup.

Tests never branch on the environment themselves. They use `test.skip(!env.mailbox, …)` only through the `@mailbox` tag helper.

**Rationale**: A journey is written once, and post-deploy smoke stays the same journeys as PR smoke.

## D153: The PR stack in CI

**Decision**: A new `e2e` job in `ci.yml`, gated by the existing `changes` filter. It:
1. Builds both images with the Buildx GHA cache.
2. Runs `docker compose -f infra/docker-compose.yml -f infra/docker-compose.local.yml -f infra/docker-compose.e2e.yml up -d --wait`.
3. Seeds the owner and smoke session.
4. Runs `playwright test --grep @smoke --grep-invert @quarantine` with `E2E_ENV=pr`.
5. Always uploads the Playwright report and `docker compose logs api worker` (JSON lines, filterable with `jq`).

The job becomes a required check.

**Rationale**: It reuses the Compose files people already run locally (`pnpm compose:up`). The third overlay holds only the e2e additions.

## D154: Cleaning up real uploads after deploy

**Decision**: On `deployed`, the photo fixture's teardown deletes everything under `gobbit/items/<smokeDeckId>/` through the Cloudinary Admin API. It uses `E2E_CLOUDINARY_URL`, a repository secret used only by `smoke.yml`, which runs on `main` only. A failed cleanup becomes a warning annotation. Phase 7's orphan sweep (the `assets` table) replaces this teardown.

**Rationale**: Real uploads are the only way to prove that the deployed credentials, CSP and Cloudinary account limits work.

**Risk accepted**: the production Cloudinary credentials are stored as a CI secret. They are already in Dokploy. The workflow never runs for fork PRs.

## D155: Flake policy and waiting

**Decision**:
- **Retries**: 1 on CI, 0 locally.
- **Quarantine**: a test that is flaky twice in seven days is fixed, or tagged `@quarantine` with a linked issue, within a week. Quarantined tests still run nightly in a non-gating project, so their history stays visible.
- **No fixed sleeps**: no `page.waitForTimeout`, enforced with `eslint-plugin-playwright`.
- **Worker waits**: through auto-retrying assertions or `expect.poll`, at most 30 s.

**Rationale**: A gate that flakes gets ignored. The policy keeps smoke trustworthy without deleting coverage.
