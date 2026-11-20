# Implementation notes — 049 import v2

- T010: ADR-081 was already taken by 047 (self-contained e2e); this feature reserves ADR-082. Spec, plan and tasks updated.
- T003: `importDraftSchema.type` kept `text|link` (media excluded) to avoid OpenAPI drift; `toImportDraft` maps a media row to text. T005 widens it and regenerates the api-client.
- T011: 021 treated every heading level as a category; in v2 any `##` outside a fence switches the file to card-per-section. `legacy-h2-group.md` documents the change (2 categories+items in 021 → 2 cards in v2). Only files with no `##` keep the 021 path.
- Env: Docker is unavailable in the implementing session (permission denied on the socket), so every `[int]` and `[e2e:full]` task is written and typechecked but NOT run; they are left unchecked in tasks.md and need a run in CI or locally. T015 is the first.
- T016: one test in parse-sections.test.ts ("keeps an RTL body line after the fields as body") needs field parsing and passes only after T024.
- T017: existing 021 fixture street-notes.md line 7 changed from `## Recycling` to `# Recycling` (its `##` now switches to card-per-section, the intended 021 change).
- T019: code + unit tests done; screenshots NOT taken (no Docker/Postgres in the implementing session) so T019 stays unchecked. Needs phone 412 + desktop 1280, light + dark, vs the existing import preview (new: ignored-text banner in ImportPreview, help line in ImportInput, bodyExcerpt in ImportPreviewRow).
