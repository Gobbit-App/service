# Implementation Plan: [FEATURE]

**Branch**: `[###-feature-name]` | **Date**: [DATE] | **Spec**: [link] | **Roadmap**: `PLAN.md` § Phase [N]

**Input**: Feature specification from `/specs/[###-feature-name]/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.
Project override of the core template (`.specify/templates/overrides/`). Write for outside readers: the
repository is public (constitution, Constraints).

## Summary

[Extract from feature spec: primary requirement + technical approach from research]

## Starting point

<!--
  What main looks like before this feature: last merged phase/feature, latest migration name
  (packages/db/migrations), relevant ADRs, deployed or not. Read docs/architecture.md, the docs/design/ doc for the area and the code,
  not memory.
-->

[e.g., main @ `<sha>`, latest migration `0010_mcp_readiness`, deployed; builds on specs/00N-…]

## Technical Context

<!--
  Defaults below are the current stack. Keep what applies, delete what doesn't, and mark anything
  still open as NEEDS CLARIFICATION.
-->

**Language/Version**: TypeScript (strict, ESM, no build step) on Node ≥ 22

**Primary Dependencies**: Hono + `@hono/zod-openapi` (API), Drizzle (DB), pg-boss (worker), React + Vite + TanStack Router/Query (web) [+ anything new, justified in research.md]

**Storage**: PostgreSQL 17 (pg_trgm, pgvector) [new tables/columns → data-model.md]

**Testing**: Vitest (unit, integration with Testcontainers, search eval), Playwright `@smoke` / `@full`

**E2E tier**: [smoke | full | none] — [reason, per constitution V: smoke = critical journey, blocks core use, or crosses a deployment boundary; full = secondary/variant/async/cross-browser; none = no new UI or flow]

**Target Platform**: Docker Compose on Dokploy; PWA on Android Chrome (iOS where stated)

**Project Type**: pnpm monorepo — API + worker, PWA, shared packages

**Performance Goals**: [domain-specific or N/A]

**Constraints**: card body ≤ 600 code points / payload ≤ 8192 bytes; web initial bundle ≤ 150 KB gzip; AI keys optional; same origin [+ feature-specific]

**Scale/Scope**: [e.g., family/community decks, hundreds to low thousands of cards per deck]

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | How this plan complies (or "N/A") |
|-----------|-----------------------------------|
| I. Layered API | [routes parse, services rule, repos SQL; access via authorize()/can()] |
| II. One source of truth for contracts | [schemas in @gobbit/shared; `pnpm api:openapi`] |
| III. Invariants live in the database | [migration + down file; CHECK/trigger for new invariants] |
| IV. Private by default | [visibility filters on every read; tokens scoped; safe-fetch] |
| V. Tests at the right tier | [tiers used; e2e tier (smoke/full/none) and why; traceability table below] |
| VI. Lean, offline-first web | [bundle impact; query cache; subpath imports] |
| VII. Simple, optional, deployable | [new deps justified; works without AI keys; deploy impact] |
| VIII. Accountable by default | [every decision has an event or audit row in the Accountability table; ids/hashes only; limits env-tunable] |

## Decisions this plan pins down

<!--
  Continue the project-wide D numbering (find the highest D-number in docs/ and
  specs/*/research.md). Full reasoning lives in research.md; list the outcome here. Mark decisions
  that should become an ADR.
-->

| ID | Decision | ADR? |
|----|----------|------|
| D[NNN] | [decision] | [yes → ADR-0NN / no] |

## Project Structure

### Documentation (this feature)

```text
specs/[###-feature]/
├── spec.md              # /speckit-specify (+ /speckit-clarify)
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
├── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
└── implementation-notes.md  # Decisions and deviations logged during /speckit-implement
```

### Source Code (repository root)

<!--
  Keep only the paths this feature touches and name the real files to add or change.
-->

```text
apps/api/src/
├── routes/              # parse + OpenAPI route definitions
├── services/            # business rules, access checks
├── repositories/        # Drizzle SQL
├── jobs/                # pg-boss handlers (worker.ts)
└── <feature>/           # feature folders (ingest/, review/, share/, …)
apps/api/test/           # *.int.test.ts (Testcontainers)

apps/web/src/
├── routes/              # TanStack Router file routes (d.$slug.*.tsx)
├── <feature>/           # feature folders (cards/, items/, search/, review/, …)
└── ui/ lib/ api/

packages/shared/src/     # Zod DTOs, limits (export via subpaths for the web)
packages/db/
├── src/schema/          # Drizzle tables
└── migrations/          # generated SQL + down/ (hand-written)

e2e/tests/smoke/         # Playwright @smoke journeys (every PR + post-deploy)
e2e/tests/full/          # Playwright @full specs (nightly)
```

**Structure Decision**: [Which packages change and why]

## Invariant → test traceability

| Invariant / rule (spec FR or D-number) | Enforced in (DB / service / route / UI) | Test (file, tier) |
|----------------------------------------|------------------------------------------|-------------------|
| [e.g., FR-003 reader cannot edit] | [service `can()`] | [`items.int.test.ts`, int] |

## Accountability

<!--
  Constitution VIII, ADR-060, convention in docs/design/api-conventions.md#decision-events.
  One row per decision the feature makes about a person, their content or their experience,
  including silent ones (no-enumeration answers, honeypot drops, refusals, fallbacks).
  "None" only with the reason.
-->

| Decision | Event / audit row | Outcomes · reasons | Fields (ids/hashes only) | Level | Watched (instance / aggregate / rate) | Alert threshold (default) | Test |
|----------|-------------------|--------------------|--------------------------|-------|---------------------------------------|---------------------------|------|
| [e.g., waitlist join] | [`waitlist.join` log] | [accepted, refused · per_ip, per_email] | [requestId, entryId, emailHash] | [info] | [aggregate by reason; refusal rate] | [refused > 50/h] | [`waitlist.service.test.ts`, unit] |

**Operator controls**: [env vars that tune limits or thresholds, defaults in `@gobbit/shared`, runbook entry]

## Rollout

- **Migrations**: [name, reversible? data backfill?]
- **Env / config**: [new vars → README env tables, Compose `x-api-env`]
- **API client**: [`pnpm api:openapi` needed? yes/no]
- **Deploy order / flags**: [anything beyond the normal CI → Dokploy flow]

## Risks

| Risk | Likelihood / impact | Mitigation |
|------|---------------------|------------|
| [risk] | [L/M/H] | [mitigation] |

## Settle before starting

<!-- Open questions or prerequisites outside the repo (accounts, keys, DNS, design calls). -->

- [ ] [item]

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| [e.g., SQL in a service] | [current need] | [why a repository method is insufficient] |
