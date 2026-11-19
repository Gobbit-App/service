# Implementation notes — 049 import v2

- T010: ADR-081 was already taken by 047 (self-contained e2e); this feature reserves ADR-082. Spec, plan and tasks updated.
- T003: `importDraftSchema.type` kept `text|link` (media excluded) to avoid OpenAPI drift; `toImportDraft` maps a media row to text. T005 widens it and regenerates the api-client.
