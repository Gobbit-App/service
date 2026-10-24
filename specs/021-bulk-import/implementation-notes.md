# Implementation notes: 021-bulk-import

Plan: `specs/021-bulk-import/plan.md`, tasks: `tasks.md`. Branch `phase8-021-bulk-import`, stacked on 019 (`phase8-019-deck-admin`) to keep the PR diffs small; the only code it shares with 019 is the deck header (`routes/d.$slug.tsx`).

Migration `0016_import_channel` (+ down file; the down refuses while `import` jobs exist). Routes: `POST /decks/{id}/imports`, `POST /decks/{id}/review/publish`, `GET /decks/{id}/review?source=`. No env var on the server; the CLI reads `GOBBIT_API_URL` and `GOBBIT_TOKEN`. New dependency: `papaparse` in `@pb/shared` (lazy in the web). E2E tier: full (`e2e/tests/full/import.spec.ts`): import and bulk publish reuse the smoke-covered propose/review path.

## Decisions not specified by the plan

- **Parser rules**: a spaced hyphen ` - ` splits title and body as well as `—`, `–` and `: `; list markers are stripped in `lines`; a URL-only title drops the scheme and `www.`; a URL is removed from the title when it becomes `sourceUrl`; Markdown link-only list items become link cards; a CSV `url` column makes a link card; CSV `line` is the spreadsheet row number (header = 1); a CSV needs a `title` or `body` column.
- **The parser is zod-free** (`@pb/shared/import`) so the lazy web chunk and the CLI share it; `toImportDraft` (row → request draft, category name → existing id or `newCategory`) lives there too.
- **A bad row refuses the whole request** (400 "Row N: …"); only a cap hit gives a partial result. A cap hit on the first row is a 429.
- **Import jobs neither count toward nor are held by the combined cap** (`ingest/caps.ts`).
- **Link payload URL = `sourceUrl`** for imported link cards.
- **Bulk publish** creates the suggested category when the role has `category.create` (as the single review does); a 409 race on one card counts as `already-handled`; any other error aborts the rest (cards already published stay published).
- **`?source=` filters in SQL before `REVIEW_LIMIT`**; the count stays the deck total.
- **Chunking is shared**: `importInChunks` (`@pb/shared/import`) sends requests of 100 sequentially, re-bases failure indexes to the whole import, marks the rest rate-limited after a rate-limited chunk, and rethrows a failing first chunk.
- **Optimistic review cache updates cover every cached queue variant** (whole queue and per source) through `reviewListsFilter`; the item editor's review cache update uses it too.
- **Preview**: invalid rows start unticked and can be ticked only once an edit fixes them; an edit that fixes a row ticks it; the import label is the file name, or "Pasted notes".
- **Budget**: `papaparse` is a lazy-only library marker (`delimitersToGuess`) in `apps/web/scripts/initial-chunks.ts`.

## Deviations from the plan

- **Skipped-cards "toast"** is an inline status notice (`BulkPublishNotice`) that lists each skipped card with its reason and stays until dismissed, not the global undo toast.
- **CLI location**: `apps/api/scripts/import-notes.ts` with its logic in `scripts/lib/import-notes-cli.ts` (T030's test is `import-notes-cli.test.ts`): root `scripts/` is outside the unit test glob, and the API package already holds the other CLIs. The root `import:notes` script runs it with `tsx` from the repo root so relative paths work.
- **CLI HTTP**: uses the bearer `request` helper from `scripts/lib/api-cli.ts` instead of `@pb/api-client`, which is set up for the browser (same-origin `/api`, cookies). Invalid rows are skipped and listed; the exit code is 1 when any row was not imported.
- **T015**: the combined-cap rule and its unit test are in `apps/api/src/ingest/caps.ts`, called by `ingest.service`.
- **T054–T056**: not run; the quickstart's section 4 and demo 6 need the deployed instance, and `/speckit-converge` runs after review.
