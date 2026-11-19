# Data Model: Import v2

**No database change.** No migration, no down file, no new column or enum value. Everything below is a shared (zod / TypeScript) shape or a rule over existing rows.

## Parsed row (`ImportRow`, `@gobbit/shared/import`, zod-free; twin `importRowSchema`)

| Field | Type | Notes |
|-------|------|-------|
| `line` | int ≥ 1 | The `##` line of a section; the source line for 021 formats |
| `type` | `text` \| `link` \| `media` | `media` is new (D444); `importCardTypes` gains it |
| `title` | string | The `##` heading text (plain), or the 021 rule |
| `body` | string | Raw Markdown of the section (D443); 021 formats unchanged |
| `sourceUrl` | string \| null | From `source:`; the link for `type: link` |
| `categories` | string[] | Replaces `category: string \| null`: heading category first, then `categories:`; de-duplicated by the matching key |
| `cover` | string \| null | Relative path (CLI only) |
| `image` | string \| null | Relative path of a `type: media` card's file (CLI only) |
| `error` | string \| null | First problem; `rowError` extended |

`ImportParseResult` gains `ignored: { line: number; text: string }[]` for text outside any `##` section, and keeps `problem` for whole-file problems. `category` (singular) is removed from the row type; the CSV `category` column fills `categories` with one entry, so 021 behaviour is unchanged.

## Request draft (`importDraftSchema`, `.strict()`)

Existing fields kept. Added (all optional):

| Field | Type | Rule |
|-------|------|------|
| `type` | `text` \| `link` \| `media` | `media` needs `payload` from a recorded asset (PR 2) |
| `categoryIds` | uuid[] | Unique, as now; may hold several |
| `unmatched` | string[] ≤ 5, each ≤ `NAME_MAX` | Names the client could not match to a category (D446) |
| `cover` | `{ publicId }` | The card's cover (`coverInputSchema`); must reference an asset of the deck (D160, D409) — checked by the existing reference rule |
| `payload` | media payload | Only for `type: media`; validated by `mediaPayloadSchema` through `parseDirectDraft` |

Request: `{ label, strict?: boolean, rows: draft[] ≤ 100 }`. `newCategory` stays for the non-strict single suggestion (the client moves one `unmatched` name into it, or the server does when `strict` is false and `unmatched.length === 1`; with more, the row fails with `/problems/import-too-many-new-categories`).

Result `importResultSchema`: `{ imported, duplicates, refused, failed[] }` where `refused` = count of rows refused by rule (daily cap, strict, invalid) and `failed[]` keeps `{ index, problem, detail? }` per refused or failed row (detail lists unmatched names for the person's own result only). FR-010's "imported, duplicate, refused and failed counts": `failed` = rows that errored unexpectedly (`/problems/internal`), `refused` = the rest of `failed[]`; the array is unchanged so old clients still read it.

## Bulk discard DTOs

- Request `discardImportRequestSchema`: `{ source: string (1…IMPORT_LABEL_MAX, trimmed) }`.
- Result `discardImportResultSchema`: `{ discarded: int ≥ 0, skipped: int ≥ 0 }`.

## Constants (`@gobbit/shared`)

| Name | Value | Env |
|------|-------|-----|
| `IMPORT_DAILY_CAP_DEFAULT` | 500 | `INGEST_IMPORT_DAILY_CAP` |
| `IMPORT_ROWS_PER_PREVIEW` | = `IMPORT_DAILY_CAP_DEFAULT` | — |
| `IMPORT_ROWS_PER_REQUEST` | 100 (unchanged) | — |
| `IMPORT_DISCARD_MAX` | 1000 | — |
| `IMPORT_UNMATCHED_MAX` | 5 | — |

## Existing rows touched (no schema change)

| Table | Use |
|-------|-----|
| `ingest_jobs` | One job per imported row (`channel = 'import'`, `client_label` = label, status `proposed`); the daily cap counts these; bulk discard selects `status = 'proposed'` by `client_label` and deck |
| `items` | Proposed cards; `cover` jsonb set for cover rows; soft-deleted by discard (30-day undelete as any discard) |
| `item_events` | One `discarded` row per discarded card, in the same transaction (ADR-057) |
| `categories` | `slug` from `toCategorySlug` (D445): the existing unique index on (deck, slug) is the clash guard |
| `assets` | Recorded by `media/assets` before a CLI card references it (PR 2) |

## State transitions

- Proposal: `proposed → published` (publish, unchanged) or `proposed → discarded` (single or bulk discard). Bulk discard only acts on `proposed`; a card that left that state meanwhile is `skipped`.
- Category address: created once, never changes (D176).
