# Implementation Plan: Import v2 — seed a communal deck from curated Markdown

**Branch**: `049-import-v2` | **Date**: 2026-11-18 | **Spec**: [spec.md](./spec.md) | **Roadmap**: first communal deck launch, stage 3 — [`community-go-list.md`](../../community-go-list.md) Track A

**Input**: Feature specification from `/specs/049-import-v2/spec.md`

Project override of the core template. Written for outside readers: the repository is public.

## Summary

Extend the 021 import path; add no new pipeline.

- **Parse** (`@gobbit/shared/import`): when a Markdown file has a `##` heading it is parsed card-per-section (D443): `#` = category, `##` = card title, the raw Markdown up to the next heading = body (no whitespace collapse, no stripping), `key: value` lines straight under the heading = fields (`source`, `categories`, `type`, `cover`, `image`; D444). A file with no `##` parses exactly as before. The parser stays zod-free and shared by the app and the CLI (FR-006).
- **Categories**: a row carries a list of category names. `toImportDraft` maps them to existing ids; in strict mode (D446) an unmatched name refuses the row; otherwise one unmatched name per card becomes the existing `newCategory` suggestion. Categories with names in Hebrew and other scripts `slugify` cannot read get a stable derived address `c-<8 hex>` (D445), used by category create and by publish of a suggestion.
- **Limits** (D447): the `import` daily cap becomes env-tunable (`INGEST_IMPORT_DAILY_CAP`, default 500); the preview limit equals the default; refusals are decision events.
- **Dry run** (D448): CLI-only, same parser plus the deck's real categories (`GET /decks/{id}/categories`) and local file checks; prints per-category counts and problems with lines; calls no write route.
- **Bulk discard** (D449): `POST /decks/{id}/review/discard` `{ source }` loops the existing `review.service.discard`, one transaction per card, so the per-card log entry and upload release are the single-discard ones. A "Discard all from this import" action joins the review select bar when a source filter is on.
- **Media** (D450, second PR): the CLI uploads `cover` / `image` files through `media/sign` → Cloudinary → `media/assets`, then sends a draft that references the recorded asset. The app marks such rows "import from the command line" and never sends them.

Two PRs: **PR 1** = US1–US6 (text, categories, limits, dry run, bulk discard); **PR 2** = US7 (media from the CLI), as the spec's P3 says.

## Starting point

`main @ 30206e3` (047 tasks merged; the spec is `449549a`). Latest migration `0027_member_profile`. Builds on 021 (`importRows`, `proposeDirect`, `import` channel, bulk publish), 038 (rich-text bodies), 045 (media cards, covers). The "bulk publish continues past a card that cannot be published" fix is a prerequisite shipped separately (spec Assumptions); this plan does not change `publishMany`. Next free ids: D443, ADR-082. No migration is needed (see [data-model.md](./data-model.md)).

## Technical Context

**Language/Version**: TypeScript (strict, ESM, no build step) on Node ≥ 22; React 19

**Primary Dependencies**: existing only — `@sindresorhus/slugify` (API), `papaparse` (CSV, unchanged), Node `crypto` for the address hash. No new dependency; no Markdown library in the parser (line-based, as 021; research D443).

**Storage**: PostgreSQL 17. No new tables or columns. `ingest_jobs.client_label` is the import label; categories keep `slug`.

**Testing**: Vitest unit (parser fixtures with Hebrew/English/Greek, `toImportDraft`, slug fallback, dry-run report, caps); integration with Testcontainers (strict mode, multi-category, caps, bulk discard, Hebrew category create and publish); Playwright `@full`.

**E2E tier**: full — import and review are secondary paths reused by the smoke-covered publish journey; every failure is visible and non-destructive (proposals can be discarded). One nightly journey: paste a card-per-section file → preview shows cards and categories → import → filter by import → "Discard all from this import" → queue empty. No third-party host is involved (media is CLI-only), so no smoke.

**UI reference**:
- Strict-mode option → the checkbox row used by the import input options in `apps/web/src/import/ImportInput.tsx`.
- "Import from the command line" row state → the invalid-row state in `apps/web/src/import/ImportPreviewRow.tsx` (same marker, different copy).
- Preview categories (several per row) → the existing category chip text in `ImportPreviewRow.tsx`.
- "Discard all from this import" → the bulk "Publish" action in `apps/web/src/review/ReviewSelectBar.tsx` (`ui/buttons`, icon from `ui/icons`), confirmed with the same sheet pattern as other destructive confirms (`ui/sheet`); result shown like `BulkPublishNotice.tsx`.
- Category address (read-only, derived) in category settings → none: no new field; the existing create form is unchanged.

**Target Platform**: Docker Compose on Dokploy; PWA; CLI via `tsx`

**Project Type**: pnpm monorepo — API + worker, PWA, shared packages, scripts

**Performance Goals**: 100 card-per-section rows per request in < 15 s (SC-004; sequential `proposeDirect`, unchanged); bulk discard of 100 in < 10 s (sequential, one transaction each; ≈ 25 ms per card); a 500-row parse on the device is instant (line-based, linear).

**Constraints**: card body ≤ 2000 code points / payload ≤ 8192 bytes (unchanged, enforced by DB CHECK); AI keys unused (SC-007); web budget unchanged (the parser is in the lazy import chunk); no real Cloudinary in tests.

**Scale/Scope**: one seed of a few hundred cards in a dozen files, a handful of times per deck.

## Constitution Check

*Pre-research: pass. Re-checked after design: pass; no violations.*

| Principle | How this plan complies |
|-----------|------------------------|
| I. Layered API | `routes/imports.ts` / `routes/review.ts` parse; `imports.service` (strict mode, caps, decisions) and `review.service.discardImport` hold the rules; `jobs`/`items` repos hold SQL (one new query: pending proposals by label). Access via `authorize(…, 'item.publish')`; a deck the caller can't see answers 404. |
| II. One source of truth | `importRowSchema`/`importDraftSchema`/`importResultSchema` and the new `discardImportRequestSchema`/`…ResultSchema` in `@gobbit/shared`; `pnpm api:openapi` after the route changes; parser and `toImportDraft` shared by web and CLI. |
| III. Invariants live in the database | Limits stay DB CHECKs; no schema change, so no migration or down file. Category slug uniqueness stays the existing unique index. |
| IV. Private by default | Import is owner/maintainer only and produces proposals only (D96); proposals stay visible only to publishers and their creator; bulk discard checks `item.publish` and the deck; media uploads use the per-deck signature; no outbound fetch is added; fixtures use made-up content. |
| V. Tests at the right tier | Unit + int + one `@full` journey (E2E tier above); traceability table below; each Accountability event asserted. |
| VI. Lean, offline-first web | Parser change lands in the lazy import chunk; the review action adds one button, no dependency; bundle budget re-run; subpath imports only. |
| VII. Simple, optional, deployable | No new dependency; no AI call; one new env var with a default (changelog entry, not a deploy blocker). |
| VIII. Accountable by default | Accountability table below; limit env-tunable. |
| IX. Reuse before writing | See "Reuse check". |
| X. One UI system | UI reference above; screenshots (phone + desktop) per UI task. |

### Reuse check (IX)

| Need | Checked | Outcome |
|------|---------|---------|
| Card-per-section parser | `parse-markdown.ts` (heading → category, collapses whitespace) | Add `parse-sections.ts` beside it; reuse `rowError`, `withError`, `findUrl`, `matchCategory`. The old path stays for files without `##`. |
| Markdown AST library | `remark` is installed for rich text (`@gobbit/shared/rich-text`) | Not used: it would pull remark into the zod-free lazy chunk and CLI for one rule (find `#`/`##` lines outside code fences); the line scan 021 already does is enough (D443). |
| Category address | `lib/slug.ts` `toSlug`, `categories.service`, `review.service.ensureNewCategory` | Add `toCategorySlug` (slug, else hash) next to `toSlug`; both call sites use it. |
| Cap, refusal | `ingest/caps.ts`, `INGEST_CHANNEL_DAILY_CAPS`, `env.ts` `positiveInt` | Env override of the existing `import` entry; `createCapGuard` unchanged. |
| Discard | `review.service.discard` | Loop it; no second implementation. |
| Per-label proposals | `GET /decks/{id}/review?source=` (D191) | Reuse its repo query; add an id-only variant if the existing one pages. |
| Media upload from the CLI | `media/sign`, `media/assets`, `MEDIA_*` limits, `classifyShareFiles` (MIME → kind) | Reuse the routes and `@gobbit/shared/media` kind rules; the CLI only adds a multipart POST to Cloudinary (Node `fetch`/`FormData`). |
| Dry run | `runImportNotes --dry-run` | Extend `import-notes-cli.ts` with a report function; no new script. |

## Decisions this plan pins down

Full reasoning in [research.md](./research.md). Continues the D series (highest before this plan: D442).

| ID | Decision | ADR? |
|----|----------|------|
| D443 | Card-per-section is triggered by a `##` heading outside a code fence; `#` sets the category, `##` starts a card, deeper headings are body; the body is the raw section text, trimmed (blank edge lines removed, interior kept); text outside any `##` section is reported ignored with its line; line-based, no Markdown library | yes → ADR-082 |
| D444 | Fields: `key: value` lines directly under the `##` line, ended by the first non-field line; keys `source`, `categories`, `type`, `cover`, `image`; unknown / empty / malformed / repeated key = row error with line; `type` ∈ `text`, `link`, `media`; a `link` card takes its URL from `source`; `categories` split on commas (also `،` and `，`), trimmed, de-duplicated by the same key `matchCategory` uses | no |
| D445 | Category address for a name `slugify` reduces to nothing: `c-` + the first 8 hex of SHA-256 of the NFC-normalised, lower-cased name; an explicit `slug` in create still wins; names that slugify partly (mixed scripts) keep today's result; a clash is the existing 409 asking for an explicit address. Resolves the spec's first NEEDS CLARIFICATION | yes → ADR-082 |
| D446 | Strict category mode: `strict: boolean` on `POST /decks/{id}/imports` (default false); the CLI sends true unless `--no-strict`; a row naming an unmatched category is refused (`failed` with problem `/problems/import-unmatched-category`, names in `detail`); the app's non-strict mode allows one unmatched name per card (the model has one suggestion per proposal), else the row is a preview error | no |
| D447 | `import` daily cap = `INGEST_IMPORT_DAILY_CAP` (env, default 500 rows per user per rolling day), per-request cap unchanged at 100; preview limit = the same default (500); owners and maintainers are not exempt. Resolves the spec's second NEEDS CLARIFICATION | no |
| D448 | The CLI dry run (`--dry-run`) reads the deck's real categories when `--deck` and a token are given, else checks only what the file says; it exits 1 when it finds problems; it never calls a write route or uploads | no |
| D449 | `POST /decks/{id}/review/discard` `{ source }` (`item.publish`) discards every pending proposal of the label through `review.service.discard`, ≤ `IMPORT_DISCARD_MAX` (1000), and answers `{ discarded }`; a card another publisher handled meanwhile is skipped, not counted | no |
| D450 | Media rows in import: `cover` is a cover on any card, `image` is the file of a `type: media` card; the CLI uploads (`media/sign` → Cloudinary → `media/assets`), the app never does; media rows travel as drafts with `cover` / a media `payload` built from the recorded asset; unreferenced uploads are left to `media-sweep` | no |
| D451 | Import decision events (`imports.*`, table below) are written by `imports.service`; one event per refusal reason per request, with the count, never per row | no |

Durable decisions (D443, D445) become ADR-082 with a one-line row in `docs/architecture.md`.

## Project Structure

### Documentation (this feature)

```text
specs/049-import-v2/
├── spec.md
├── checklists/requirements.md
├── plan.md              # this file
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/import-v2-api.md
├── tasks.md             # /speckit-tasks — not created here
└── implementation-notes.md   # during /speckit-implement
```

### Source Code (repository root)

```text
packages/shared/src/
├── import/parse-sections.ts          # NEW: card-per-section parser + field lines (D443, D444)
├── import/parse-notes.ts             # detect: a `##` heading outside a fence → sections
├── import/constants.ts               # ImportRow: categories[], type + 'media', cover, image, fieldErrors
├── import/note-row.ts                # rowError: categories, fields
├── import/to-draft.ts                # toImportDraft(row, categories, { strict }) → draft | refusal
├── import/dry-run.ts                 # NEW: report(rows, categories, strict) → per-category counts + problems
├── import/fixtures/*.md              # NEW: made-up Hebrew/English/Greek fixtures
├── ingest/constants.ts               # IMPORT_DAILY_CAP_DEFAULT = 500, IMPORT_ROWS_PER_PREVIEW = it, IMPORT_DISCARD_MAX
├── limits.ts                         # INGEST_CHANNEL_DAILY_CAPS.import uses the new default
└── schemas/import.ts                 # strict flag, draft categories/cover/media, discard DTOs, refusal counts

apps/api/src/
├── env.ts                            # INGEST_IMPORT_DAILY_CAP
├── lib/slug.ts                       # toCategorySlug (D445)
├── services/categories.service.ts    # uses toCategorySlug
├── services/review.service.ts        # ensureNewCategory uses it; discardImport (D449)
├── services/imports.service.ts       # strict mode, refusal counts, decision events (D446, D451)
├── services/ingest-wiring.ts         # dailyCaps from env
├── ingest/import-rows.ts             # draft: several categoryIds, cover, media payload
├── imports/imports.events.ts         # NEW: decision catalogue (like items.events.ts)
├── routes/imports.ts, routes/review.ts   # strict flag; POST /decks/{id}/review/discard
└── repositories/jobs.repo.ts or items.repo.ts   # pending proposal ids by label (reuse the ?source= query)
apps/api/scripts/
├── import-notes.ts, lib/import-notes-cli.ts   # --strict default, --no-strict, dry-run report, media upload (PR 2)
└── lib/import-media.ts               # NEW (PR 2): sign → Cloudinary → record, with an injectable uploader

apps/web/src/
├── import/ImportInput.tsx, ImportScreen.tsx, ImportPreviewRow.tsx, preview-rows.ts, use-import-notes.ts
├── review/ReviewSelectBar.tsx, ReviewQueue.tsx   # "Discard all from this import"
└── api/ (generated client updated by pnpm api:openapi)

packages/api-client/                   # regenerated
e2e/tests/full/import-sections.spec.ts # NEW: the nightly journey
docs/design/ingestion.md               # import v2 section; docs/adr.md ADR-082; docs/architecture.md one row
README.md, apps/api/api.http, CHANGELOG.md
```

**Structure Decision**: all change sits in `@gobbit/shared` (format and DTOs), the API import and review services, the CLI, and two web screens. No DB package change.

## Invariant → test traceability

| Invariant / rule | Enforced in | Test (file, tier) |
|------------------|-------------|-------------------|
| FR-001/FR-002 section → card, body kept verbatim | parser | `parse-sections.test.ts`, unit; round-trip through `proposeDirect` in `imports.int.test.ts`, int |
| FR-003 no `##` parses as 021 | `parse-notes.ts` detect | `parse-notes.test.ts` (existing cases kept), unit |
| FR-004 fields, unknown/malformed/repeated key errors with line | parser | `parse-sections.test.ts`, unit |
| FR-005 several categories, no repeats | parser + `toImportDraft` + `proposeDirect` | `to-draft.test.ts`, unit; `imports.int.test.ts`, int |
| FR-006 one parser in app and CLI | shared module | `import-notes-cli.test.ts` parses the same fixtures as `parse-sections.test.ts`, unit |
| FR-007 non-Latin category creatable, stable address | `toCategorySlug`, `categories.service`, `review.service` | `slug.test.ts`, unit; `categories.int.test.ts`, `review.int.test.ts`, int |
| FR-008 strict mode, unmatched names reported, none suggested | `imports.service`, `toImportDraft` | `imports.int.test.ts`, int; `to-draft.test.ts`, unit |
| FR-009 400 rows in a day; preview limit follows | `IMPORT_DAILY_CAP_DEFAULT`, env | `limits.test.ts`, unit; `imports.int.test.ts` (400 rows, then a low cap), int |
| FR-010 refusals recorded; result has imported/duplicate/refused/failed | `imports.service`, `imports.events.ts` | `imports.service.test.ts`, unit; `imports.int.test.ts`, int |
| FR-011 dry run reports every problem with its line, writes nothing | `dry-run.ts`, CLI | `dry-run.test.ts`, unit; `import-notes-cli.test.ts` (fake request records no POST), unit |
| FR-012 bulk discard: only pending, per-card log, uploads released, count | `review.service.discardImport` | `review.int.test.ts` (10 rows, 2 published, 8 discarded, 8 log entries), int; role refusal, int |
| FR-013 CLI upload → asset → card | `import-media.ts`, `import-rows.ts` | `import-media.test.ts` (fake uploader), unit; `imports.int.test.ts` asset-for-deck rule, int |
| FR-014 app marks media rows, never sends them | `preview-rows.ts`, `ImportPreviewRow.tsx` | `preview-rows.test.ts`, `ImportPreview.test.tsx`, unit |
| FR-015 owners/maintainers, proposals only, no model call | `authorize`, `proposeDirect` | `imports.int.test.ts` (reader refused; every item `proposed`; `llm_calls` empty), int |
| FR-016 documented | docs | checked in review (not a test) |
| Edge: bulk discard racing a publish | discard re-reads each proposal's state | `review.int.test.ts` (concurrent publish of one id), int |
| SC-004 100 rows < 15 s | unchanged `proposeDirect` loop | `imports.int.test.ts` timing guard (generous), int |
| Journey | UI | `import-sections.spec.ts`, e2e full |

## Accountability

Constitution VIII, ADR-060, [decision events](../../docs/design/api-conventions.md#decision-events). Events are named in `apps/api/src/imports/imports.events.ts`; fields are ids, counts and keyed hashes only — never category names, titles, labels or card text (the person's own HTTP result carries names).

| Decision | Event / audit row | Outcomes · reasons | Fields (ids/hashes only) | Level | Watched (instance / aggregate / rate) | Alert threshold (default) | Test |
|----------|-------------------|--------------------|--------------------------|-------|---------------------------------------|---------------------------|------|
| Rows refused for the daily limit | `imports.rows_refused` | refused · `daily_cap` | requestId, actorId, deckId, count, cap | warn | aggregate by deck and actor; rate per day | one actor refused > 3 times/day | `imports.service.test.ts`, unit; `imports.int.test.ts`, int |
| Rows refused in strict mode | `imports.rows_refused` | refused · `unmatched_category` | requestId, actorId, deckId, count | info | aggregate; rate against imports | rate > 25% of rows in a day on a deck | same |
| Rows refused as invalid by the server | `imports.rows_refused` | refused · `invalid_row` | requestId, actorId, deckId, count | info | aggregate; rate | rate > 10% of rows (the app and CLI parse the same way, so the server should rarely disagree) | same |
| An import request finishes | `imports.completed` | accepted · `ok` (imported, duplicates, refused counts) | requestId, actorId, deckId, imported, duplicates, refused | info | aggregate per window; average size | none | same |
| Proposals discarded by bulk discard | audit row: one `item_events` `discarded` per card (ADR-057), plus event `imports.discarded` | accepted · `bulk_discard` (count, skipped); accepted · `partial` when an unexpected error stops the loop after ≥1 discard (event written, then error rethrown) | requestId, actorId, deckId, discarded, skipped | info | per instance when discarded > 200; aggregate | one action > 200 cards | `review.int.test.ts`, int |
| Bulk discard refused | `imports.discard_refused` | refused · `forbidden`, `no_pending` | requestId, actorId, deckId | info | aggregate | none | `review.service.test.ts`, unit |
| Hebrew/non-Latin category address derived | `categories.slug_derived` | derived · `hash_fallback` | requestId, userId, deckId, categoryId | info | aggregate (count per window) | none | `categories.service.test.ts`, unit |

Notes:

- One `imports.rows_refused` event per reason per request (D451), so a 400-row request that hits the cap writes one event with `count`, not hundreds.
- Cap refusals before any row was imported still answer the existing 429; the event is written either way.
- The category-address event is a state change on durable data (a category is created), so it is also covered by the category row itself; the event exists only to make the fallback countable.

**Operator controls**: `INGEST_IMPORT_DAILY_CAP` (default 500 in `@gobbit/shared`, rows per user per rolling day for the `import` channel); `IMPORT_ROWS_PER_REQUEST` (100) and `IMPORT_DISCARD_MAX` (1000) stay code constants (not a user-experience limit worth a knob: both are safety bounds). The runbook entry (`docs/design/ingestion.md`, "Import limits") says: raise the variable for a seeding session, restart the API, put it back afterwards. The web preview limit is a build-time constant equal to the default, so raising the variable above it only helps the CLI (the intended seeding path).

## Rollout

- **Migrations**: none.
- **Env / config**: `INGEST_IMPORT_DAILY_CAP` (optional, default 500) → README env table, `infra/docker-compose.yml` `x-api-env`, `CHANGELOG.md` entry (not a deploy blocker).
- **API client**: yes — `pnpm api:openapi` (strict flag, draft fields, discard route).
- **Deploy order / flags**: normal CI → Dokploy. The old CLI and old web keep working against the new API (the new request fields are optional; `strict` defaults to false). New CLI against an old API would send unknown fields to a `.strict()` schema and get a 400 — acceptable, the CLI is run from the same checkout as the deploy.
- **Change from 021**: a `##`-grouped note now imports as one card (spec Edge Cases); called out in the changelog and in the import screen's help text; the preview shows the result before anything is sent.

## Risks

| Risk | Likelihood / impact | Mitigation |
|------|---------------------|------------|
| A 021 note using `##` as a group heading changes meaning | M / L | Preview shows it first; changelog and help text; fixtures cover both. |
| Two mixed-script names slugify to the same Latin word (`בריאות Health`, `שירותי בריאות Health` → `health`) | L / M | Existing unique slug → 409 with "provide an explicit address"; strict import matches by name first, so the CLI is unaffected. Revisit if it bites (research D445). |
| Several unmatched names on one card in non-strict mode | M / L | App shows a preview error; strict mode (CLI default) is the intended path for seeds. |
| Bulk discard of a very large label times out | L / M | `IMPORT_DISCARD_MAX` 1000, sequential and idempotent: a second call finishes the rest; result reports the count. |
| CLI uploads leave orphans after a refused proposal | M / L | Left to `media-sweep` after 7 days (spec Story 7.4). |
| Parser disagrees between app and CLI | L / H | One module; both call it in tests on the same fixtures. |
| Right-to-left text breaks field detection (`key:` in a RTL line) | L / M | Keys are Latin and must start the line; fixture with an RTL body line after the fields. |

## Settle before starting

- [x] Confirm the two resolutions in research (D445 derived address `c-<hex>`; D447 env-tunable cap, no owner exemption) — confirmed 2026-11-19.
- [x] Confirm `cover` / `image` reading (spec Assumptions): `cover` on any card, `image` = the file of a `type: media` card — confirmed 2026-11-19.
- [x] The bulk-publish "continue past failures" fix (spec dependency) is on `main` (#174, 2026-11-19).

## Complexity Tracking

No violations.
