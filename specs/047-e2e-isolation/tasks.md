---

description: "Task list for 047 self-contained e2e"
---

# Tasks: Self-contained e2e (own stack, own users, no environment, no tokens)

**Input**: `/specs/047-e2e-isolation/` — plan.md, spec.md, research.md (D430–D442), data-model.md, contracts/, quickstart.md

**Tests**: REQUIRED (constitution V). Every row of the plan's traceability table has a test task below.

**Organization**: by user story. Each phase is one CI-verified PR step of the plan's "Migration order" (keeps `main` green, FR-020). The authoring sandbox has no Docker: tasks that need a stack are verified in CI.

## Format: `[ID] [P?] [Story] [Tier?] Description`

- **[P]**: different files, no dependency on an incomplete task
- **[Tier]**: `[unit]` `*.test.ts` next to code; `[e2e:smoke]` / `[e2e:full]` Playwright specs. Feature E2E tier is "none" (test infrastructure); `[e2e:*]` here marks the fixture-proving specs and converted specs, which keep their existing tier.
- **Workflow edits** (`.github/workflows/*`) need a token with `workflow` scope; if absent, hand the snippet over (plan Risks).

---

## Phase 1: Foundational — product bits (plan step 1)

**Purpose**: the two small product changes the stack needs. Defaults unchanged, so deploy order is free.

- [X] T001 Rename `RATE_MAGIC_LINK_PER_IP` / `RATE_CALLBACK_PER_IP` to `*_DEFAULT` (20 and 30 per hour, values unchanged) in packages/shared/src/limits.ts and update every importer (`grep -rn "RATE_MAGIC_LINK_PER_IP\|RATE_CALLBACK_PER_IP" apps packages`)
- [X] T002 Add optional env `MAGIC_LINK_PER_IP_PER_HOUR` and `CALLBACK_PER_IP_PER_HOUR` (positive int, defaults from T001) and `MAIL_PROVIDER=smtp` with `SMTP_URL` (required when `smtp`, otherwise ignored) in apps/api/src/env.ts
- [X] T003 Read the two per-IP limits from env in apps/api/src/services/auth.service.ts (per-email limit stays 5/hour; per-user limits untouched)
- [X] T004 [P] [unit] Env parsing: defaults, overrides, `smtp` requires `SMTP_URL` in apps/api/src/env.test.ts
- [X] T005 [P] [unit] Per-IP limit is read from env (small value trips 429, default unchanged) in apps/api/src/services/auth.service.test.ts
- [X] T006 Add dependency `nodemailer` (+ `@types/nodemailer`) to apps/api/package.json (justified in research D433)
- [X] T007 Implement SMTP mailer sending the existing `signInEmail`/invite templates in apps/api/src/mail/smtp-mailer.ts and wire `MAIL_PROVIDER=smtp` in apps/api/src/mail/create-mailer.ts (the worker builds its mailer from the same env)
- [X] T008 [P] [unit] SMTP mailer delivers to an in-process fake SMTP server, and `create-mailer` selects it in apps/api/src/mail/smtp-mailer.test.ts
- [X] T009 [P] Add `MAIL_PROVIDER`, `SMTP_URL`, `MAGIC_LINK_PER_IP_PER_HOUR`, `CALLBACK_PER_IP_PER_HOUR` to `x-api-env` in infra/docker-compose.yml, the README env table, and a CHANGELOG.md entry (none is a deploy blocker)

**Checkpoint**: `pnpm typecheck` and `pnpm test:unit` pass; production behaviour unchanged.

---

## Phase 2: User Story 1 — One command runs e2e on a throwaway stack (P1) 🎯 MVP (plan step 2)

**Goal**: `pnpm test:e2e` creates a uniquely named stack, runs Playwright, always removes the stack.

**Independent Test**: quickstart §1 — run, interrupt, run twice in parallel; no `gobbit-e2e-*` project/volume remains.

- [ ] T010 [P] [US1] Create checked-in constants (`PROJECT_PREFIX`, `STALE_AFTER_MS` 2 h, `CLOUDINARY_DUMMY` with the secret labelled "dummy, e2e only", `ADMIN_EMAIL`, `EMAIL_DOMAIN` `example.test`, `TIMEOUTS` up 300 s / health 120 s / mail 10 s) in e2e/lib/stack-config.ts (data-model "Stack constants")
- [ ] T011 [P] [US1] Create stack-file reader exporting `stack`, `webUrl(path)`, `apiPath(path)`; validates the shape in contracts/stack-file.md and throws "no stack: run `pnpm test:e2e`" if missing in e2e/lib/stack.ts
- [ ] T012 [US1] Implement compose helpers: project name `gobbit-e2e-<epoch base36>-<4 [a-z0-9]>`, free loopback ports, compose argv (base + local + e2e overlay, `--env-file`), `/api/health` + `/version.json` wait (migration equals last journal tag), age-based reaper in e2e/lib/compose.ts
- [ ] T013 [P] [US1] [unit] Unique names, distinct free ports, argv has no seed step (FR-011), reaper removes only `gobbit-e2e-*` older than `STALE_AFTER_MS` in e2e/lib/compose.test.ts
- [ ] T014 [P] [US1] Create the overlay per contracts/compose-overlay.md (`REGISTRATION_MODE=open`, smtp, per-IP limits 100000, `ports: !reset`/`!override`, pinned `axllent/mailpit` — pick the current release and record it, `PROFILE_UPDATE_RATE_PER_HOUR` not set) in infra/docker-compose.e2e.yml
- [ ] T015 [US1] Implement the runner per contracts/runner.md (flags `--no-build --keep --clean`, Compose ≥ 2.24 check exit 2, reap, write `e2e/.stack/compose.env` from `stack-config.ts`, `up -d --build --wait`, retry once on bind error, write `stack.json`, spawn Playwright with the extra args, `finally` + SIGINT/SIGTERM log collection to `e2e/.stack/stack.log` then `down -v --remove-orphans`, exit codes 0/1/2/3) in e2e/run.ts
- [ ] T016 [P] [US1] Add `.stack/` to .gitignore and point root script `test:e2e` at the runner in package.json (keep the e2e package `test` script for editor tooling)
- [ ] T017 [US1] Create the transitional config matching only converted specs, with `retries`/`workers`/`reporter` as constants (no `CI`, D439), `baseURL` from `stack.ts`, in e2e/playwright.isolated.config.ts; make the old e2e/playwright.config.ts ignore the converted specs (D440)
- [ ] T018 [US1] Add CI job `e2e-isolated` next to `e2e`: checkout, install, `playwright install --with-deps chromium`, `pnpm test:e2e --grep @smoke --retries=1`, upload `e2e/.stack/stack.log` and report; no seed, no token, no `env:` in .github/workflows/ci.yml

**Checkpoint**: runner brings up and removes a stack in CI; no spec depends on it yet.

---

## Phase 3: User Story 2 — Every test creates its own signed-in user (P1) (plan steps 2–3)

**Goal**: `user` fixture signs in through the real magic link, mail read from Mailpit.

**Independent Test**: `smoke/sign-in.spec.ts` and `full/isolation.spec.ts` pass; two parallel users never see each other's changes and never hit a limit.

- [ ] T019 [P] [US2] Mailpit REST client: latest message for a recipient (FR-010), first `/auth/callback?token=…` link, waits up to `TIMEOUTS` mail in e2e/lib/mailbox.ts
- [ ] T020 [P] [US2] [unit] Link extraction and recipient filtering (other users' mail is never returned) in e2e/lib/mailbox.test.ts
- [ ] T021 [US2] Create the `user` fixture (address `<tag>-<8 random>@example.test`, tag defaults to `user`, sign-in through the request context with `Origin` set to the API origin, `GET /me`, `storageState`), plus `api` (cookie), `anon`, `context`, `newUser(tag?)`, and the `Identity` shape in contracts/fixtures.md, in e2e/fixtures/identity.ts
- [ ] T022 [P] [US2] [e2e:smoke] Real UI journey: request link on the sign-in page, read it from the mailbox, follow it, land signed in with a personal deck in e2e/tests/smoke/sign-in.spec.ts (010 S1)
- [ ] T023 [US2] [e2e:full] Two users in parallel each save their profile dozens of times: no 429, no cross-talk, no raised limit in e2e/tests/full/isolation.spec.ts
- [ ] T024 [US2] Register `sign-in.spec.ts` and `isolation.spec.ts` in e2e/playwright.isolated.config.ts and measure smoke time; if another per-IP limit trips, make it env-tunable like T002 (D435) instead of disabling it

**Checkpoint**: `e2e-isolated` passes with a real user per test.

---

## Phase 4: User Story 3 — Multi-member journeys are written like any other test (P1) (plan step 3)

**Goal**: `member(deck, role)` returns an invited, accepted, signed-in member in their own browser context.

**Independent Test**: owner + two members of different roles on one deck, each asserts what their role allows; no skip.

- [ ] T025 [US3] Add `member(deck, role)` (invite by email through `POST /decks/{id}/members`, follow the invite mail link in a separate context and cookie jar) and the `smokeDeck`/`webDeck` fixtures (`smoke-<id>`, no cleanup) to e2e/fixtures/identity.ts
- [ ] T026 [US3] [e2e:full] Owner plus editor and reader on one deck: each sees exactly what their role allows (extend e2e/tests/full/isolation.spec.ts or add e2e/tests/full/members-roles.spec.ts and register it in the isolated config)

**Checkpoint**: multi-member specs can be written without tokens.

---

## Phase 5: User Story 6 — Existing suites converted (P2) (plan step 4)

**Goal**: every spec runs on the per-test-user model; provisioning skips are gone. Convert by changing fixture imports to `e2e/fixtures/identity.ts`, removing `process.env`/`lib/env` reads and any `test.skip` for missing tokens, then adding the file to the isolated config's match list (every conversion task includes this step; a spec in neither config would not run).

**Independent Test**: quickstart §2 — `grep -ci skipped` is 0 for profile; smoke tier ≤ 5 min.

### Batch 0 — run converted full specs in CI

- [ ] T027 [US6] Add a runner-based full job (`e2e-full-isolated`) to .github/workflows/e2e-full.yml running `pnpm test:e2e tests/full --retries=1` with no seed, token or `env:` block (same `e2e:full` label trigger), so converted full specs run in CI before the old config is removed; T044 deletes the old job

### Batch A — 046 profile specs (the reason for this work)

- [ ] T028 [US6] [e2e:full] Convert e2e/tests/full/profile.spec.ts (replace `E2E_MEMBER_B_TOKEN`/`E2E_MEMBER_C_TOKEN` with `member()`; rate-limit cases use `newUser`) and e2e/tests/full/helpers/profile.ts

### Batch B — `tests/full` (independent files, run as parallel tasks)

> Each task covers 5–6 spec files. Delegate it as one worker task; if the worker reports blocked or too large, split it by file and keep the `[P]` marker.

- [ ] T029 [P] [US6] [e2e:full] Convert about, activity-log, analytics-consent, app-analytics, app-header, appearance specs in e2e/tests/full/
- [ ] T030 [P] [US6] [e2e:full] Convert bottom-bar, browse-rework, card-actions, composer, cover specs (+ helpers/browse-deck.ts, helpers/swipe.ts) in e2e/tests/full/
- [ ] T031 [P] [US6] [e2e:full] Convert deck-admin, deck-chrome, editor-inputs, editor-navigation, events, import specs (+ helpers/deck-header.ts) in e2e/tests/full/
- [ ] T032 [P] [US6] [e2e:full] Convert landing, links, media-public, media, mobile-fit, new-deck specs in e2e/tests/full/ (media: signed fake Cloudinary answer uses `CLOUDINARY_DUMMY` from `stack-config.ts` via e2e/fixtures/cloudinary.ts, FR-013)
- [ ] T033 [P] [US6] [e2e:full] Convert paste-image, registration-gate, reminders, rich-text, shares, waitlist-admin specs in e2e/tests/full/ (registration-gate and waitlist-admin must not rely on global state other tests change; use `ADMIN_EMAIL` user for admin cases)
- [ ] T034 [US6] Update e2e/fixtures/api.ts, e2e/fixtures/web.ts and e2e/fixtures/cloudinary.ts to the cookie `api` and shared constant (same exported names) once Batch B files are converted

### Batch C — `tests/smoke`

- [ ] T035 [P] [US6] [e2e:smoke] Convert auth, browse, decks, editor, health, items specs in e2e/tests/smoke/
- [ ] T036 [P] [US6] [e2e:smoke] Convert landing, lifecycle, members (drop `SMOKE_INVITEE_USERNAME`, use `member()`), openapi, public, review specs in e2e/tests/smoke/
- [ ] T037 [P] [US6] [e2e:smoke] Convert search, settings, share, web specs and e2e/tests/smoke/helpers/ in e2e/tests/smoke/
- [ ] T038 [US6] Run the smoke tier on the isolated config and confirm ≤ 5 min (SC-006) and zero provisioning skips (SC-003) and zero 429s (SC-004); record timings in specs/047-e2e-isolation/implementation-notes.md
- [ ] T039 [US6] Raise `--workers` in the full tier and run it 3 times in a row on the isolated stack; confirm no failure from shared user state (SC-005), zero 429s (SC-004), then drop `retries` crutches that existed for shared-state causes (FR-014, US6 scenario 2); record results in specs/047-e2e-isolation/implementation-notes.md

---

## Phase 6: User Story 5 — Post-deploy no-identity check (P2) (plan step 5)

**Goal**: `pnpm post-deploy-check <origin> --sha <commit>` replaces the authenticated post-deploy smoke.

**Independent Test**: quickstart §4 — passes on matching commit, fails naming `api-commit` on a wrong one.

- [ ] T040 [P] [US5] [unit] Healthy, wrong commit, down, `/api/decks` or `/api/me` answering 200, missing join form, bad arguments (exit 2) in infra/post-deploy-check.test.ts
- [ ] T041 [US5] Implement the checks `api-commit`, `web-commit`, `landing`, `anonymous-refused`, `public-health` per contracts/post-deploy-check.md (GET only, CLI args only, no env, polling every 2 s up to `--timeout-minutes`) in infra/post-deploy-check.ts and add root script `post-deploy-check` in package.json
- [ ] T042 [US5] Switch .github/workflows/smoke.yml to run `pnpm post-deploy-check "<origin from vars.API_BASE_URL minus /api>" --sha ${{ github.sha }}` with no secret

---

## Phase 7: User Story 4 — No environment, no stored credential (P1) (plan step 6)

**Goal**: remove old scaffolding and prove it by guard.

**Independent Test**: quickstart §3 — guard passes; suite passes under `env -i`.

- [ ] T043 [US4] Promote the isolated config to e2e/playwright.config.ts and delete e2e/playwright.isolated.config.ts, e2e/global-setup.ts, e2e/lib/env.ts, e2e/lib/env.test.ts; point the runner at the final config name
- [ ] T044 [US4] Remove the seed/export steps, `SMOKE_SESSION_TOKEN`, `E2E_*`, `BASE_URL`, `EXPECTED_SHA`, `CLOUDINARY_API_SECRET` and the `e2e` job in favour of `e2e-isolated` (renamed `e2e`) from .github/workflows/ci.yml and .github/workflows/e2e-full.yml
- [ ] T045 [US4] Remove the `PROFILE_UPDATE_RATE_PER_HOUR` override from infra/docker-compose.local.yml (the production default in docker-compose.yml stays)
- [ ] T046 [P] [US4] [unit] Repo-scan guard: no `process.env`, `import.meta.env`, `Deno.env` under e2e/; and, from this task on, none of `SMOKE_SESSION_TOKEN`, `E2E_MEMBER_B_TOKEN`, `E2E_MEMBER_C_TOKEN`, `SMOKE_INVITEE_USERNAME`, `BASE_URL`, `WEB_BASE_URL`, `EXPECTED_SHA`, `CLOUDINARY_API_SECRET`, or the e2e profile rate-limit override with word-bounded patterns (so `API_BASE_URL` is not matched), scanning only e2e/, .github/workflows/, infra/docker-compose*.yml and package.json scripts, never docs/adr.md, specs/ or CHANGELOG.md, in e2e/lib/no-env.test.ts
- [ ] T047 [US4] Verify `env -i HOME="$HOME" PATH="$PATH" pnpm test:e2e --grep @smoke` passes and that no `test.skip` for provisioning remains (`grep -rn "test.skip" e2e/tests`)

---

## Phase 8: Polish & cross-cutting (docs, ADR, constitution)

- [ ] T048 [P] Update docs/design/testing.md (self-contained rule, runner, fixtures, probe; move 046/047 deviations into its Deviations list), infra/README.md, README.md, CLAUDE.md Testing line
- [ ] T049 [P] Add ADR-081 (D430, D431, D432, D433, D435, D438, D442) to docs/adr.md and one index row to docs/architecture.md (stay < 250 lines)
- [ ] T050 [P] Amend .specify/memory/constitution.md to 1.6.0 with the self-contained e2e sentence from research D442 (owner confirmed, 2026-11-18)
- [ ] T051 [P] Record D430–D442 in specs/README.md and `Status` in specs/047-e2e-isolation/spec.md; start specs/047-e2e-isolation/implementation-notes.md with decisions and deviations
- [ ] T052 Walk quickstart.md §1–§6 end to end on a machine with Docker (or read the green CI run) and tick the plan's "Settle before starting" boxes

---

## Dependencies & Execution Order

- **Phase 1** → blocks all (mailer and limits are needed by the overlay in T014).
- **Phase 2 (US1)** → blocks Phases 3–7. Within it: T010, T011 → T012 → T015; T014 parallel; T017 after T011; T018 last.
- **Phase 3 (US2)** after Phase 2; **Phase 4 (US3)** after T021.
- **Phase 5 (US6)**: Batch 0 (T027) first, then Batch A (needs T025) → Batches B and C (each task `[P]` across files); T034 after Batch B; T038 after Batch C; T039 after T027 and T038; T045 after T044.
- **Phase 6 (US5)** is independent of Phases 3–5 after Phase 1; may run in parallel with Phase 5.
- **Phase 7 (US4)** only after Phases 5 and 6 (nothing uses the old scaffolding). **Phase 8** last (T050: owner confirmed the constitution V amendment, 2026-11-18).

## Parallel examples

- Phase 1: T004, T005, T008, T009 together once T001–T003, T006–T007 are in.
- Phase 5 Batch B: T029–T033 together (different spec files).
- Phase 5 Batch C and Phase 6 run side by side.

## Implementation strategy

MVP = Phases 1–3 (runner + real user per test, proven by `sign-in.spec.ts` and `isolation.spec.ts`), merged as 3 small PRs. Then Phase 4, convert (Phase 5) in batches, probe (Phase 6), and finish with removal and docs (Phases 7–8). Each phase ends green in CI; old and new configs coexist until T043.
