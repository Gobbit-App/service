# Implementation Plan: Self-contained e2e (own stack, own users, no environment, no tokens)

**Branch**: `047-e2e-isolation` | **Date**: 2026-11-18 | **Spec**: [spec.md](./spec.md) | **Roadmap**: `PLAN.md` (test infrastructure; no phase)

**Input**: Feature specification from `/specs/047-e2e-isolation/spec.md`

## Summary

One command, `pnpm test:e2e`, runs a **runner** that starts a uniquely named Compose project (empty
Postgres, API, worker, web, and a Mailpit inbox), writes the stack's addresses to a generated file, runs
Playwright against it, and always removes the project and its volume. Every test creates its own users
through the real magic-link sign-in (`REGISTRATION_MODE=open`, mail read from Mailpit through a new
`MAIL_PROVIDER=smtp`), and extra members through the real invite flow. Nothing under `e2e/` reads the
environment or uses a stored credential. The authenticated post-deploy smoke is replaced by a no-identity
probe script. Existing specs convert in batches behind a transitional second Playwright config, so `main`
stays green; the old environment module, seeded smoke session and e2e-only variables are deleted last.

Two product-side changes are needed, both small: an SMTP mailer (the stack's mailbox) and env-tunable
per-IP sign-in limits (every test comes from one address). Everything else is test infrastructure.

## Starting point

`main` @ `7625408` (046 profile merged; this branch rebased on it). No migrations in this feature (latest
stays whatever `packages/db/migrations/meta/_journal.json` ends with). Builds on
[`010-e2e-journeys`](../010-e2e-journeys/plan.md) (Draft: its Mailpit mailbox, D150, was never built; this
plan builds it and supersedes its `E2E_ENV` switch, D152, and its deployed-cookie smoke) and
[`011-e2e-nightly`](../011-e2e-nightly/plan.md). Facts checked in the repo:

- `e2e/lib/env.ts` is the only reader of `BASE_URL`, `WEB_BASE_URL`, `SMOKE_SESSION_TOKEN`, `EXPECTED_SHA`,
  `CLOUDINARY_API_SECRET`; `playwright.config.ts` also reads `CI`. `tests/` read the profile/member
  variables (`E2E_MEMBER_B_TOKEN`, `E2E_MEMBER_C_TOKEN`, `SMOKE_INVITEE_USERNAME`) in 11 specs that skip
  without them.
- Both e2e jobs (`ci.yml` `e2e`, `e2e-full.yml`) start Compose project `gobbit-e2e`, seed one owner and
  export a bearer; `smoke.yml` runs `@smoke` against the deployed site with a stored bearer.
- Sign-in per-IP limits are constants in `@gobbit/shared` (`RATE_MAGIC_LINK_PER_IP = 20`,
  `RATE_CALLBACK_PER_IP = 30`, per hour); per-email is 5 an hour. Cookie-session writes need an `Origin`
  equal to `API_URL`'s origin (`middleware/csrf.ts`, D32).
- Mailers: `resend` and `console` only; the worker builds its own mailer from the same env.
- The authoring sandbox has no Docker: the stack can only be verified in CI, so work lands in small steps.

## Technical Context

**Language/Version**: TypeScript (strict, ESM, no build step) on Node ≥ 22

**Primary Dependencies**: Playwright (existing), Docker Compose ≥ 2.24 (for `!reset`/`!override`), Mailpit image (new, test only), `nodemailer` (new, API, for the SMTP mailer; justified in research D433)

**Storage**: PostgreSQL 17 + pgvector, one disposable instance per run; no schema change

**Testing**: Vitest unit tests for the runner pieces, the probe, the SMTP mailer, the new env limits and two repo-scanning guards; Playwright specs prove the fixtures

**E2E tier**: none — this is test infrastructure with no new product UI or flow. It changes how both tiers run: `@smoke` keeps its ≤ 5 min budget and "nothing inside Gobbit faked" (the mailbox is the third-party mail host replaced at the edge); `@full` is unchanged in scope. Two new specs prove the fixtures (`smoke/sign-in.spec.ts`, `full/isolation.spec.ts`); every converted spec keeps its tier.

**UI reference**: none — no UI

**Target Platform**: Docker Compose locally and on GitHub runners; deployed host unchanged (Dokploy)

**Project Type**: pnpm monorepo — API + worker, PWA, shared packages, `e2e/`, `infra/`

**Performance Goals**: smoke tier ≤ 5 min including per-test sign-in (target: ≤ 1 s per user); stack up (cached images) ≤ 90 s; post-deploy probe ≤ 30 s

**Constraints**: nothing in `e2e/` reads `process.env`; no stored credential; no mocked database; third-party hosts replaced only at the network edge; specs are public, no secrets (addresses on `example.test`, dummy Cloudinary secret is a labelled constant)

**Scale/Scope**: ~60 spec files (~6.7k lines) to convert; one run creates hundreds of users

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | How this plan complies (or "N/A") |
|-----------|-----------------------------------|
| I. Layered API | The only API changes are a mailer (`mail/`) and two env values read where the limits are used; routes, services and repositories keep their roles. |
| II. One source of truth for contracts | No DTO or route change. The new limits keep their defaults in `@gobbit/shared/limits`. `pnpm api:openapi` not needed. |
| III. Invariants live in the database | Unchanged, and the point of D430: e2e keeps a real Postgres so CHECKs, triggers (username hold) and extensions are exercised. No mock. |
| IV. Private by default | No visibility change. `MAIL_PROVIDER=smtp` and the raised per-IP limits exist only in the e2e overlay; production defaults unchanged. The probe is anonymous and writes nothing. |
| V. Tests at the right tier | Tier "none" with reason; amends V (D442, constitution 1.6.0): e2e is self-contained, post-deploy is the probe, tests create their own users. Traceability below. |
| VI. Lean, offline-first web | N/A: no web change. |
| VII. Simple, optional, deployable | One new API dependency (`nodemailer`) justified in D433; SMTP is optional and off unless `MAIL_PROVIDER=smtp`; deploy unchanged; Mailpit exists only in the e2e overlay. |
| VIII. Accountable by default | No new decision about a person or content: "None" below. Raised limits remain env-tunable, defaults unchanged. |
| IX. Reuse before writing | Checked: existing `ConsoleMailer`/`MemoryMailer` (cannot reach the worker's mail or a browser-readable inbox), Playwright `webServer` (cannot pick ports or tear down reliably, D430), `signInEmail`/`inviteEmail` templates, `members` invite flow, `docker-compose.local.yml` (layered, not copied), `scripts/` CLI parsing in `apps/api/scripts/lib`. New code is the runner, fixtures, SMTP mailer and probe. |
| X. One UI system | N/A: no UI. |

Re-check after Phase 1: unchanged. One tension is recorded, not a violation: per-IP limits are raised in the
e2e overlay because every test shares one address; this is stack configuration, not product behaviour (D435).

## Decisions this plan pins down

Full reasoning in [research.md](./research.md). D417–D429 belong to 046; this feature reserves D430–D442.

| ID | Decision | ADR? |
|----|----------|------|
| D430 | A runner script (`pnpm test:e2e`) owns the stack lifecycle; Playwright's `webServer` is not used | yes → ADR-081 |
| D431 | Project `gobbit-e2e-<id>`, ports picked by the runner, e2e overlay layered on base + local, `down -v` in `finally` and on signals, age-based reaper for stale projects | yes → ADR-081 |
| D432 | Stack addresses reach Playwright through a runner-generated, gitignored `e2e/.stack/stack.json` read by one module; no environment | yes → ADR-081 |
| D433 | Test mailbox: Mailpit plus `MAIL_PROVIDER=smtp` (`SMTP_URL`, nodemailer); reconciles 010 D150, which was never built | yes → ADR-081 |
| D434 | Stack runs `REGISTRATION_MODE=open`; each test registers `<tag>-<id>@example.test` by real sign-in | no |
| D435 | Per-IP sign-in limits become env-tunable (defaults unchanged); only the e2e overlay raises them; per-user limits keep defaults and the profile override is deleted | yes → ADR-081 |
| D436 | The dummy Cloudinary credential is one constant in `e2e/lib/stack-config.ts`, written by the runner into a generated Compose env file; fixtures import the same constant | no |
| D437 | Fixtures: `user` (fresh, signed in by magic link, cookie session) and `member(deck, role)` (invited, accepted, own browser context); `api`, `anon`, `smokeDeck`, `webDeck` keep their names so specs convert by changing the import | no |
| D438 | Post-deploy: `pnpm post-deploy-check <url> --sha <sha>` (no identity, no writes) replaces the authenticated smoke; `smoke.yml` calls it | yes → ADR-081 |
| D439 | Retries, workers and reporter are constants in the config or CLI flags passed by the workflow; none from `CI` | no |
| D440 | Migration runs through a transitional second config (`playwright.isolated.config.ts`) that matches converted specs only; the old config ignores them; final step deletes the old config and `lib/env.ts` | no |
| D441 | The seed keeps the owner and its optional smoke session for local API exploration (`api.http`); e2e never runs it or reads it | no |
| D442 | Constitution V amended to 1.6.0 (MINOR): e2e is self-contained, post-deploy is a probe, tests build their own users | yes → ADR-081 |

## Project Structure

### Documentation (this feature)

```text
specs/047-e2e-isolation/
├── spec.md              # /speckit-specify (+ /speckit-clarify)
├── handoff.md           # Owner brief this feature started from
├── plan.md              # This file
├── research.md          # Phase 0: D430–D442 with alternatives
├── data-model.md        # Phase 1: the test-side entities (stack, user, member, mailbox message)
├── quickstart.md        # Phase 1: how to run and verify
├── contracts/           # Phase 1: runner, stack file, fixtures, overlay, probe
├── checklists/requirements.md
├── tasks.md             # /speckit-tasks
└── implementation-notes.md  # during /speckit-implement
```

### Source Code (repository root)

```text
e2e/
├── run.ts                          # NEW runner: reap, up, wait, write stack.json, playwright, down
├── lib/
│   ├── stack.ts                    # NEW reads .stack/stack.json (the only place addresses come from)
│   ├── stack-config.ts             # NEW checked-in constants: dummy Cloudinary credential, admin address, timeouts, project prefix
│   ├── compose.ts                  # NEW compose argv/free ports/health wait/reaper (unit-tested)
│   ├── mailbox.ts                  # NEW Mailpit REST client (latest message for an address, link extraction)
│   └── env.ts, env.test.ts         # DELETED in the last step
├── fixtures/
│   ├── identity.ts                 # NEW user/member fixtures (real sign-in and invite)
│   ├── api.ts, web.ts, cloudinary.ts   # CHANGED: bearer/env removed, same exported names
├── playwright.config.ts            # CHANGED last: isolated config becomes the config
├── playwright.isolated.config.ts   # NEW transitional, deleted when the migration ends
├── global-setup.ts                 # DELETED (health wait moves into the runner)
├── tests/smoke/sign-in.spec.ts     # NEW real magic-link journey (010 S1)
├── tests/full/isolation.spec.ts    # NEW parallel users never see each other
├── tests/**                        # CONVERTED in batches; skips for provisioning removed
└── .stack/                         # generated, gitignored
infra/
├── docker-compose.e2e.yml          # NEW overlay: open registration, smtp, Mailpit, no fixed host ports
├── docker-compose.local.yml        # CHANGED: PROFILE_UPDATE_RATE_PER_HOUR override removed
└── post-deploy-check.ts            # NEW probe (CLI args only), with a unit test next to it
apps/api/src/
├── mail/smtp-mailer.ts (+ test)    # NEW; create-mailer.ts, env.ts: MAIL_PROVIDER=smtp, SMTP_URL
├── env.ts, services/auth.service.ts# CHANGED: per-IP sign-in limits from env
packages/shared/src/limits.ts       # CHANGED: constants renamed *_DEFAULT where they become env-tunable
.github/workflows/{ci,e2e-full,smoke}.yml   # CHANGED (needs a token with `workflow` scope)
docs/design/testing.md, docs/adr.md (ADR-081), docs/architecture.md (one row), README.md,
infra/README.md, CLAUDE.md, .specify/memory/constitution.md (1.6.0), specs/README.md (D430–D442), CHANGELOG.md
```

**Structure Decision**: all test machinery stays in `e2e/`; the one piece that must also work without
Playwright (the probe) lives in `infra/` next to the deploy docs. Product code changes are limited to the
mailer and two env-tunable limits.

## Invariant → test traceability

| Invariant / rule (spec FR or D-number) | Enforced in | Test (file, tier) |
|----------------------------------------|-------------|-------------------|
| FR-005, FR-006, SC-002 no environment reads in `e2e/` | repo-scan guard | `e2e/lib/no-env.test.ts`, unit (fails on `process.env`, `import.meta.env`, `Deno.env` under `e2e/`) |
| FR-007, FR-018 removed credential/variable names gone | repo-scan guard (same file, activated by the last task) | `e2e/lib/no-env.test.ts`, unit; greps workflows, compose files, docs |
| FR-001–FR-003 one command, own stack, teardown, concurrency | runner + `compose.ts` | `compose.test.ts` (argv, unique names, free ports, reaper by age), unit; whole-flow check in CI after every PR |
| FR-004 real database | overlay uses the pgvector image | CI e2e job itself; no mock exists to test |
| FR-008, FR-010 per-test user, own mail only | `identity.ts` + `mailbox.ts` | `mailbox.test.ts` (link extraction, filters by recipient), unit; `smoke/sign-in.spec.ts`, smoke |
| FR-009, FR-015 members via real invite; no skips | `identity.ts` | `full/profile.spec.ts` cross-member cases (converted), full |
| FR-011 no seed on the e2e stack | overlay + runner never call the seed | `compose.test.ts` asserts no seed step, unit |
| FR-012 / D435 per-IP limits env-tunable, defaults unchanged | `env.ts`, `auth.service.ts` | `env.test.ts`, `auth.service.test.ts` (limit read from env), unit |
| D433 SMTP mailer sends sign-in and invite mail | `smtp-mailer.ts` | `smtp-mailer.test.ts` (fake SMTP server in-process), unit |
| FR-013 / D436 shared dummy secret | `stack-config.ts` used by runner and `cloudinary.ts` | `media.spec.ts` (photo upload confirms with the signed fake answer), full |
| FR-014 / D439 no `CI` reads | config constants | covered by the no-env guard |
| FR-016 isolation under parallelism, SC-005 | per-test users | `full/isolation.spec.ts` (two users, many profile saves, no 429, no cross-talk), full |
| FR-017, SC-008 post-deploy probe | `infra/post-deploy-check.ts` | `post-deploy-check.test.ts` (healthy, wrong commit, down, 200 on private route), unit |
| FR-019 docs and constitution | docs edit | `docs-sync` is manual; reviewed in the PR (listed in tasks) |
| FR-020 `main` green per merge | transitional config | CI e2e job on every PR |

## Accountability

None. This feature adds no decision about a person, their content or their experience: the raised per-IP
limits are stack configuration for a disposable environment, the existing `auth.magic_link` and
`auth.callback` decision events are unchanged, and the probe and runner touch no member data.

**Operator controls**: `MAGIC_LINK_PER_IP_PER_HOUR` and `CALLBACK_PER_IP_PER_HOUR` (defaults 20 and 30,
same as today) join the existing limit variables; `MAIL_PROVIDER=smtp` with `SMTP_URL` (self-hosters may use
it). No runbook change.

## Rollout

- **Migrations**: none.
- **Env / config**: new optional API variables `MAIL_PROVIDER=smtp` (+ `SMTP_URL`, required with it),
  `MAGIC_LINK_PER_IP_PER_HOUR`, `CALLBACK_PER_IP_PER_HOUR` → README env table, `x-api-env` in
  `infra/docker-compose.yml`, `CHANGELOG.md` entry (none is a deploy blocker). Removed from docs and
  workflows: `SMOKE_SESSION_TOKEN` as an e2e input, `BASE_URL`, `WEB_BASE_URL`, `EXPECTED_SHA`,
  `CLOUDINARY_API_SECRET`, `E2E_MEMBER_B_TOKEN`, `E2E_MEMBER_C_TOKEN`, `SMOKE_INVITEE_USERNAME`, the
  `SMOKE_SESSION_TOKEN` repo secret and the `API_BASE_URL`/`SMOKE_RUNNER` variables' e2e role (the probe
  takes its URL from `vars.API_BASE_URL` as a CLI argument in the workflow, not from e2e).
- **API client**: `pnpm api:openapi` not needed.
- **Deploy order / flags**: no deploy effect from the runner. The new API variables default to today's
  behaviour, so the order is free. `smoke.yml` switches to the probe in the same PR that deletes the
  authenticated smoke.
- **Migration order** (keeps `main` green; each step one PR, CI-verified):
  1. Product bits: SMTP mailer, env-tunable limits, unit tests.
  2. Runner, `compose.ts`, overlay, `stack.ts`, `stack-config.ts`, `mailbox.ts`, transitional config, `sign-in.spec.ts`; a new CI job `e2e-isolated` runs it next to the old one.
  3. `identity.ts` (`user`, `member`) and `isolation.spec.ts`.
  4. Convert the 046 profile specs, then `tests/full`, then `tests/smoke`, in batches (matched by the isolated config as they move).
  5. Probe and `smoke.yml`.
  6. Delete the old config, `lib/env.ts`, `global-setup.ts`, seed steps and tokens in workflows, the profile override, the skips; add the removed-names guard; docs, ADR-081, constitution 1.6.0.

## Risks

| Risk | Likelihood / impact | Mitigation |
|------|---------------------|------------|
| Per-test sign-in slows smoke past 5 min | M / M | Sign in through the API (request context), not the UI, except in `sign-in.spec.ts`; share the cookie with browser contexts via `storageState`; measure in step 2 |
| Other per-IP limits trip under hundreds of users (public reads 600/h, waitlist, search embeddings) | M / M | Step 2 measures a full run; if a limit trips, make it env-tunable the same way (D435) rather than disabling; tests that exercise a limit use their own user or address |
| Free-port race between picking and binding | L / L | Runner retries the whole `up` once on a bind error |
| Hard kill leaves a stack | M / L | Reaper removes `gobbit-e2e-*` projects older than 2 h at the next start; `pnpm test:e2e --clean` removes all |
| Image rebuild each run is slow locally | M / L | Compose layer cache; documented; `--no-build` flag for reruns |
| Cookie-session writes rejected by CSRF | M / M | Runner sets `API_URL`/`APP_URL` to the chosen web origin and fixtures send `Origin` (verified in step 2); fallback: `POST /auth/token-exchange` inside the test (a token minted in-test is allowed) |
| Worker mail (reminders) not readable in the API process | L / L | Not an issue: SMTP goes to Mailpit from both processes |
| Workflow edits blocked by a token without `workflow` scope | M / M | Land step 2 and 5 workflow edits where the scope exists, or hand over a snippet (handoff note) |
| Docker unavailable in the authoring sandbox | H / M | Small CI-verified PRs; unit tests cover the logic that does not need Docker |

## Settle before starting

- [x] Confirm the constitution V amendment (D442) and the one-sentence wording in research D442 — owner
      confirmed 2026-11-18; applied by the amendment task in tasks.md (constitution 1.6.0).
- [ ] A token with `workflow` scope for the workflow edits (steps 2, 5, 6).
- [ ] Docker Compose ≥ 2.24 on developer machines (for `!reset`); runners have it.

## Complexity Tracking

No constitution violations to justify.

**Pruned while planning** (constitution IX, CLAUDE.md "Prune the plan"): the 010 `fakes` container and
`OPENROUTER_BASE_URL` override (not needed: `page.route` already fakes Cloudinary, ingestion is covered
elsewhere); the 010 `E2E_ENV` switch (no deployed e2e remains); a database provisioning shortcut from
Playwright setup (bypasses sign-in, handoff "reject"); a test-only mailbox route in the API (D150
rejected it); Playwright `webServer` for lifecycle (D430); per-test deck cleanup (stack is discarded;
specs keep it only where they assert deletion).
