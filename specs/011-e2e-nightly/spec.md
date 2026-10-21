# Feature Specification: Nightly full e2e suite

**Feature Branch**: `011-e2e-nightly`

**Created**: 2026-10-21

**Status**: Draft (shallow; detail is added at `/speckit-clarify` and `/speckit-plan` once 010 is merged)

**Input**: User description: "A bigger, but still shallow, nightly full suite next to the smoke journeys."

Depends on [`010-e2e-journeys`](../010-e2e-journeys/spec.md): the Compose stack, the fixtures (`signIn`, `persona`, `photoHost`), the fakes container and the `@smoke`/`@full` tags. The tier rule is constitution V (v1.1.0) and ADR-053.

## Why

Smoke covers the few journeys that block core use, and it has to stay under 5 minutes. Everything else that needs a browser or a running stack is not run at all today, or only ad hoc:
- role variants;
- every card type and its limits;
- the ingestion channels;
- share previews;
- offline and drafts;
- other browsers;
- accessibility.

These are exactly the areas that 007's and 009's deviations list as "not covered end to end".

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A nightly run covers the rest of the product (Priority: P1)

Every night a workflow starts the Compose stack from `main` and runs `@smoke` and `@full`. Third parties are real, using dedicated test keys and a test Cloudinary folder. The maintainer sees a green or red run in the morning.

**Independent Test**: Break restricted-category visibility for readers in the web app. The nightly role-matrix spec fails, while PR smoke stays green.

**Acceptance Scenarios**:

1. **Given** the schedule, **When** 02:00 UTC passes, **Then** `nightly.yml` builds `main`, starts Compose with real providers and runs every `@smoke` and `@full` test within 30 minutes of test time.
2. **Given** a manual dispatch with a ref, **When** it runs, **Then** it tests that ref the same way (useful before merging a risky PR).

---

### User Story 2 - Failures are visible and actionable (Priority: P1)

A failing night opens a GitHub issue labelled `nightly-e2e`, or comments on the open one. The issue names the failing specs and links the report. Artifacts (Playwright report, traces, JSON logs of every Compose service) are kept for 14 days. A green night closes the open issue.

**Independent Test**: Force a failure. One issue appears. A second failing night adds a comment instead of a second issue. A green night closes it.

---

### User Story 3 - Shallow breadth, one spec per area (Priority: P2)

Each area in the catalogue (plan F1–F14) has one spec: its happy path plus one or two negatives. Depth stays in unit and integration tests. A new area is added only by the tier rule ("full if …").

---

### User Story 4 - More than one browser (Priority: P2)

The smoke journeys also run nightly in WebKit (iPhone 15 profile) and desktop Chromium. The PR gate keeps one browser.

### Edge Cases

- **A third party is down at night**: the run fails with the provider's message in the logs, and the issue says "provider" rather than "regression" when every failing step is a third-party call.
- **Spend**: real LLM calls are capped by a key-level limit on the test key. With no `E2E_OPENROUTER_API_KEY` secret, AI specs skip with a reason; they don't fail.
- **Test Cloudinary assets**: uploads go to the `e2e/` folder of a test cloud, deleted at teardown and swept weekly by prefix.
- **Quarantined tests**: they run in a non-gating project so their history stays visible (D155).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: `nightly.yml` MUST run on a daily cron and on manual dispatch with a ref input.
- **FR-002**: It MUST run `@smoke` and `@full` against a Compose stack from the ref, with real providers configured by `E2E_*` secrets, and test time MUST stay ≤ 30 minutes.
- **FR-003**: Failures MUST open or update a single labelled issue. A pass MUST close it.
- **FR-004**: Artifacts (report, traces, Compose logs) MUST be kept 14 days.
- **FR-005**: Every catalogue area MUST have at least one `@full` spec with a happy path and at least one negative path.
- **FR-006**: Nightly MUST NOT use production credentials or the production database.

### Key Entities

- **Area**: one catalogue row (F1…) mapped to one spec file in `e2e/tests/full/`.
- **Nightly issue**: the single open `nightly-e2e` issue that tracks the current failure streak.

## Success Criteria *(mandatory)*

- **SC-001**: Every area F1–F14 has a passing `@full` spec within the feature's PR series.
- **SC-002**: 14 consecutive nights pass, with at most one flaky test (failed, then passed on retry).
- **SC-003**: Every "not covered end to end" item in the 007–009 deviations is covered, or explicitly left to unit and integration tests with a reason.

## Assumptions

- A Cloudinary test cloud and an OpenRouter test key with a spend limit can be provided as repository secrets.
- Nightly time on GitHub-hosted runners is acceptable for a public repository.
