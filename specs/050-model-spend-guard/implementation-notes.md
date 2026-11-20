# 050 implementation notes

## Decisions the plan did not make

- T013: a share that builds no best-effort card fails with the explicit message `best_effort_empty` and code `unknown`. `unknown` is retryable, so the sharer's retry runs again and fails the same way (nothing changes the input); accepted rather than adding a non-retryable code.
- T013: the stored `extraction.categoryIds` of a best-effort card is the default category id (as for direct file proposals), because `proposeItem` records the category it filed the card in.

## Deviations from the plan

- T022: the "saved as you sent it" line renders only inside `ShareRow`'s `card()` block, so a `not_added` share (no item) shows no line, although `savedAsSentLine` itself allows that state. Screenshots (phone/desktop, light/dark) were not produced; T022 stays unticked until someone supplies them.
- Docker was unavailable while implementing (no `docker` group access): the int and e2e tests T002, T006, T011, T015 (suites), T019, T024 and T027 are written but unrun.
