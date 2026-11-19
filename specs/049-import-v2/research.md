# Research: Import v2

Continues the project-wide D series (highest before this feature: D442). Each entry: decision, rationale, alternatives.

## Resolved clarifications

### D445 — Address of a non-Latin category name (spec Story 3, first NEEDS CLARIFICATION)

**Finding.** `toSlug` (`apps/api/src/lib/slug.ts`, `@sindresorhus/slugify`) gives `''` for `בריאות` and `שירותי בריאות`, `athina` for `Αθήνα`, and `health` for `בריאות Health` (the Hebrew is dropped). `categories.service.create` then answers 400 "Could not derive a slug"; `review.service.ensureNewCategory` answers 400 when a Hebrew suggestion is published. `slugSchema` only allows `[a-z0-9-]`.

**Decision.** Add `toCategorySlug(name)` = `toSlug(name)`, else `c-` + first 8 hex of SHA-256 over the NFC-normalised, lower-cased name. Both call sites use it. An explicit `slug` on create still wins (the API already accepts one). Decks keep `toSlug` (a deck's address is chosen by a person at creation and is not in scope).

**Why.** Automatic: a maintainer never has to invent a Latin address for `בריאות` (SC-006 "first try"). Deterministic: the same name gives the same address, so re-creating after a delete, or a second deck, is predictable, and the import's strict matching by name never depends on it. Stable: the address never changes (D176), so a hash of the creation-time name is fine. No dependency, no transliteration table to maintain for Hebrew and every other script.

**Alternatives.**
- *Unicode slugs* (`/c/בריאות`): needs a new `slugSchema`, a DB-side check, percent-encoding rules in `publicUrl()`, sitemap and share previews; high blast radius for a cosmetic gain.
- *Hebrew→Latin transliteration library*: new dependency (VII), lossy (no vowels), gives unreadable addresses anyway.
- *Require an explicit address in the form*: extra field for every non-Latin category, and import suggestions would still need a rule.
- *Random id*: not reproducible.

**Known limit.** Mixed names keep today's partial result (`בריאות Health` → `health`), so two different Hebrew categories sharing one English word clash with the existing 409. Recorded as a risk; fix by passing `slug` explicitly. Not worth widening the fallback to "any name that loses letters" now (that would change addresses people already have).

### D447 — Lifting the import limit (spec Story 5, second NEEDS CLARIFICATION)

**Finding.** `INGEST_CHANNEL_DAILY_CAPS.import = 150` is a code constant counted per user over a rolling 24 h by `createCapGuard` (rows = jobs); `import` is already outside the combined 200 cap. `IMPORT_ROWS_PER_PREVIEW = 150` mirrors it in the web bundle. Constitution VIII wants limits that shape experience to be env-tunable.

**Decision.** `INGEST_IMPORT_DAILY_CAP` (env, positive int, default `IMPORT_DAILY_CAP_DEFAULT = 500` in `@gobbit/shared`) replaces the constant for the `import` channel. `IMPORT_ROWS_PER_PREVIEW` becomes the same default. Per-request cap (100) is unchanged. No role exemption.

**Why.** One rule for everyone is simpler to explain, test and alert on; a role exemption would add a second code path in `createCapGuard` and a decision about who counts as "a curator" for what is a few-evenings job. 500 covers the 400-card seed (FR-009) with headroom, and an operator can raise it for a bigger session without a deploy of code. The web preview cannot read server env, so it uses the default; a larger seed goes through the CLI (the intended path, which has no preview cap).

**Alternatives.** *Exempt owners and maintainers*: import is already limited to them (FR-015), so the exemption would remove the limit for every importer, i.e. the same as removing it. *No cap*: loses the protection against a runaway script. *Per-deck cap*: new state for no stated need.

## Format

### D443 — Card-per-section parsing

**Decision.** In `parse-notes.ts`, `detectFormat` still picks Markdown for `.md`/heading text; `parseMarkdown` first scans (outside ``` / ~~~ fences) for a `##` heading. If one exists, `parseSections` runs; else the 021 line-based path runs untouched (FR-003).

`parseSections` is a single pass over lines with a fence flag:
- `# x` (exactly one `#`) sets the category (inline Markdown stripped to plain text as 021 does for headings);
- `## x` closes the previous card and opens a new one at that line;
- `###`+ and everything else inside a section is body;
- the body is the raw text between headings with leading/trailing blank lines removed; interior text, line breaks, lists, bold, links, directives (`:u`, `:color[…]{…}`) and fenced code are kept verbatim, because card bodies are already Markdown (038) and the editor, reader and public pages share one renderer;
- text before the first `##` (and after a `#` with no section) is reported as an ignored line, not a card (spec Edge Cases);
- `rowError` is reused: title ≤ `CARD_TITLE_MAX`, body ≤ `CARD_BODY_MAX` code points (the spec's "line the row starts on" is the `##` line).

**Why.** The existing parser is already line-based and zod-free (the lazy chunk and the CLI both import it). Using `remark` here would be correct but heavier for one rule (find two heading levels outside fences); the only subtle cases are fences and `#` in code, handled by the same fence toggle 021 uses. Setext headings (`Title\n=====`) and headings inside blockquotes or lists are not recognised; documented as unsupported (authors write ATX headings).

**Alternative.** `remark-parse` AST: robust to setext/indented cases, but it brings the parse tree into the web chunk and needs positions mapped back to lines; rejected for size and for nothing the curators need.

### D444 — Field lines

**Decision.** After the `##` line, consecutive lines matching `^([A-Za-z][A-Za-z-]*):[ \t]+(.*)$` (key case-insensitive, stored lower-case) are fields; the first non-matching line (blank or text) ends them. "Directly under" is strict: fields are the lines immediately after the `##` line, so a blank line ends the field block and a later `source: x` is body text (spec Story 2, scenario 5). Keys: `source` (http/https URL), `categories` (comma list), `type` (`text` | `link` | `media`), `cover`, `image` (relative paths; a path must not be absolute or contain `..` above the file's folder — checked by the CLI, which knows the file location; the parser only checks non-empty).

Errors (row-level, with the field's line): unknown key, empty value, bad URL, unsupported `type`, repeated key, `type: link` without `source`, `type: media` without `image`, `image` without `type: media`.

**Why.** Simple, greppable, no YAML dependency (no frontmatter library in the repo; one level of keys does not justify one). RTL safety: keys are Latin and start the line; the value may be Hebrew (`categories: אתונה`).

**Alternatives.** YAML frontmatter per card (needs a parser, awkward under each `##`); HTML comments (invisible to authors reading the file).

### D446 — Strict category mode and several categories

**Decision.** `ImportRow.categories: string[]` (heading category first, then `categories:` values, de-duplicated by `matchCategory`'s key: trimmed, lower-cased, spaces→`-`, and NFC-normalised — a small addition, so `בריאות` typed with different Unicode forms still matches). `toImportDraft(row, categories, { strict })` returns either a draft with `categoryIds` for the matched names (+ `newCategory` for one unmatched name when not strict) or a refusal `{ unmatched: string[] }`.

`POST /decks/{id}/imports` gains `strict` (default false). Server-side strict check: the server re-resolves each row's category names? The draft carries ids only, so the server cannot check names. **Therefore the request carries `categoryNames` too in strict mode**: `categoryIds` (resolved by the client) plus `unmatched: string[]` the client could not resolve; with `strict: true` the server refuses any row with a non-empty `unmatched` (and re-verifies `categoryIds` belong to the deck, which `proposeDirect` already does). Without strict, one entry of `unmatched` becomes `newCategory`; more than one is a 400 for that row.

**Why.** Keeps one rule in one place (`imports.service`), keeps the DTO a list of drafts as today (`importDraftSchema` stays the unit), and lets the server record the refusal (FR-010) rather than trusting the client to skip rows. The CLI and app still do the matching because they already hold the category list (as 021).

**Alternative.** Send names and resolve on the server: a second matching implementation to keep equal to the preview's; rejected (FR-006 wants one rule).

**Non-strict with several unmatched names.** The proposal model holds one suggested category (`summary.newCategory`); widening it to a list touches review, publish and the extraction summary. Out of scope; the preview reports "only one new category per card" and strict mode (the seed path) makes it moot.

## Dry run

### D448

**Decision.** `import-notes --dry-run` builds the report in `@gobbit/shared/import/dry-run.ts` (pure): per-category counts (a card with two categories counts under both, and the total of distinct cards is printed), and a list of `{ line, problem }` for parser errors, no-category rows, unmatched names (strict), ignored text, malformed addresses, and missing/unsupported media files (the CLI passes a `fileExists`/`kindOf` callback; the pure report stays testable). With a deck and token it fetches `GET /decks/{id}/categories` for the strict check; without them it says so and skips that check. It prints, one file per call (a shell loop covers a dozen files), and exits 1 on any problem so it can gate a script. A clean dry run predicts the real counts because both use the same `toImportDraft`.

**Alternatives.** A server dry-run endpoint (a second code path and a write-adjacent route, no need: the parser and the category list are all it takes).

## Bulk discard

### D449

**Decision.** `POST /decks/{id}/review/discard` `{ source }`, `item.publish`. `review.service.discardImport(actor, deck, source)` lists the label's pending proposals (same query as `?source=`, ids only, limit `IMPORT_DISCARD_MAX + 1`), refuses a label with none (404-style `no_pending` problem is *not* used — it answers `{ discarded: 0 }` so a double click is harmless; the `discard_refused` event is only for forbidden), and calls the existing `discard` for each; a 404/409 from one (handled meanwhile by another publisher) is counted as skipped. Result `{ discarded, skipped }`.

**Why.** `discard` already writes the `discarded` event in the same transaction as the soft delete and releases uploads; looping it is the only way to keep FR-012 "exactly as a single discard does" true without a second implementation. One transaction per card means a crash leaves a consistent partial result that a second click finishes. At ≈ 25 ms per card the largest allowed import (1000) is < 30 s; the web shows a busy state.

**Alternative.** One SQL `UPDATE … WHERE client_label = $1` plus a batched event insert: faster but duplicates `discard`'s upload release and event shape; rejected (IX).

## Media from the command line

### D450

**Decision (second PR).** The CLI resolves `cover` / `image` against the file's folder (rejecting paths that leave it), checks the kind and size against `@gobbit/shared/media` limits locally, then per file: `POST /decks/{id}/media/sign` (purpose as the editor uses: `image` for covers; the media kind for `image:` files), `POST` the multipart form to Cloudinary with Node `fetch` + `FormData`, `POST /decks/{id}/media/assets` with Cloudinary's response, and builds the draft from the recorded asset (`cover: { publicId }`, or the media `payload`). The uploader is injected, so tests use a fake and never touch Cloudinary (FR-013, SC-007). A file used by several rows is uploaded once per run. The app's `preview-rows.ts` marks rows with `cover`/`image` as `error: 'Import this file from the command line'` so they cannot be ticked (FR-014).

**Why.** The signed-upload and record routes are the editor's, with the access, size and tag rules already enforced; the CLI is just another client. `media-sweep` removes uploads no card references (D158, covers counted per D409), which covers refused proposals.

**Unknown to verify in tasks.** The exact request/response shapes of `media/sign` and `media/assets` for non-image kinds (PDF, audio, video) and the media-card payload fields from `mediaPayloadSchema`; the contract file names them as "per 045" and the first task of PR 2 reads them from the schemas rather than from this document.

## Events

### D451

**Decision.** `imports.service` owns the decision events (catalogue `imports/imports.events.ts`, `decisionLogger`, same pattern as `items.events.ts`): `imports.completed`, `imports.rows_refused` (reasons `daily_cap`, `unmatched_category`, `invalid_row`), `imports.discarded`, `imports.discard_refused`; `categories.slug_derived` lives with the categories service. One event per reason per request with a count. Fields are ids and counts; category names, titles and the label are never logged (the label is the person's file name and may be personal).

**Why.** Constitution VIII requires a record for refusals; per-row events would flood the log on a 400-row seed and add nothing the count and `requestId` do not.

## Testing notes

- Fixtures are made up: a three-paragraph Hebrew card with a list, bold and a link; mixed Hebrew/English/Greek titles; one file per problem type (long title, no category, unknown key, repeated key, bad URL, ignored text, missing media, fenced `## not a card`, `###` inside a body, field-looking line after the body).
- A pure round-trip test asserts the parsed body equals the source text for SC-002's "reads identically": the same string reaches `itemBodySchema` and the renderers (rendering itself is covered by the existing rich-text tests).
- Integration: 400 rows over 4 requests with the default cap; the same with `INGEST_IMPORT_DAILY_CAP=150` refuses 250 with one event; the Hebrew category create + publish of a Hebrew suggestion; bulk discard with a concurrent publish.
- Constitution V/VIII: every event in the Accountability table has an assertion; the e2e journey is `@full`.
