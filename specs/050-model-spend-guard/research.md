# Research: Model spend guard (050)

Decisions continue the project-wide D series (next free: D452). Nothing in the spec was left as NEEDS CLARIFICATION; this records how each part is built and what was rejected.

## D452 — The switch is a boolean on `users`

- **Decision**: `users.smart_share boolean NOT NULL DEFAULT false`. Changed by an operator with SQL only. Platform admins count as on in code through `createPlatformAdmins.is` (the worker already has `env.PLATFORM_ADMINS`).
- **Rationale**: the setting belongs to the person and holds on every deck (FR-001). A column is the simplest thing an operator can flip by hand, and it is read with the user row the worker already loads for the role check. Admins are an env allow-list a migration cannot read (spec Assumptions), so code, not data, makes them on; an admin removed from the list also loses it, which is the right way round.
- **Alternatives**: a `user_features` table or a `plan` column (spec: no plans table, one on/off); a migration that sets admins on (cannot read the env list); an env allow-list of smart-share emails (changing it needs a deploy, and FR-002 says the database).

## D453 — Where the gate sits

- **Decision**: in `jobs/ingest.ts`, right after the role check and the file branch: `if (!(await deps.smartShare(job.userId)))` → `proposeBestEffort`. `smartShare` is bound in `worker.ts` and is a **required** dependency of the handler, so no caller can forget the guard.
- **Rationale**: the handler is the only place that calls `runExtraction` for share channels (`import` and `mcp` jobs are direct proposals through `ingest.service`, never the handler's model path). Reading the setting here satisfies FR-012 (retries and retried shares follow the setting at the time they run) and leaves the model path as it is today (FR-009, SC-004). Files stay first because D395 already needs no model.
- **Alternatives**: decide in `ingest.service.submit` (reads the setting at send time, breaking FR-012, and cannot cover retry); put the check inside `runExtraction` (one more place that must know about channels and fallbacks); a worker-wide kill switch env var (a different feature; per person is the requirement).

## D454 — Best effort reuses `validateProposal`

- **Decision**: the builder returns `{ input: ProposeCardInput, ctx: ValidateContext, kind, cut, unusedPhotos }` or `null`. The handler runs `validateProposal(input, ctx)` and `proposeItem` as for an extracted answer. Context: `categoryIds: []`, no `event`, `sourceUrl`/`linkPreview`/locked host only for the link kind, `imagePublicId`/`morePublicIds` only for the media kind.
- **Rationale**: it already builds the three payloads wanted (link with preview, media gallery with the first photo's alt, text), applies the card limits, strips style directives, and keeps the locked-site rules (D347/D348) including the honest text for walled pages. FR-007 is then true by construction. The D355 preview fallback is the precedent (`previewFallback` builds a `propose_card` input and calls `validateProposal`).
- **Alternatives**: build `ItemCreate` objects by hand like `buildMediaProposal` (re-implements preview, locked hosts and payloads; the file path can do it because files have no preview or wall); extend `previewFallback` (it needs preview details and a URL, and is about a failed answer, not a skipped one). Same pattern, different trigger and kinds, so a separate small module.
- **Cut detection**: `validateProposal` shortens a body with `truncateAtSentence`. The builder compares the intended body length with `CARD_BODY_MAX` itself to set `cut`, so the validator stays untouched.

## D455 — Which card each share becomes

Spec FR-005 and its edge cases, as rules the builder applies in order:

1. A file never reaches the builder (handled before the gate).
2. **Email channel**: photo attachments → media. Else a URL with nothing else in the body (the text with the URL removed is empty; this includes an empty body with the URL only in the subject, which `mapInboundEmail` also reports as the share's URL) → link. Anything else → text, and the URL stays plain text, so the context carries no `sourceUrl`.
3. **App, paste, Shortcut**: a URL → link (photos unused, count recorded). Else photos → media. Else text → text.
4. Nothing usable (no URL, no photos, no text), or the validator refuses → no card; the handler calls the existing `fail()` with the fixed error `best_effort_empty`, which `classifyFailure` maps to the existing `unknown` reason ("couldn't be saved"). The event still records the skip.

Only the link kind runs `normalize` (the page fetch through `safe-fetch`): photos and text need nothing from a page. The fetch is not model spend and the share caps already bound it.

Titles and bodies follow the FR-005 table. Link: title is the page title, else the share title, else the site name (host without `www.`, as `previewFallback` does); body is the sender's text with the address removed, else the page description, else none. For a link email the page title wins over the subject. Media and text: share title (an email's subject), else the first line of the text, else (media only) "Shared image"; the body is the rest. Titles and bodies over the limit are cut by the validator.

## D456 — The marker

- **Decision**: `extractionFallbacks = ['preview', 'no_smart_share']`; `ExtractionSummary.bodyCut?: boolean`. Summary: `model: 'direct'` (`DIRECT_PROPOSAL_MODEL`), `escalated: false`, `confidence: 0`, `categoryIds: []`, `newCategory: null`, `fallback: 'no_smart_share'`; `type` and `language` as the validator and page give them.
- **Rationale**: the field already travels to the review queue (`extractionFallback`, D355) and is stored in jsonb, so no column. `model: 'direct'` is how a no-model proposal is already labelled (D395).
- **Surfaces**: reviewers: `fallbackLine` gets one more case, plus `ReviewEntry.job.extractionBodyCut`. Sharer: `ShareSummary.savedAsSent` (boolean).
- **Alternatives**: a boolean column on `ingest_jobs` (a migration for something the jsonb already holds); deriving the notice from `model === 'direct'` (also true for files, which must not show it, FR-008).

## D457 — The decision event

- **Decision**: `ingest.extraction_skipped`, outcome `proposed | failed`, reason `smart_share_off`, with `kind`, `cut`, `unusedPhotos`, `channel` and ids. Emitted once per processed share, through `decisionLogger` correlated by job id; info, and warn for `failed`.
- **Rationale**: constitution VIII and the spec's Accountability table: one event, no content. A successful best effort ends the job, and the empty-share failure is final, so each share has exactly one (SC-003); a crash before the proposal is written lets pg-boss retry, and the retry emits the event once the outcome is known (the event is written after the outcome, not before).
- **Alternatives**: log inside the builder (it is pure); one event per fact (skip, cut, photos) — more lines for one decision.

## D458 — Runbook and rollout

- **Decision**: the operator's step is `UPDATE users SET smart_share = true WHERE email = '…';`, documented in `docs/design/ingestion.md` with a check query. The `CHANGELOG.md` entry is **Action required**: the deploy turns smart share off for everyone but platform admins.
- **Alternatives**: backfill the curators in the migration (the migration cannot know who they are; spec says by hand).

## Pruned from the first draft (constitution IX)

- A `smart_share_events` audit table: the change is made in the database by an operator, outside the app (FR-002); the app would write nothing to it.
- A field on `/me` exposing the setting: the web needs only the per-share `savedAsSent`; no screen reads the person's setting.
- A model-free event builder from structured page data: out of scope (spec).
- Calling `autoPublish` for best-effort proposals: it would hold them anyway (no category); not calling it is shorter and makes FR-006 unconditional.
- A separate job type or queue for best effort: same job, one more branch.
