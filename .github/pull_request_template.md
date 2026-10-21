## What and why

<!-- The change and the reason for it. Link the spec (specs/NNN-…) or issue. -->

## Tests

- **E2E tier**: smoke / full / none (pick one) — <!-- reason, per constitution V and ADR-053 -->
  - **smoke**: a critical journey (sign-in, reading a deck, creating or editing a card, photo upload, search, share/ingest submit, review publish), a regression would block core use, or it crosses a deployment boundary (proxy, CSP, env/secret, a third-party call)
  - **full**: secondary path, role variant, extra negative, async or costly third-party work, cross-browser or offline
  - **none**: pure logic with no new UI or flow (unit/integration tests only)
- [ ] Unit / integration tests for new logic
- [ ] Bug fix only: a regression test at the tier and in the environment that would have caught it

## Docs

- [ ] `docs/architecture.md` and `README.md` reflect the change (Deviations list if the code departs from the plan)
