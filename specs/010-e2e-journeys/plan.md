# Implementation Plan: Smoke tests as real-usage journeys

**Branch**: `010-e2e-journeys` | **Date**: 2026-10-21 | **Spec**: [spec.md](./spec.md) | **Roadmap**: cross-cutting (test infrastructure)

**Input**: Feature specification from `/specs/010-e2e-journeys/spec.md`

This plan follows the project override of the core template (`.specify/templates/overrides/`). The repository is public (constitution, Constraints). Next steps: `/speckit-clarify`, then `/speckit-tasks`.

## Summary

Replace today's feature-by-feature `@smoke` checks with about 8 **journeys** that run the real product end to end. Then run them in two places:

- **On every PR**, against a Compose stack built from the PR. A Mailpit inbox makes real magic-link sign-in and invites possible. A small fakes container stands in for Cloudinary's upload and delivery hosts (verifying real signatures) and for the LLM provider (deterministic answers).
- **After every deploy**, against production, with real third parties. Sign-in there stays the cookie shortcut.

One fixture layer (`signIn`, `persona`, `photoHost`, `env`) hides the difference, so a journey is written once. The tier rule (constitution V v1.1.0, ADR-053) decides which future tests join smoke and which go to the nightly `@full` suite ([`011-e2e-nightly`](../011-e2e-nightly/plan.md)).

## Starting point

- **main @ `c164b38`**: latest migration `0011_item_lifecycle`, latest decision D147, latest ADR-052.
- **e2e today**:
  - 15 spec files and about 60 tests, all tagged `@smoke`, in projects `api-smoke` and `web-smoke` (Pixel 7). Projects are picked by filename regex in `e2e/playwright.config.ts`.
  - Fixtures: `api` (bearer), `anon`, `smokeDeck` and `webDeck` (seeds one card per type through the API, signs in the browser by cookie).
  - `global-setup.ts` waits for `/health` (migration and commit) and `/version.json`.
- **CI**: `ci.yml` (lint, typecheck, unit+int with Testcontainers, search eval, budget, image push and deploy on main). No Compose and no Playwright. `smoke.yml` runs `@smoke` after a successful deploy, against `vars.API_BASE_URL`.
- **Gaps that block real journeys**:
  - **Mail**: only `resend` or `console` mailers exist; nothing can read the sent mail.
  - **LLM**: the OpenRouter base URL is a constant (`ai/providers.ts:16`), so nothing can point the stack at a fake.
  - **Cloudinary**: hosts are hardcoded, but the browser upload can be routed by Playwright, so no server change is needed.

## Technical Context

**Language/Version**: TypeScript (strict, ESM, no build step) on Node ≥ 22

**Primary Dependencies**:
- Playwright 1.63 (existing).
- **`nodemailer`** (new, API only): the SMTP mailer for Mailpit, also useful to self-hosters (D150).
- **Mailpit** (container image, CI and local only).
- The fakes container reuses Hono (existing).

**Storage**: none new. Journeys use the public API and UI only

**Testing**: this feature *is* tests. New unit tests for the SMTP mailer, the env guard, the fake signature checker and the fake LLM's determinism. The journeys themselves run in `e2e`.

**E2E tier**: smoke (this feature defines it)

**Target Platform**: GitHub-hosted Ubuntu runners (PR stack); the deployed Dokploy instance (post-deploy)

**Project Type**: pnpm monorepo. Changes in `e2e/`, `infra/`, `.github/workflows/`, `apps/api` (mailer, env), docs

**Performance Goals**: smoke test time ≤ 5 min; the PR `e2e` job ≤ 12 min including the Compose build (SC-003)

**Constraints**:
- No test-only behaviour reachable in production (FR-008).
- No SQL in tests.
- No fixed sleeps.
- Fresh e-mail addresses per run (magic-link limit of 5 per email per hour).

**Scale/Scope**: about 8 web journeys plus 3 API contract checks in smoke. Everything else moves to `@full` (011)

## Constitution Check

| Principle | How this plan complies (or "N/A") |
|-----------|-----------------------------------|
| I. Layered API | The SMTP mailer is a new `Mailer` implementation behind `createMailer`. No routes, services or repos change |
| II. One source of truth for contracts | Journeys call the API through the UI. API helpers use the generated paths. No DTO change |
| III. Invariants live in the database | N/A: no schema change |
| IV. Private by default | Personas test role rules in the browser. Fixtures use only `example.test` addresses. The fakes and the base-URL override are refused under `NODE_ENV=production` |
| V. Tests at the right tier | Defines the tiers (amendment v1.1.0). New code has unit tests; journeys are `@smoke`. Traceability below |
| VI. Lean, offline-first web | N/A: no web code change. The offline journey (S8) checks the persisted cache |
| VII. Simple, optional, deployable | One new dependency (nodemailer, D150) and one dev-only image (Mailpit). AI stays optional: S5 skips without a key. `main` stays deployable, and the PR gate adds safety |

## Decisions this plan pins down

| ID | Decision | ADR? |
|----|----------|------|
| D148 | Two Playwright tiers by tag: `@smoke` (critical journeys, every PR plus post-deploy, ≤ 5 min) and `@full` (everything else, nightly, ≤ 30 min). The tier rule is in constitution V | yes → ADR-053 |
| D149 | A smoke test is a journey: one member task from start to finish through the UI, crossing every internal boundary for real. Feature-level checks move to `@full` or to unit/int tests | yes → ADR-053 |
| D150 | Test mailbox: Mailpit plus a new `MAIL_PROVIDER=smtp` (`SMTP_URL`, nodemailer). Deployed sign-in keeps the `SMOKE_SESSION_TOKEN` cookie; a readable deployed inbox is deferred | no |
| D151 | Third parties on the PR stack are replaced at the network edge only: Cloudinary upload and delivery via Playwright `page.route` to the fakes container (which verifies signatures with the test secret), LLM via `OPENROUTER_BASE_URL` (env, refused in production) to the fake | no |
| D152 | One journey source for every environment: fixtures (`env`, `signIn`, `persona`, `photoHost`) switch behaviour by `E2E_ENV=pr\|deployed\|nightly`. Journeys needing a readable inbox are tagged `@mailbox` | no |
| D153 | CI `e2e` job on PRs: `docker-compose.yml` + `.local.yml` + new `docker-compose.e2e.yml` (Mailpit, fakes, env), seed, `playwright test --grep @smoke`. Artifacts: report and `docker compose logs api worker` (JSON) | no |
| D154 | Deployed photo cleanup: teardown deletes `gobbit/items/<smokeDeckId>/` through the Cloudinary Admin API, using the `E2E_CLOUDINARY_URL` secret (smoke workflow only, `main` only). Phase 7's orphan sweep later replaces it | no |
| D155 | Flake policy: CI retries 1; a test that is flaky twice in a week is fixed or tagged `@quarantine` (excluded from gates, tracked in an issue) within a week. No `waitForTimeout`; worker waits use auto-retrying assertions (≤ 30 s) | yes → ADR-053 |

Full reasoning and the rejected alternatives are in [research.md](./research.md).

## Journey catalogue (smoke)

Columns: **PR** = the Compose stack with fakes; **Deployed** = production after deploy.

| ID | Journey (member's task) | Steps (all through the UI) | Negative path in the same journey | PR | Deployed |
|----|-------------------------|---------------------------|-----------------------------------|----|----------|
| S1 | Sign in and out `@mailbox` | Request a magic link for a fresh address → open the email in Mailpit → land on `/d/me` → sign out | Reusing the same link lands on the sign-in error page | ✅ | skipped |
| S2 | Write a card and find it again | Open a smoke deck → **Add card** (text, category chip) → see it in the list → search a word from the body → open the card page → favorite → reload: still favorite | 601-character body: Save disabled with the reason | ✅ | ✅ |
| S3 | Add a photo card | Image type → **Choose photo** → real `media/sign` → upload (fake host verifies the signature on PR; real Cloudinary after deploy) → alt text → save → rendered in the list | Upload refused (fake host answers 400 "Resolution too high"): the reason is shown and the failure report gets 204 | ✅ | ✅ (with cleanup, D154) |
| S4 | Fix, archive and get back | Edit the card from S2's pattern → archive → Undo → archive → search misses → restore from Archived → search hits | Delete → confirm → Undo | ✅ | ✅ |
| S5 | Share something in and publish it | Paste box (`/share`) with text → the worker extracts (fake LLM on PR, real after deploy) → review pill count +1 → open review → set a category → **Publish** → the card is in the list | Publish without a category is refused (D95) | ✅ | ✅ (skips without an AI key) |
| S6 | Invite a family member `@mailbox` | Owner invites `e2e-<run>-editor@example.test` as editor → second context opens the invite email → accepts → adds a card → owner sees it | Editor has no member management; a reader invitee gets no **Add card** | ✅ | skipped |
| S7 | Browse a category | Deck list → **Browse** → swipe up twice → header swipe to the next category → close → the list is at the last card | Swipe right at the first category: no change | ✅ | ✅ |
| S8 | Read offline | Open a deck (cards cached) → `context.setOffline(true)` → reload → cards and the favorite are visible → the editor's photo picker is disabled | Search offline shows the offline notice | ✅ | ✅ |
| A1–A3 | API contract (`api-smoke`) | `/health` and `/version.json` report the commit · `/openapi.json` parses · 401 problem+json for anonymous and garbage bearers | — | ✅ | ✅ |

Journeys run on `web-smoke` (Pixel 7, touch). Desktop and WebKit variants are in `@full` (011).

## Environment matrix

| Concern | `pr` (Compose) | `deployed` |
|---------|----------------|------------|
| Sign-in | Real magic link via Mailpit (`signIn` fixture) | Cookie = `SMOKE_SESSION_TOKEN` |
| Mail | `MAIL_PROVIDER=smtp`, `SMTP_URL=smtp://mailpit:1025` | Resend (real; content not read) |
| Cloudinary | `CLOUDINARY_URL` with test credentials; `page.route` sends `api.cloudinary.com` and `res.cloudinary.com` to `fakes` | Real account; teardown by prefix |
| LLM / embeddings | `OPENROUTER_API_KEY=fake`, `OPENROUTER_BASE_URL=http://fakes:4010/v1` | Real provider |
| Data | Fresh database per job; owner seeded with `SMOKE_SESSION_TOKEN` | Shared production database; `smoke-<id>` decks deleted |
| Personas | Owner plus invited editor and reader | Owner only |

## Project Structure

### Documentation (this feature)

```text
specs/010-e2e-journeys/
├── spec.md
├── plan.md        # this file
└── research.md    # D148–D155
```

### Source Code (repository root)

```text
e2e/
├── playwright.config.ts      # projects: api-smoke, web-smoke; grepInvert @quarantine; E2E_ENV
├── lib/env.ts                # + E2E_ENV, MAILPIT_URL, FAKES_URL, E2E_RUN_ID
├── lib/mailpit.ts            # latest message to an address, first link in it (polling)
├── fixtures/
│   ├── api.ts                # unchanged API fixtures
│   ├── web.ts                # webDeck becomes optional seeding; uses signIn
│   ├── auth.ts               # signIn(persona): magic link (pr) or cookie (deployed)
│   ├── personas.ts           # invite + accept for editor/reader (pr only)
│   └── photo-host.ts         # page.route to fakes (pr) or real + cleanup (deployed)
├── fakes/                    # tiny Hono app, one container
│   ├── server.ts             # /cloudinary/v1_1/:cloud/image/upload (signature check), /res/*, /v1/chat/completions, /v1/embeddings
│   ├── cloudinary-signature.ts (+ .test.ts)
│   └── llm.ts (+ .test.ts)   # deterministic extraction and hashed bag-of-words embeddings
└── tests/
    ├── smoke/                # S1–S8 journeys + api contract (A1–A3)
    └── full/                 # moved feature checks (run nightly, see 011)

infra/docker-compose.e2e.yml  # mailpit, fakes; api/worker env for smtp + fake LLM + test Cloudinary
apps/api/src/mail/smtp-mailer.ts (+ .test.ts)
apps/api/src/env.ts           # MAIL_PROVIDER=smtp, SMTP_URL; OPENROUTER_BASE_URL (refused in production)
apps/api/src/ai/providers.ts  # reads the base URL from env
.github/workflows/ci.yml      # + e2e job (needs: changes)
.github/workflows/smoke.yml   # E2E_ENV=deployed, E2E_CLOUDINARY_URL
.github/pull_request_template.md  # e2e tier question (added with the constitution amendment)
```

**Structure Decision**: Fakes live in `e2e/fakes/` because they are test infrastructure, never shipped. The API changes are limited to a production-safe mailer and an env-guarded base URL.

## Moving today's specs

| Today | Becomes |
|-------|---------|
| `auth.spec.ts` (401s, owner session) | A3 (smoke); owner-session check folded into S1 |
| `health.spec.ts`, `openapi.spec.ts` | A1, A2 (smoke) |
| `editor.spec.ts`: text card, reload | S2 |
| `editor.spec.ts`: image upload, refused upload | S3 (signing no longer faked) |
| `editor.spec.ts`: link, table, calc, drafts, inline category, alt-text, no-storage, fetch preview | `full/editor-*.spec.ts` (011 F2/F3) |
| `lifecycle.spec.ts` demo 2, delete/undo | S4; unavailable links → `full/` |
| `share.spec.ts` paste | S5 (now through the worker); OG tags, expired share → `full/` |
| `review.spec.ts` | S5 (publish); discard and bad slug → `full/` |
| `members.spec.ts` | S6 (real invite email); API variants → `full/` |
| `browse.spec.ts` | S7 (core); panes, keys, deep link → `full/` |
| `web.spec.ts` | S2/S8 (search, favorite, offline); 360 px overflow, chips → `full/` |
| `decks.spec.ts`, `items.spec.ts`, `search.spec.ts` (API) | `full/api-*.spec.ts`; their rules are also covered by int tests |
| `settings.spec.ts` | `full/` |

Nothing is deleted until its journey or `full/` copy is green on CI.

## Invariant → test traceability

| Invariant (FR / D) | Enforced in | Test | Tier |
|--------------------|-------------|------|------|
| FR-003 real sign-in on PR | `fixtures/auth.ts` | S1, and every journey's `signIn` on `pr` | e2e (smoke) |
| FR-005 fake host verifies signatures | `e2e/fakes/cloudinary-signature.ts` | `cloudinary-signature.test.ts`; S3 | unit + e2e |
| FR-008 test-only behaviour refused in production | `apps/api/src/env.ts` | `env.test.ts` (`OPENROUTER_BASE_URL` with `NODE_ENV=production` fails) | unit |
| D150 SMTP mailer | `mail/smtp-mailer.ts` | `smtp-mailer.test.ts` (nodemailer transport stub) | unit |
| D151 deterministic fake LLM | `e2e/fakes/llm.ts` | `llm.test.ts` (same input → same output; embeddings normalized) | unit |
| D154 deployed cleanup | `fixtures/photo-host.ts` | S3 on `deployed` (warning annotation on failure) | e2e |
| FR-010 no fixed sleeps | ESLint `playwright/no-wait-for-timeout` | `pnpm lint` | lint |
| FR-009 tier rule documented | templates, CLAUDE.md, docs | review checklist | docs |

## Delivery steps

1. **Rule first** (this PR): constitution v1.1.0, ADR-053, templates, PR template, `CLAUDE.md`, README and architecture text. No code.
2. **Stack**: SMTP mailer and env guard (API, with unit tests) · `e2e/fakes` · `docker-compose.e2e.yml` · `pnpm e2e:up` / `e2e:down` scripts · CI `e2e` job running today's suite unchanged against Compose (proves the stack).
3. **Fixtures**: `env`, `signIn`, `persona`, `photoHost`, Mailpit helper.
4. **Journeys**: S1–S8 written. Old tests are moved per the table above to `tests/full/` (still run manually until 011 adds the nightly).
5. **Post-deploy**: `smoke.yml` sets `E2E_ENV=deployed` and adds the cleanup secret. The `e2e` check is required in branch protection.
6. **Docs**: README (running the PR stack locally), architecture (E2E section rewritten, Deviations), `implementation-notes.md`.

## Risks

- **CI time**: building two images per PR. Mitigation: Buildx GHA cache (`cache-from: type=gha`), reused by the main image job.
- **Compose `NODE_ENV=development`** differs from production: CSP and secure cookies. The deployed smoke covers them; the PR stack sets `COOKIE_SECURE=false` like local Compose today.
- **Signature verification drift**: the fake must match Cloudinary's algorithm. It reuses the same parameter rules as `sign-upload.ts` but is tested against fixed vectors from Cloudinary's docs, not against our own signer.

## Complexity Tracking

No constitution violations.
