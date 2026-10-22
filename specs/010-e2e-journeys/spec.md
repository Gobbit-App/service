# Feature Specification: Smoke tests as real-usage journeys

**Feature Branch**: `010-e2e-journeys`

**Created**: 2026-10-21

**Status**: Draft

**Input**: User description: "Turn the smoke tests into full flows of real usage with Playwright, and decide for every new feature or fix whether its e2e coverage belongs in smoke or in a nightly full suite."

Roadmap: cross-cutting test infrastructure (no phase demo). Sibling: [`011-e2e-nightly`](../011-e2e-nightly/spec.md) (the nightly full suite that builds on this feature). Constitution principle V (amended to v1.1.0 with this spec) defines the tiers.

## Why

Today's `@smoke` suite checks features one by one with shortcuts that real members never take:

- **No real sign-in**: the browser gets the seeded session token as a cookie. Magic-link email → callback → session is never exercised in a browser.
- **Faked boundaries inside the product**: the image card test fakes the API's own `POST /media/sign` as well as Cloudinary. A production outage, where every photo upload failed, passed smoke green.
- **No worker**: review tests start from proposals created through the API. Nothing drives share → ingest job → extraction → proposal → publish.
- **Only after deploy**: smoke runs only after `main` is deployed. Nothing runs Playwright before merge, and there is no Compose stack in CI.
- **One persona**: every test is the owner. Reader and editor journeys were skipped for that reason (`docs/architecture.md`, 007 deviations).

## User Scenarios & Testing *(mandatory)*

The "users" of this feature are the people who change Gobbit: a contributor opening a PR, and the maintainer deploying `main`.

### User Story 1 - Smoke gates every PR (Priority: P1)

A contributor opens a PR. CI starts the whole stack from the PR's code with Docker Compose (Postgres, API, worker, web) and runs the `@smoke` journeys against it. A failing journey blocks the merge, and the report shows the trace, screenshots and the API and worker logs.

**Why this priority**: Bugs that cross the web → API → worker → DB boundary are caught today only after they reach production, if at all.

**Independent Test**: Open a PR that breaks the editor's Save button. The `e2e` job fails with a trace of the card journey and the PR cannot merge.

**Acceptance Scenarios**:

1. **Given** a PR that changes code, **When** CI runs, **Then** an `e2e` job starts the Compose stack built from the PR and runs every `@smoke` journey in under 5 minutes of test time.
2. **Given** a failing journey, **When** the job ends, **Then** the Playwright report (trace, video, screenshots) and the JSON logs of `api` and `worker` are uploaded as artifacts.
3. **Given** a docs-only PR, **When** CI runs, **Then** the `e2e` job is skipped like the other jobs.

---

### User Story 2 - Journeys use the product as a member does (Priority: P1)

Each smoke test is a journey: a member's real task from start to finish through the UI, crossing every internal boundary for real. Only third-party services outside Gobbit (Cloudinary's upload host, LLM providers, the mail provider) are replaced, at the network edge, and only on the PR stack.

**Why this priority**: This is the point of the feature. A journey would have caught the upload outage: on the PR stack the real `media/sign` signature would be posted, and after deploy the real upload would fail.

**Independent Test**: Break the signing parameters in `media/sign-upload.ts`. The photo journey fails on the PR stack because the fake upload host checks the signature.

**Acceptance Scenarios**:

1. **Given** the PR stack, **When** the sign-in journey runs, **Then** it requests a magic link in the browser, reads the email from a test mailbox, opens the link and lands on `/d/me` with a real cookie session.
2. **Given** the PR stack, **When** the photo journey runs, **Then** the browser uses the API's real signature and the fake upload host checks it the way Cloudinary does: a wrong signature gets Cloudinary's 401 shape.
3. **Given** the PR stack, **When** the share journey pastes text, **Then** the real worker picks up the ingest job, a deterministic fake LLM returns the extraction, and the proposal appears in the review pill for the owner to publish.
4. **Given** any journey, **When** it needs data, **Then** it creates it through the UI or the public API (never SQL) inside its own `smoke-<id>` deck, and deletes it afterwards.

---

### User Story 3 - Post-deploy smoke checks the real integrations (Priority: P1)

After `main` deploys, the same journeys run against the deployed instance. Here nothing is faked: real Cloudinary upload, real LLM extraction and real mail sending (accepted by Resend). The only exception is sign-in: the deployed mailbox can't be read, so it uses the smoke session cookie.

**Why this priority**: Wrong secrets, CSP, proxy routes and third-party limits fail only in the deployed stack.

**Independent Test**: Deploy with a wrong `CLOUDINARY_URL` secret. Post-deploy smoke fails in the photo journey with "Photo uploads are misconfigured on the server".

**Acceptance Scenarios**:

1. **Given** a deployed commit, **When** smoke runs, **Then** every `@smoke` journey runs, except those tagged `@mailbox` (they need a readable inbox), with real third parties.
2. **Given** the photo journey on the deployed instance, **When** it finishes, **Then** the uploaded test photo is deleted from Cloudinary (teardown by the deck's folder prefix).
3. **Given** smoke fails after deploy, **When** the maintainer opens the run, **Then** the report names the failing journey and step.

---

### User Story 4 - More than one persona (Priority: P2)

Journeys can act as an invited editor or reader, not only as the owner. On the PR stack, the owner invites a fresh `e2e-<run>-<role>@example.test` address and the invitee accepts through the emailed link.

**Why this priority**: Role rules (`authorize()` + `can()`) are central, but today the browser sees them only as the owner.

**Independent Test**: The invite journey makes an editor who can add a card but sees no **Members** management.

**Acceptance Scenarios**:

1. **Given** the PR stack, **When** the owner invites an editor, **Then** the invitee signs in from the invite email in a second browser context and can add a card to the deck.
2. **Given** the editor's context, **When** they open deck settings, **Then** member management is not offered.

---

### User Story 5 - Every change picks its e2e tier (Priority: P2)

Every spec plan and every PR states whether its UI or flow change is covered in `@smoke`, in the nightly `@full` suite, or by no e2e at all, with a reason. A bug that escaped gets its regression test in the tier that would have caught it.

**Why this priority**: Without a rule, smoke either grows until it is slow, or misses critical paths.

**Independent Test**: The PR template and the plan and tasks templates ask for the tier. A plan without it fails the Constitution Check (principle V).

**Acceptance Scenarios**:

1. **Given** a new spec, **When** `/speckit-plan` runs, **Then** the plan's Technical Context has an "E2E tier" line and the tasks use `[e2e:smoke]` or `[e2e:full]`.
2. **Given** a PR, **When** it is opened, **Then** the template asks for the tier and its reason.

### Edge Cases

- **Magic-link rate limit**: 5 per email per hour. Journeys use a fresh address per test run (`e2e-<run>-…@example.test`), never the owner's.
- **Worker timing**: steps that wait for the worker poll through the UI (`expect.poll` / auto-retrying assertions, at most 30 s on the PR stack). They never use fixed sleeps.
- **Parallel runs**: every journey owns its deck and its addresses, so `fullyParallel` is safe.
- **No AI key on the deployed instance**: the share journey checks `/config` and skips with a reason when ingestion is off (the constitution keeps AI optional).
- **Deployed teardown fails**: a Cloudinary cleanup failure is reported as a warning annotation and does not fail the journey. Phase 7's orphan sweep is the backstop.
- **Third-party outage after deploy**: a failure caused by Cloudinary or the LLM provider shows the provider's status and message in the report (JSON logs plus the upload-failure report), so it is not mistaken for a regression.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The `@smoke` suite MUST consist of journeys (see the catalogue in [plan.md](./plan.md)), plus a thin `api-smoke` contract set (health/version, OpenAPI, 401s).
- **FR-002**: CI MUST run `@smoke` on every non-docs PR against a Compose stack built from the PR.
- **FR-003**: On the PR stack, sign-in MUST go through the real magic-link flow, using a test mailbox the tests can read.
- **FR-004**: On the PR stack, only third-party hosts MAY be replaced: Cloudinary upload and delivery, LLM providers and mail. The API, worker, web and database MUST be the real ones.
- **FR-005**: The fake Cloudinary upload host MUST verify the API's signature with the configured test secret and answer with Cloudinary's error shape.
- **FR-006**: Post-deploy smoke MUST run the same journeys with real third parties, skipping only `@mailbox` journeys, and MUST clean up anything it uploaded.
- **FR-007**: Journeys MUST create and delete their own data through the UI or the public API (D50 stays).
- **FR-008**: Test-only server behaviour (the SMTP mailer pointed at a mailbox, the LLM base URL override) MUST be impossible to enable when `NODE_ENV=production`, except sending real mail via SMTP.
- **FR-009**: The e2e tier rule (constitution V, ADR-053) MUST appear in the plan template, the tasks template, the PR template, `CLAUDE.md`, `docs/architecture.md` and `README.md`.
- **FR-010**: The smoke suite MUST finish in at most 5 minutes of test time on CI, and MUST NOT contain fixed sleeps.

### Key Entities

- **Journey**: a named member task (catalogue ID `S1`…). It has steps, a persona, the environments it runs in, and its fakes.
- **Environment**: `pr` (Compose plus fakes and mailbox), `deployed` (real everything, cookie sign-in) or `nightly` (Compose plus real providers, see 011).
- **Persona**: owner (seeded), or an invited editor or reader (per run, PR stack only).

## Success Criteria *(mandatory)*

- **SC-001**: Each of these regressions fails at least one smoke journey before merge:
  - breaking `media/sign` parameters;
  - breaking the magic-link callback;
  - breaking the ingest worker;
  - breaking the editor's Save.
- **SC-002**: A deploy with a wrong `CLOUDINARY_URL` fails post-deploy smoke.
- **SC-003**: The `e2e` PR job takes at most 12 minutes end to end (Compose build included) and at most 5 minutes of test time.
- **SC-004**: No more than 2 % of smoke runs on unchanged code are flaky (failed, then passed on retry), measured over the first 30 days.
- **SC-005**: Every spec merged after this feature records an e2e tier in its plan.

## Assumptions

- GitHub-hosted runners can build both images and run Compose within the time budget, using the layer cache.
- A Cloudinary test cloud is not needed for the PR stack (the fake verifies signatures). The deployed instance's own account is used after deploy, with cleanup.
- The deployed instance keeps its AI key. Without one, the share journey skips with a reason.
- The deployed sign-in exception, a cookie from `SMOKE_SESSION_TOKEN`, stays until a readable deployed inbox is worth its cost (see research D150).
