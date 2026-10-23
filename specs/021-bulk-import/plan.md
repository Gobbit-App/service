# Implementation Plan: Bulk import of notes

**Branch**: `021-bulk-import` | **Date**: 2026-10-23 | **Spec**: [spec.md](./spec.md) | **Roadmap**: `PLAN.md` § Phase 8 (demo 6)

**Input**: Feature specification from `/specs/021-bulk-import/spec.md`

Project override of the core template. Written for outside readers: the repository is public.

## Summary

**Parse.** A pure, deterministic parser in `@pb/shared/import` turns text into `ImportRow`s: `parseNotes(text, format)` for plain lines, markdown and CSV. No LLM is involved (D189).

- The PWA Import screen (`/d/$slug/import`, lazy) parses on the device, shows a preview with tick/edit/invalid markers, and submits the ticked rows.
- The CLI (`pnpm import:notes <file> --deck <slug>`) uses the same parser.

**Propose.** `POST /decks/{id}/imports` `{ label, rows: DirectDraft[] (≤ 100) }` (D190):

- needs `item.publish` (owner, maintainer);
- calls `ingest.service.proposeDirect` per row with a new channel `import` and `clientLabel = label`;
- returns `{ imported, duplicates, failed[] }`.

Caps:

- The `import` channel has its own daily cap of 500 rows (`INGEST_CHANNEL_DAILY_CAPS.import`).
- `import` is excluded from the combined cross-channel cap, so one import can't lock its admin out of sharing.

A migration adds `import` to the `ingest_channel` enum.

**Publish.** `POST /decks/{id}/review/publish` `{ ids (≤ 50) }` publishes each `new`-verdict proposal as is, one transaction per item (D191):

- It skips `possible_duplicate`/`update` verdicts and items no longer proposed.
- It returns per-id results.
- The review queue gets select mode, "select all shown", and a source filter (`clientLabel`).
- Each publish writes 020's `published` event.

## Starting point

- `main @ a980598`. 020 merged (events), or this feature adds the events when 020 lands.
- Ingestion (Phase 5, P5.9):
  - `ingest.service.proposeDirect({ user, deck, channel, draft, clientLabel?, targetItemId? })` checks `item.create`, resolves categories (`newCategory` suggestion), checks caps (`assertWithinCaps`: per channel `dailyCaps[channel]` and `INGEST_COMBINED_DAILY_CAP` = 200), creates a `proposed` job and runs `proposeItem` (dedup, embed queue, link snapshot queue).
  - `ingestChannels = ['pwa', 'shortcut', 'email', 'paste', 'mcp']`.
  - `INGEST_CHANNEL_DAILY_CAPS` is a per-channel override map.
  - Web `review/source-line.ts` `CHANNEL_LABELS`.
- Review: `GET /decks/{id}/review` (`REVIEW_LIMIT`), `POST /items/{id}/publish` (`PublishRequest`, edits/merge target), `POST /items/{id}/discard`; `review.service` runs each in `transaction`.
- Limits: `ITEM_BODY_MAX` (600 code points), payload bytes, title max in `@pb/shared`.
- No CSV parser in the repo.

## Technical Context

**Language/Version**: TypeScript (strict, ESM, no build step) on Node ≥ 22; React 19

**Primary Dependencies**: Hono + `@hono/zod-openapi`, Drizzle, pg-boss; TanStack Router/Query. New: `papaparse` (CSV, ~7 KB gzip, lazy-loaded with the import route; also used by the CLI). Markdown parsing is line-based (headings, list items, paragraphs), no library.

**Storage**: PostgreSQL 17. One migration: `ALTER TYPE ingest_channel ADD VALUE 'import'`.

**Testing**: Vitest unit (parser fixtures); integration with Testcontainers; Playwright full

**E2E tier**: full — import and bulk publish reuse the smoke-covered review path; failures are visible and non-destructive (proposals can be discarded). One nightly journey: paste 5 lines → preview → import → filter "Imported" → select all → publish → 5 cards in the deck.

**Target Platform**: PWA; Docker Compose on Dokploy; CLI via `tsx`

**Project Type**: pnpm monorepo — API, PWA, shared packages, scripts

**Performance Goals**: 100 rows per request < 15 s (sequential `proposeDirect`; dedup by meaning embeds each draft); bulk publish of 50 < 5 s

**Constraints**: no AI calls; reuse `proposeDirect` unchanged except the channel; lazy route; parser shared by web and CLI

**Scale/Scope**: imports of tens to a few hundred notes, a handful of times per deck

## Constitution Check

| Principle | How this plan complies |
|-----------|------------------------|
| I. Layered API | `routes/imports.ts` → `imports.service` → `ingest.service.proposeDirect`; `routes/review.ts` bulk → `review.service.publishMany` |
| II. One source of truth | Parser, `importRequestSchema`, `bulkPublishSchema`, caps in `@pb/shared`; same parser in web and CLI |
| III. Invariants in the DB | Card limits remain DB CHECKs; channel enum in DB; caps counted from `ingest_jobs` |
| IV. Private by default | Admin-only import; proposals stay unpublished until reviewed |
| V. Tests at the right tier | Unit (parser fixtures incl. Hebrew, CSV quoting), int (import caps, permissions, bulk publish skips), e2e full journey |
| VI. Lean web | Lazy route; `papaparse` only in the import chunk; budget gate |
| VII. Simple, optional | Works with no AI key; no new env var |

**Dependency note**: `papaparse` replaces a hand-written CSV parser (quoted fields, embedded newlines, BOM); stable, MIT, no dependencies.

No violations.

## Decisions this plan pins down

Full reasoning in [research.md](./research.md).

| ID | Decision | ADR? |
|----|----------|------|
| D189 | Deterministic import parser in `@pb/shared/import` (`parseNotes(text, format)`, formats `lines`, `markdown`, `csv`, auto-detect by extension/content); line rules: URL-only → link card, `title — body` / `title: body` split, else first sentence (≤ 80 chars) as title; markdown: heading → category name, list item/paragraph → card; CSV header `title,body,category,url` via `papaparse`; rows validated against card limits; no LLM | no |
| D190 | `POST /decks/{id}/imports` `{ label, rows ≤ IMPORT_ROWS_PER_REQUEST (100) }`, `item.publish`; per row `proposeDirect` with channel `import` (migration adds the enum value), `clientLabel = label`; `import` daily cap 500 rows, excluded from the combined cap; 200 `{ imported, duplicates, failed: [{ index, problem }] }`; stops at the cap and reports the rest; CLI `pnpm import:notes <file> --deck <slug> [--dry-run]` with `GOBBIT_API_URL` + `GOBBIT_TOKEN` (session bearer) | no |
| D191 | `POST /decks/{id}/review/publish` `{ ids ≤ 50 }`, `item.publish`; publishes `new`-verdict proposals as is, one transaction each; skips `possible_duplicate`/`update` (`needs-decision`) and non-proposed (`already-handled`); 200 `{ published: [id], skipped: [{ id, reason }] }`; review queue select mode + `source` filter (`clientLabel`) | no |

## Project Structure

### Documentation (this feature)

```text
specs/021-bulk-import/
├── spec.md
├── checklists/requirements.md
├── plan.md
├── research.md
├── data-model.md
├── contracts/import-api.md
├── quickstart.md
├── tasks.md
└── implementation-notes.md   # created during /speckit-implement
```

### Source Code (repository root)

```text
packages/shared/src/
├── import/parse-notes.ts                    # NEW: parseNotes, detectFormat
├── import/parse-lines.ts, parse-markdown.ts, parse-csv.ts   # NEW
├── import/fixtures/*.txt|md|csv             # NEW: test fixtures (synthetic, incl. Hebrew)
├── schemas/import.ts                        # NEW: importRowSchema, importRequestSchema, importResultSchema, bulkPublishSchema, bulkPublishResultSchema
├── ingest/constants.ts                      # ingestChannels + 'import'; IMPORT_* limits
└── limits.ts                                # INGEST_CHANNEL_DAILY_CAPS.import = 500

packages/db/migrations/00NN_import_channel.sql   # ALTER TYPE … ADD VALUE 'import' (down: documented no-op + data note)

apps/api/src/
├── services/ingest.service.ts               # combined cap ignores 'import'
├── services/imports.service.ts              # NEW: permission, loop, results
├── routes/imports.ts                        # NEW: POST /decks/{id}/imports
├── services/review.service.ts               # + publishMany, list filter by source
└── routes/review.ts                         # + POST /decks/{id}/review/publish; ?source= on GET
apps/api/test/imports.int.test.ts            # NEW
apps/api/test/review.int.test.ts             # + bulk publish

apps/web/src/
├── routes/d.$slug.import.tsx                # NEW (lazy)
├── import/ImportScreen.tsx, ImportPreview.tsx, ImportResult.tsx   # NEW
├── review/ReviewQueue.tsx                   # select mode, source filter, bulk publish
├── review/source-line.ts                    # CHANNEL_LABELS.import = 'Imported'
└── deck menu                                # "Import notes" for admins

scripts/import-notes.ts                      # NEW CLI (tsx); package.json "import:notes"
e2e/tests/full/import.spec.ts                # NEW
```

**Structure Decision**: parsing lives in `@pb/shared` (not the API) so the preview is instant and offline, and the server receives already-structured drafts, the same shape as MCP's `proposeDirect`. The server still validates each draft.

## Invariant → test traceability

| Invariant / rule | Enforced in | Test (file, tier) |
|------------------|-------------|-------------------|
| FR-001 three formats | `parse-*.ts` | `parse-notes.test.ts` (unit: fixtures per format; URL-only line; heading → category; CSV quoting, BOM, missing columns; Hebrew/RTL; separators skipped) |
| FR-002 preview, invalid rows | `ImportPreview` + `importRowSchema` | `ImportPreview.test.tsx` (unit: untick, edit, invalid reason, over-limit message) |
| FR-003 same path as direct proposals | `imports.service` → `proposeDirect` | `imports.int.test.ts` (int: proposals with channel `import`, `clientLabel`, new-category suggestion, duplicate flagged) |
| FR-004 limits and report | `imports.service`, caps | `imports.int.test.ts` (int: > 100 rows 400; daily cap reached mid-import → partial result; combined cap unaffected; failed rows reported with index) |
| FR-005 admins only | `item.publish` | `imports.int.test.ts` (int: editor/reader 403, non-member 404) |
| FR-006 bulk publish | `review.service.publishMany` | `review.int.test.ts` (int: `new` published; duplicates/updates skipped `needs-decision`; already handled `already-handled`; > 50 ids 400; other deck's ids skipped; events written) |
| FR-007 same parser | `@pb/shared/import` used by web and CLI | `import-notes.test.ts` (unit: CLI chunks by 100, dry run prints, uses `parseNotes`) |
| FR-008 no AI | `proposeDirect` | `imports.int.test.ts` (int: `llm_calls` has no `extract*` rows after import) |
| Journey | — | `e2e/tests/full/import.spec.ts` (e2e:full) |

## Rollout

- **Migrations**: `00NN_import_channel` adds the enum value (Postgres can't drop enum values: the down file re-creates the type without `import` only if no job uses it, else fails with a clear message, the same as `mcp` in P5.9).
- **Env / config**: none on the server. CLI: `GOBBIT_API_URL`, `GOBBIT_TOKEN` (README).
- **API client**: `pnpm api:openapi`.
- **Deploy order / flags**: migration then API then web (normal).

## Risks

| Risk | Likelihood / impact | Mitigation |
|------|---------------------|------------|
| Line splitting guesses a poor title | M / L | Preview with editing; titles are fixed in review |
| 100 sequential proposals too slow with dedup by meaning | M / L | Measure in the int test; if > 15 s, log a deviation and move rows to a pg-boss job |
| Bulk publish of junk | L / M | Admin-only; skip duplicates; 020's log; archive/delete afterwards |
| Review queue page size hides rows from "select all" | M / L | "Select all shown" is explicit; filter by source keeps an import within `REVIEW_LIMIT` pages |

## Settle before starting

- [ ] Allow editors to import into the review queue (larger audience, more review load)? The plan says admins only.
- [ ] Is 500 imported rows per admin per day enough for the first community load?

## Complexity Tracking

| Item | Why needed | Simpler alternative rejected because |
|------|------------|---------------------------------------|
| New dependency `papaparse` | CSV with quoted commas and newlines from spreadsheet exports | A hand-written split breaks on quoted fields; user rule prefers a stable library |
