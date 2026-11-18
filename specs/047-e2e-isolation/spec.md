# Feature Specification: Self-contained e2e (own stack, own users, no environment, no tokens)

**Feature Branch**: `047-e2e-isolation`

**Created**: 2026-11-18

**Status**: Draft

**Input**: User description: "for 047" — the goal and hard requirements in [handoff.md](./handoff.md): an e2e run brings up its own stack with an empty database, every test gets its own users and data created through the product, and nothing in e2e reads the environment or uses a pre-made credential.

**E2E tier**: none — this is test infrastructure. It changes how the `@smoke` and `@full` tiers run (constitution V) but adds no product behaviour.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - One command runs e2e on a throwaway stack (Priority: P1)

A developer (or CI) runs a single command. A fresh stack with an empty database is created for that run, the suite runs against it, and the whole stack and its data are destroyed afterwards, whether the run passed, failed or was interrupted. Nothing has to be started, seeded, exported or cleaned up by hand, and nothing already running on the machine is used or touched.

**Why this priority**: Every other story depends on a stack the run owns. It also removes today's local accumulation of state and the CI-only setup steps.

**Independent Test**: On a machine with only the container runtime installed and no stack running, run the e2e command; the suite completes, and afterwards no containers, volumes or networks from the run remain. Run it twice in parallel; both succeed without interfering.

**Acceptance Scenarios**:

1. **Given** no stack is running and no e2e variable is set, **When** the e2e command is run, **Then** a new stack starts, becomes healthy, the suite runs, and the stack and its data are removed.
2. **Given** the run fails midway or is interrupted (Ctrl-C), **When** it ends, **Then** the stack, volume and network are still removed.
3. **Given** a developer's normal local stack is running with data, **When** the e2e command is run, **Then** that stack and its data are neither used nor modified.
4. **Given** two e2e runs started at the same time on one machine, **When** both run, **Then** each has its own stack and neither affects the other.
5. **Given** the CI e2e jobs, **When** they run, **Then** they invoke the same command with no step that seeds data, exports a token or sets an e2e variable.

---

### User Story 2 - Every test creates its own signed-in user (Priority: P1)

A test author asks for a user and gets one: a fresh account created through the real sign-in flow (a sign-in link sent by email, read from a mailbox the tests can see, then followed). Each test therefore has its own user, personal deck and rate-limit budget, and cannot depend on, collide with or exhaust state left by another test or by tests running in parallel.

**Why this priority**: The shared single owner is the root cause of the collisions and rate-limit failures seen in 046; the real sign-in path is also what smoke exists to cover.

**Independent Test**: Run two tests in parallel that each change their user's profile many times; neither sees the other's changes and neither hits a rate limit that the other caused.

**Acceptance Scenarios**:

1. **Given** an empty database, **When** a test requests a user, **Then** an unknown address is registered through the product's own sign-in flow and the test is signed in with a personal deck.
2. **Given** many tests running in parallel, **When** each changes its own name, username, avatar or favourites, **Then** no test observes another's changes.
3. **Given** a test that saves its profile dozens of times, **When** it runs, **Then** it stays within the normal per-user limits with no raised limit configured for e2e.
4. **Given** the suite has finished, **When** the stack is destroyed, **Then** no test needs to delete its own users; deck cleanup by tests is optional, not required for correctness.

---

### User Story 3 - Multi-member journeys are written like any other test (Priority: P1)

A test author asks for "a member with role X" of the test's deck and receives a fresh user who was invited by email with that role, accepted the invite, and is signed in in their own browser context. An owner plus two members is three lines in a test. The multi-member specs that today skip silently for lack of provisioned tokens run and assert.

**Why this priority**: Invite, shared-deck and two-members'-avatars journeys are the reason for the work; a skipped test is not coverage.

**Independent Test**: A test creates an owner and two members of different roles on one deck and asserts each sees what their role allows; it runs with no skip and no extra configuration.

**Acceptance Scenarios**:

1. **Given** a signed-in owner with a deck, **When** the test asks for a member with a role, **Then** a new user is invited, accepts, and is signed in with exactly that role.
2. **Given** a spec that previously skipped when member credentials were missing, **When** the suite runs, **Then** it runs and asserts, and the suite reports zero skipped tests caused by missing provisioning.

---

### User Story 4 - E2E reads no environment and uses no stored credential (Priority: P1)

A reviewer can confirm by inspection that nothing under `e2e/` reads the process environment and that no test authenticates with a pre-made token or seeded session. Configuration (addresses, timeouts, retries, workers, the dummy third-party secret shared with the stack) lives in checked-in code; anything the tests need to know about the running stack is handed over by the harness that started it.

**Why this priority**: It is the owner's stated hard requirement and the criterion that makes the suite reproducible on any machine.

**Independent Test**: Search `e2e/` for environment reads and for the removed credential names: none remain. Run the suite in a shell with an empty environment (apart from what the container tooling itself needs): it passes.

**Acceptance Scenarios**:

1. **Given** the finished feature, **When** `e2e/` is searched for environment access, **Then** there are none.
2. **Given** the finished feature, **When** workflows, compose overlays and docs are searched, **Then** the pre-made-token and e2e-only variable names and the e2e-only rate-limit override no longer exist.
3. **Given** the dummy third-party secret used to sign fake upload answers, **When** the stack and the tests need it, **Then** both take the same constant from checked-in code.

---

### User Story 5 - After a deploy, a no-identity check proves the right version is live (Priority: P2)

After each deploy, a small separate check, given one address on the command line, confirms the instance is healthy, reports the expected commit, serves its public landing page, and refuses anonymous access to private data. It creates no users and writes no data, and it is not part of the e2e suite. Real journeys are proven on the disposable stack before deploy.

**Why this priority**: Replacing the authenticated post-deploy smoke keeps a deploy safety net without breaking the "no environment, no tokens" rule. It depends on the owner confirming the decision (see Assumptions).

**Independent Test**: Run the check against a running stack with the right commit: it passes; against one reporting a different commit or an unhealthy one: it fails with a clear reason.

**Acceptance Scenarios**:

1. **Given** a healthy instance at the expected commit, **When** the check runs with its address, **Then** it passes and reports each check.
2. **Given** an instance that is down or reports another commit, **When** the check runs, **Then** it fails and names the failing check.
3. **Given** any run of the check, **When** it ends, **Then** no account, session or content was created.

---

### User Story 6 - Existing suites are converted and the old scaffolding is removed (Priority: P2)

The existing smoke and full specs, starting with the 046 profile specs, run on the new setup. The old environment module, the seeded smoke session in workflows, the e2e-only variables, the silent skips and the profile rate-limit override are deleted. The standing documentation and constitution describe the new rule.

**Why this priority**: Without conversion the old and new worlds coexist; it follows the foundation stories and is done in an order that keeps `main` green.

**Independent Test**: The full and smoke suites pass on the new setup with no skipped tests for provisioning reasons, in no more than the existing smoke time budget.

**Acceptance Scenarios**:

1. **Given** the converted suites, **When** the smoke tier runs, **Then** it passes within its existing time budget.
2. **Given** the converted suites, **When** the full tier runs, **Then** it passes, with fewer retries needed than before for shared-state causes.
3. **Given** the finished feature, **When** the docs and constitution are read, **Then** "e2e is self-contained: no environment, no tokens" is stated where the testing rules live.

---

### Edge Cases

- A run is killed hard (power loss, CI cancel): leftover stacks from a previous run must not block the next run, and must be removable by the next run or one documented command.
- Docker image pulls fail transiently: the run fails clearly before any test, rather than hanging or running against a half-started stack.
- Two tests ask for users with the same address: each test's addresses are unique per test, so none collide.
- The sign-in mailbox receives mail for many users at once: each test only ever reads its own messages.
- Rate limits on sign-in and invites: the stack has enough headroom for the suite's volume without any limit being disabled for a specific feature, and a test that exercises a limit does so with its own user.
- A test that needs a second browser context for another member must not share cookies or storage with the first.
- A machine without a container runtime: the command fails immediately with a message naming the missing prerequisite.
- The post-deploy check pointed at production must never create users or data.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: A single command MUST create a uniquely named stack with an empty database, run the e2e suite against it, and remove the stack, its data and its network afterwards, including on failure and interruption.
- **FR-002**: The stack MUST be created by the run itself, locally and in CI, with no manual step and no reliance on anything already running; it MUST NOT use or modify any other stack on the machine.
- **FR-003**: Concurrent e2e runs on one machine MUST NOT interfere with each other.
- **FR-004**: The database used by e2e MUST be a real, disposable database of the same kind as production (no mock or in-memory substitute), so database-level invariants are exercised.
- **FR-005**: Nothing under `e2e/` (specs, fixtures, configuration, setup) MAY read the process environment.
- **FR-006**: Configuration e2e needs MUST live in checked-in code in one place; values about the running stack MUST come from the harness that started it.
- **FR-007**: No e2e test MAY authenticate with a pre-made token, seeded session or stored credential; every identity MUST be created inside the test through the product's sign-in and invite flows.
- **FR-008**: A fixture MUST provide a fresh signed-in user per test, registered through the real sign-in flow using a mailbox the tests can read, with an address unique to that test.
- **FR-009**: A fixture MUST provide, for a given deck and role, a fresh member who was invited by email, accepted the invite, and is signed in in an isolated browser context.
- **FR-010**: Tests MUST read only the messages addressed to their own users.
- **FR-011**: The e2e stack MUST NOT run the development seed; each test creates its own owner and data.
- **FR-012**: The stack's configuration for e2e (open registration, a readable mailbox, sign-in and invite limits with headroom) MUST be checked in, and MUST NOT require raising any per-feature limit solely for e2e.
- **FR-013**: The dummy secret that the stack and the tests share for faked third-party uploads MUST be one constant in checked-in code imported by both sides, not a variable.
- **FR-014**: Retries, parallelism and reporting MUST be set by explicit configuration or command-line flags from the stack runner, not from environment variables.
- **FR-015**: Specs that previously skipped because member credentials were not provisioned MUST run and assert; the suite MUST report no skips for provisioning reasons.
- **FR-016**: Existing `@smoke` and `@full` specs MUST be converted to the per-test-user model; the `@smoke` tier MUST stay within its existing time budget and keep "nothing inside Gobbit faked; only third-party hosts replaced at the network edge".
- **FR-017**: A separate post-deploy check MUST, given one address as a command-line argument, verify health, the deployed commit, the public landing page and anonymous refusal of private data, create no users or data, and fail with the name of the failing check.
- **FR-018**: The old environment module, the e2e and smoke variables (member tokens, smoke session, invitee username, base address, expected commit, secret), the seeded smoke session in workflows and the e2e-only profile rate-limit override MUST be removed once nothing uses them.
- **FR-019**: Documentation (`docs/design/testing.md`, `infra/README.md`, `README.md`) and the constitution's e2e principle MUST describe the self-contained rule, with a versioned constitution amendment if the owner confirms it.
- **FR-020**: Migration MUST proceed in an order that keeps `main` green at each merge: runner and mailbox, then the member fixture, then the 046 profile specs, then the remaining specs, then removal of the old scaffolding.

### Key Entities

- **E2E run**: one invocation of the command; owns one stack from creation to removal.
- **Stack**: the app, worker, web front, database and test mailbox created for a run; unique name, volume and network.
- **Test user**: an account created inside one test through real sign-in; unique address; owns its personal deck and rate-limit budget.
- **Test member**: a test user invited to a specific deck with a role and signed in in its own browser context.
- **Test mailbox**: a place the stack's outgoing email lands so tests can read sign-in and invite links.
- **Post-deploy check**: a no-identity script outside the e2e suite, taking one address.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: From a clean machine with only the container runtime, one command runs the whole suite; afterwards zero containers, volumes or networks from the run remain (checked after a passing, a failing and an interrupted run).
- **SC-002**: A search of `e2e/` finds zero environment reads and zero references to the removed credential and variable names.
- **SC-003**: Zero tests are skipped for provisioning reasons (down from 10 in the last full run).
- **SC-004**: Zero rate-limit failures in the full suite, with no e2e-only limit overrides present.
- **SC-005**: Running the full suite with parallelism increased shows no failure attributable to shared user state across 3 consecutive runs.
- **SC-006**: The smoke tier completes within its existing 5-minute budget on the new setup.
- **SC-007**: CI e2e jobs contain no step that seeds data, exports a token or sets an e2e variable.
- **SC-008**: The post-deploy check completes in under 30 seconds and leaves no accounts or content behind.

## Assumptions

- **Post-deploy** (owner decision pending, confirm in `/speckit-clarify`): the authenticated smoke against the deployed instance is replaced by the no-identity check in User Story 5 (recommended in the handoff). The alternative, keeping one authenticated exception and amending the requirement, is out of scope unless the owner chooses it.
- **Mailbox** (technical choice, decided in `/speckit-plan`): any approach is acceptable if the product's real sign-in and invite emails are what the tests read and nothing inside Gobbit is faked; the plan weighs a test-readable mailer against a separate mailbox container.
- **Constitution**: the self-contained rule is added to constitution V as a versioned amendment, subject to owner confirmation.
- A container runtime is the only prerequisite for running e2e; the authoring sandbox has none, so verification of the stack happens in CI in small steps.
- Work starts after the 046 (member profile) branch is merged to `main`, and this branch is rebased first, because it converts the 046 profile specs.
- No faked or raised behaviour is introduced inside the product for e2e beyond stack configuration; third-party hosts (images, link previews, email delivery provider) remain replaced only at the network edge.
- This feature makes no decision about people, their content or experience; the plan's Accountability table is "None" for that reason.
- Per-test cleanup of decks is no longer required for correctness (the stack is discarded); tests may still clean up what they create.
- Specs are public: no personal data or secrets appear in specs, fixtures or docs; test addresses use a reserved test domain.
