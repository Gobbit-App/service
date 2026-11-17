# Feature Specification: UI mockups approved before implementation

**Feature Branch**: `feat/048-ui-mockups` | **Created**: 2026-11-18 | **Status**: Draft

**Input**: An optional, maintainer-triggered step in the spec-kit flow that shows new UI as working mockups built from the app's real components, so the maintainer can approve or change how a feature looks and feels before tasks are written and code is implemented, merged and deployed. Covers: a UX sketch in the spec, real-component mockups on a development-only screen, an optional mockup command with an approval record that gates tasks and implementation, and a written record of the maintainer's UI taste that grows from each rejection. Preview deployments are out of scope.

## Context

This is a developer-workflow feature. It changes how features are planned and reviewed, not what Gobbit's members see. The "user" here is the **maintainer**, who decides what ships, together with the **agent**, which writes specs, mockups and code.

The UI system (D416, ADR-079, constitution X) already requires every new screen to copy an existing sibling and every UI task to finish with screenshots. Both checks happen once code exists. A feature can follow every rule and still not feel like Gobbit: wrong placement, wrong emphasis, too much on screen, a flow that doesn't match how the rest of the app behaves. The maintainer first sees it after merge or deploy, and the fix is rework. Text alone doesn't solve this: for UI-heavy features, a written description doesn't convey how a screen actually looks and feels.

## User Scenarios & Testing

### User Story 1 — See and approve the UI before tasks exist (P1)

For a UI-heavy feature, after the plan is written, the maintainer asks for mockups. The agent builds the new screens from the app's real components and styles, filled with made-up data, on a screen that exists only in development. Every state the spec names can be viewed: normal, empty, loading, error, offline, no permission, long content. Where the plan leaves a real design choice open, two or three variants appear side by side. The agent writes a mockup record in the feature folder listing the states, the variants, open questions and how to open each one. The maintainer opens the screens in a browser on their own machine, comments, and the agent revises. When it's right, the maintainer marks the record approved.

**Why this priority**: it is the point of the feature: the look and feel get settled while changing them is still cheap.

**Independent test**: on a feature with new UI, run the mockup step, open the development screen, see every listed state and variant rendered with the app's real look, request a change, see it revised, then approve; the record shows the approval and its date.

**Acceptance**:
1. The mockup step runs only when the maintainer invokes it. No other step runs it, and no other step suggests it is mandatory.
2. Mockups use the same components, tokens and styles as the shipped app, so what the maintainer approves is what the implementation looks like, not an approximation of it.
3. Mockups never call the API and never use real member data; all content is made up.
4. Every state named in the spec's UX sketch (Story 3) is reachable on the mockup screen, each by a direct link the record lists.
5. Variants of one decision are shown together on one screen so they can be compared directly.
6. The mockup screen is unavailable in production: it is absent from the production build and from the deployed app.
7. The record has a status: draft until the maintainer approves it. Only the maintainer sets "approved", with a date. The agent never sets it, and any later change to the mockups returns it to draft.
8. Each round of maintainer feedback and what changed in response is kept in the record, so the reasoning survives.
9. The mockup step works on a machine that cannot take browser screenshots: the record says screenshots were not captured and why, and review proceeds by opening the screen in a browser.

---

### User Story 2 — An approved mockup is what gets built (P1)

Once a feature has a mockup record, it stays bound to it. Tasks can't be generated and implementation can't start until the record is approved. Each UI task names the approved mockup it implements. The components built for the mockup become the real components, connected to real data. At close-out, the mockup screen for the feature is removed and the conformance check reports any visible difference from the approved mockup.

**Why this priority**: an approval with no effect on what gets built changes nothing.

**Independent test**: with a draft record, try to generate tasks: refused, naming the record and its status. Approve it: tasks are generated and each UI task points at the approved mockup. After implementation, the conformance check compares the built screens with the mockup and the mockup screen is gone.

**Acceptance**:
1. If a feature has a mockup record that is not approved, task generation and implementation stop and say why. If a feature has no mockup record, both behave exactly as today.
2. Each UI task in a feature with an approved mockup names the mockup screen and state it implements; its completion screenshots are compared against that approved state (and still against the sibling, as today).
3. Mockup components are reused by the implementation rather than rewritten. Where implementation has to depart from the approved mockup, the departure is recorded in the feature's implementation notes and shown to the maintainer before it ships.
4. The conformance step flags each screen that differs visibly from its approved mockup and each mockup screen still present at close-out.
5. If the plan changes after approval in a way that affects UI, the record returns to draft and the gate applies again.

---

### User Story 3 — Settle the experience in words first (P2)

When writing or clarifying a spec with UI, the maintainer and agent fill a short UX sketch: where the feature lives, how a member reaches it, the one primary action, and what each state shows (empty, loading, error, offline, no permission, long content). The sketch is the brief the mockups are built from; it doesn't replace them.

**Why this priority**: placement and flow problems are cheapest to fix as a sentence, and the sketch tells the mockup which states it must show. It is not enough alone, which is why mockups are P1.

**Independent test**: specify a UI feature; the spec has a UX sketch covering placement, entry point, primary action and each state; the clarify step asks about any missing state.

**Acceptance**:
1. The spec template offers the UX sketch section; specs with no UI omit it.
2. Clarification treats a missing state or an unclear entry point in the sketch as a gap worth asking about.
3. The sketch names the sibling screen the feature should feel like, consistent with the plan's UI reference line.

---

### User Story 4 — The app's taste, written down and growing (P2)

The UI system document gains a "UX sensibilities" section: the maintainer's rules about feel that the token and layout rules don't cover (for example: repeating items are separated by fill and spacing, not borders). It also lists a few "golden screens", existing screens that best show the app's feel. Every time the maintainer rejects a mockup for a reason that would apply to other features, the reason is added there as a rule. The mockup step reads this section before building anything.

**Why this priority**: without it, the same rejection repeats across features; with it, each rejection makes the next mockup closer.

**Independent test**: reject a mockup with a general reason; the rule appears in the UX sensibilities section with a reference to the feature that prompted it; the next feature's mockup step lists that section among the rules it applied.

**Acceptance**:
1. The section starts with the rules already agreed (seeded from existing guidance), and the golden-screen list names at least three existing screens with why each was chosen.
2. A rejection reason that is specific to one feature stays in that feature's record; a general one becomes a rule. The agent proposes which, and the maintainer decides.
3. Each rule is short, states what to do, and cites the feature that produced it.
4. The mockup step and the UI task checks treat these rules like the existing UI system rules.

### Edge Cases

- **Feature with no UI, or small UI changes**: no mockup step, no record, no gate, no change to today's flow.
- **Mockup run on a machine that can't take screenshots**: the record says so; approval relies on the maintainer viewing the screen. The agent does not claim to have checked the visuals itself.
- **Maintainer approves, then the plan changes UI scope**: record returns to draft (Story 2, acceptance 5).
- **Maintainer abandons the mockup** (decides the feature doesn't need one after all): deleting the record removes the gate; the mockup screen is deleted with it.
- **A state that can't be faked without the API** (e.g. a real upload in progress): the mockup shows a static representation of that state and the record marks it as static.
- **Several features with mockups in flight at once**: each feature's mockups are separate and can be opened and removed on their own.
- **Screenshots in a public repository**: only made-up data ever appears in them; where they would be large or numerous, they are kept out of the repository and the record says where they live.

## Requirements

### Functional Requirements

- **FR-001**: The workflow MUST offer a mockup step the maintainer invokes explicitly after the plan exists; it MUST NOT run automatically or be required for any feature.
- **FR-002**: The mockup step MUST build mockups from the web app's real components and styles, render them with made-up data and no API calls, and expose them on a screen available only in local development.
- **FR-003**: The production build and the deployed app MUST NOT contain mockup screens or their made-up data, and this MUST be checked automatically.
- **FR-004**: The mockup screen MUST let the maintainer view each state from the spec's UX sketch and each variant, each by a stable direct link.
- **FR-005**: The mockup step MUST write a mockup record in the feature folder: states, variants, open questions, links, screenshots or the reason there are none, feedback rounds, and a status of draft or approved (with date).
- **FR-006**: Only the maintainer MAY set a record to approved; any change to mockups or UI-affecting plan content MUST return it to draft.
- **FR-007**: When a feature has a mockup record that is not approved, task generation and implementation MUST refuse to proceed and state why; when there is no record, they MUST behave as today.
- **FR-008**: UI tasks of a feature with an approved mockup MUST name the mockup state they implement and be checked against it, in addition to the existing sibling check.
- **FR-009**: The conformance step MUST report visible differences between built screens and approved mockups, and any mockup screen left at close-out.
- **FR-010**: Screenshot capture MUST be optional: where it can run, it captures phone and desktop widths in light and dark next to the sibling; where it can't, it says so and the step still completes.
- **FR-011**: The spec template MUST include an optional UX sketch section (placement, entry point, primary action, states, sibling); clarification MUST treat gaps in it as questions.
- **FR-012**: The UI system document MUST gain a UX sensibilities section and golden-screen list; the mockup step MUST read them; general rejection reasons MUST be added there as rules with their source feature.
- **FR-013**: The rule changes MUST be made as a versioned amendment to constitution principle X and through the project's template overrides only, recorded as a new ADR with decision numbers reserved in the specs index.
- **FR-014**: Implementation MUST reuse the approved mockup's components; any departure MUST be recorded in the implementation notes and shown to the maintainer.

### Key Entities

- **Mockup record**: one per feature that opts in. Holds the states, variants, open questions, links to each, screenshots or the reason they're missing, feedback rounds and an approval status with date.
- **Mockup screen**: development-only screen per feature rendering its states and variants from real components with made-up data. Exists from the mockup step until the feature's close-out.
- **UX sketch**: optional spec section describing placement, entry point, primary action, states and sibling; the brief for the mockup.
- **UX sensibilities**: section of the UI system document holding taste rules (each citing its source feature) and golden screens.

## Success Criteria

### Measurable Outcomes

- **SC-001**: For features that used the mockup step, no post-merge change is needed to fix layout, placement or feel that the approved mockup already showed. Tracked per feature in its implementation notes.
- **SC-002**: The maintainer can open any mockup state within 1 minute of having the app running locally, from a link in the record.
- **SC-003**: Features without a mockup record go through the workflow with zero extra steps or prompts compared with today.
- **SC-004**: A mockup screen in the production output is detected before merge every time (automated check fails).
- **SC-005**: The mockup step completes on a machine without a screenshot-capable browser, with the missing screenshots stated in the record.
- **SC-006**: After the first three features use the mockup step, the UX sensibilities section holds at least one rule taken from a rejection, and later rejections cite fewer repeat reasons.

## Assumptions

- The maintainer decides per feature whether to run the mockup step. The plan may recommend it for UI-heavy features, but it never makes it required.
- Review happens by running the app locally and opening the mockup screen; the agent's machine may be different and may not be able to render or capture it.
- Screenshots, when captured, are small, compressed and from made-up data. They are committed in the feature folder only if they stay small; otherwise they live in the gitignored `plans/` area and the record points there.
- Feedback comes in the conversation or as comments in the record; the agent applies it and logs each round.
- The existing per-task screenshot rule (constitution X) stays as is; this feature adds the approved mockup as a second reference and does not remove the sibling comparison.
- The plan's "UI reference" line still names the sibling; the mockup shows how the feature applies it.
- Decision numbers D430–D439 are reserved for this feature; the durable decision becomes the next ADR.
- E2E tier: none. This changes developer tooling and documents, not member-facing behaviour. The production-exclusion check (FR-003) is a build-level test.
