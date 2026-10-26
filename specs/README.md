# Specs

Feature specifications, plans and task lists, written with [spec-kit](https://github.com/github/spec-kit)
(pinned to 1.2.2, see `.specify/init-options.json`). The rules every spec must satisfy are in
[`.specify/memory/constitution.md`](../.specify/memory/constitution.md); the roadmap is [`PLAN.md`](../PLAN.md).

## Layout

```text
specs/NNN-short-name/
├── spec.md                  # what and why (/speckit-specify, /speckit-clarify)
├── plan.md                  # how (/speckit-plan), plus research.md, data-model.md, contracts/, quickstart.md
├── tasks.md                 # ordered tasks (/speckit-tasks), checked off by /speckit-implement
├── checklists/              # optional (/speckit-checklist)
└── implementation-notes.md  # decisions the plan didn't make and deviations, logged while implementing
```

## Conventions

- **Numbering**: sequential, three digits. Phases 0–5 predate spec-kit and are recorded in
  [`005-phases-0-5`](./005-phases-0-5/README.md), so the first spec-kit feature is `006`. Numbers no
  longer track phases: a phase can take several features (e.g. Phase 6 → `006-…`, `007-…`).
- **Scope**: one bounded, shippable change per feature, usually one PR. Name the roadmap phase in
  the plan header.
- **Branches**: spec-kit's git extension is not installed; branch as usual (`feat/006-…` or a
  worktree). The active feature is tracked in `.specify/feature.json` (local only).
- **Decision IDs**: decisions in `research.md` continue the project-wide `D` numbering used in
  `docs/`: take the next free number across `docs/` and
  `specs/*/research.md` (Phase 6 reserves D129–D147; `010-e2e-journeys` uses D148–D155; Phase 7 reserves D156–D173; Phase 8 reserves D174–D191; `022-share-status` uses D192–D199; the Usability pass uses D200–D204 for `022-editor-navigation`, D205–D209 for `023-editor-inputs` and D210–D216 for `024-card-actions`). Decisions that outlive the feature become
  the next ADR in `docs/adr.md` (ADR-049 records the spec-kit adoption itself).
- **Ageing**: a feature folder is a working contract until its PR merges, then a historical record.
  Later changes get a new feature, not edits to a merged spec. Durable truth lives in
  `docs/architecture.md` (compact map), `docs/design/`, `docs/adr.md`, `README.md` and the constitution.
- **E2E tier**: every plan records "E2E tier: smoke | full | none — reason" (constitution V,
  ADR-053) and tags e2e tasks `[e2e:smoke]` or `[e2e:full]`.
- **Public**: this repository is public. Write specs for outside readers: no personal data, private
  notes, costs or credentials (ADR-023, ADR-049).

## Workflow

| Step | Command | Output |
|------|---------|--------|
| 1 | `/speckit-specify <outcome>` | `specs/NNN-name/spec.md` |
| 2 | `/speckit-clarify` | open questions resolved in `spec.md` |
| 3 | `/speckit-plan` | `plan.md`, `research.md`, `data-model.md`, `contracts/`, `quickstart.md` |
| 4 | `/speckit-tasks` | `tasks.md` |
| 5 | `/speckit-analyze` | consistency report (read-only) |
| 6 | `/speckit-implement` | code, tests, `implementation-notes.md` |
| 7 | `/speckit-converge` | remaining work appended to `tasks.md`; repeat 6–7 until Converged |

Small fixes with no new behaviour can skip the workflow.
