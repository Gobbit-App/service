# Implementation Plan: Nightly full e2e suite (outline)

**Branch**: `011-e2e-nightly` | **Date**: 2026-10-21 | **Spec**: [spec.md](./spec.md) | **Roadmap**: cross-cutting (test infrastructure)

**Input**: Feature specification from `/specs/011-e2e-nightly/spec.md`

This is a deliberately shallow outline. It fixes the shape (workflow, catalogue, budgets) so that 010 can be built toward it. Once 010 is merged, run `/speckit-clarify` and `/speckit-plan` again to fill in research.md and tasks. Decision numbers are assigned then.

## Summary

Add `nightly.yml`. It builds `main` (or a dispatched ref), starts the 010 Compose stack with **real** third parties from `E2E_*` secrets, and runs `@smoke` and `@full` across three browser projects. It reports through one rolling GitHub issue. `e2e/tests/full/` gets one shallow spec per catalogue area (F1–F14), starting with the feature checks that 010 moves out of smoke.

## Technical Context

**Language/Version**: TypeScript (strict, ESM) on Node ≥ 22

**Primary Dependencies**:
- Playwright (existing).
- Candidate new dependency: `@axe-core/playwright` for F13, to be justified in research.md.

**Storage**: none new

**Testing**: Playwright `@full`; unit tests for any new helper with logic (e.g. issue-body formatting)

**E2E tier**: full (this feature defines it)

**Target Platform**: GitHub-hosted Ubuntu; projects `web-smoke` (Pixel 7 Chromium), `webkit-iphone` (iPhone 15), `desktop-chromium`, `api`

**Performance Goals**: ≤ 30 min test time; ≤ 45 min job time

**Constraints**:
- Never production credentials or data.
- Spend capped at the provider (key limit).
- Test-cloud assets deleted.

## Constitution Check

| Principle | How this plan complies |
|-----------|------------------------|
| I–III | N/A: no API, contract or schema change |
| IV. Private by default | Personas exercise visibility (F1). Test-only secrets, never production ones |
| V. Tests at the right tier | Defines the `@full` tier. Each area: happy path plus 1–2 negatives. Depth stays in unit and int tests |
| VI. Lean, offline-first web | F11 covers offline and drafts; no web code change |
| VII. Simple, optional, deployable | AI specs skip without keys. At most one new dev dependency (axe), justified |

## Workflow shape (`.github/workflows/nightly.yml`)

- **Triggers**: `schedule: cron '0 2 * * *'`; `workflow_dispatch` with a `ref` input (default `main`). Never on PRs or forks.
- **Job**:
  1. Checkout the ref and set up pnpm and Node with the latest `actions/*` versions.
  2. Build the images (GHA cache).
  3. `docker compose -f infra/docker-compose.yml -f infra/docker-compose.local.yml -f infra/docker-compose.e2e.yml -f infra/docker-compose.nightly.yml up -d --wait`. The nightly overlay swaps the fake LLM and fake Cloudinary for real ones: `OPENROUTER_API_KEY=${{ secrets.E2E_OPENROUTER_API_KEY }}`, `CLOUDINARY_URL=${{ secrets.E2E_CLOUDINARY_URL }}`. Mailpit stays.
  4. Seed.
  5. `E2E_ENV=nightly playwright test --grep "@smoke|@full"`, all projects.
- **Artifacts**: the Playwright HTML report, traces, and `docker compose logs --no-color` for every service (JSON lines). Retention 14 days.
- **Report**: on failure, a step creates or updates the open `nightly-e2e` issue (failing spec titles, run link, `provider` when every failure is a third-party call). On success, it closes the issue. Uses `gh` with `issues: write`.
- **Cleanup**: a teardown deletes the run's Cloudinary prefix `e2e/<runId>/`. A weekly step sweeps anything older than 7 days.

## Catalogue (`e2e/tests/full/`, shallow)

| ID | Area | Happy path | Negatives (1–2) | Absorbs from today / deviations |
|----|------|------------|-----------------|---------------------------------|
| F1 | Role matrix | Owner, co-owner, editor, reader, guest: each sees what their role allows (Add card, Edit, Members, Review) | Reader cannot see a restricted category's cards in list, search or share preview; editor cannot delete the deck | 007 T021/T034 gaps; `members.spec` API variants |
| F2 | Every card type | Create and render text, link (real preview of a page served by the fakes container), table, calc, image | Bad calc expression shows its error | `editor.spec` link/table/calc |
| F3 | Limits and validation | 600-character body accepted | 601 characters and an oversized table refused with the server's reason | `editor.spec` limits |
| F4 | Delete and undelete | Delete → Deleted list → Undelete | Unavailable card link shows the not-found page | `lifecycle.spec` unavailable links |
| F5 | Semantic search and Ask | A synonym query finds the card (real embeddings); Ask cites it | Ask without an AI key is hidden (separate stack config) | `search.spec` API |
| F6 | Ingestion channels | Share target URL (page served by fakes) → proposal; Shortcut `ing_` token → proposal; signed email-in fixture → proposal | Duplicate share is flagged as a duplicate; a bad token gets 401 | `share.spec`, `settings.spec` tokens |
| F7 | Review | Edit a proposal fully, then publish | Discard; publish without a category | `review.spec` discard / bad slug |
| F8 | Share previews | Public share renders OG tags and an image | Expired or private share does not leak content | `share.spec` OG |
| F9 | Account and settings | Create and revoke an ingest token; sign out everywhere ends other sessions | Revoked token refused | `settings.spec` |
| F10 | Browse extras | Footer panes, keyboard navigation, deep link to a card | Deep link to a card in a hidden category | `browse.spec` panes/keys |
| F11 | PWA, offline, drafts | Draft survives a reload; installable manifest | Sign-out clears drafts; offline editor disabled | `editor.spec` drafts, `web.spec` offline |
| F12 | Cross-browser | Smoke journeys under `webkit-iphone` and `desktop-chromium` | — | new |
| F13 | Accessibility | axe sweep of deck list, card, editor, browse, review: no serious or critical violations | — | new (candidate dependency) |
| F14 | Auth abuse | Expired magic link shows the error page | 6th magic link in an hour gets 429 | `auth.spec` variants |

## Budgets and policy

- **Time**: ≤ 30 min of test time across projects. A spec over 2 min is split or trimmed.
- **Flake**: D155 from 010 (retry 1, quarantine within a week).
- **Spend**: fixed by key-level limits on the test keys; the plan records them only as "capped", not the amounts (public repo).
- **Growth**: a new `@full` spec must name its catalogue area. A new area needs a line in this table (amend via a new feature after merge).

## Delivery outline

1. `infra/docker-compose.nightly.yml` and `nightly.yml` running today's moved `tests/full/` specs (from 010) with issue reporting.
2. F1, F6 and F11 first (the largest known gaps), then F2–F5 and F7–F10.
3. F12 projects, F13 (decide on axe in research.md) and F14.
4. Docs: README (nightly section, secrets), architecture (E2E section, Deviations).

## Open questions for `/speckit-clarify`

- A test Cloudinary cloud, or a folder in the production cloud? (Preferred: a separate cloud.)
- Should nightly also run against the deployed instance, read-only, to catch drift between Compose and Dokploy?
- Issue assignee and notification channel.
