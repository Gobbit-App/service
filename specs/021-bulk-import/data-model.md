# Data Model: Bulk import of notes

## Migration (`00NN_import_channel`, next free number)

| Change | Up | Down |
|--------|----|------|
| `ingest_channel` enum | `ALTER TYPE ingest_channel ADD VALUE IF NOT EXISTS 'import'` | Fails with a message if any `ingest_jobs.channel = 'import'`; else re-create the type without `import` (same pattern as P5.9's `mcp`) |

No new tables. Imported proposals are `ingest_jobs` rows (`channel = 'import'`, `client_label = label`, `status = 'proposed'`) and `items` rows (`status = 'proposed'`).

## Constants (`packages/shared/src/ingest/constants.ts`, `limits.ts`)

| Name | Value | Use |
|------|-------|-----|
| `ingestChannels` | + `'import'` | |
| `IMPORT_ROWS_PER_REQUEST` | 100 | Rows per `POST /imports` |
| `IMPORT_ROWS_PER_PREVIEW` | 150 | Rows the screen will parse before asking to split (= the daily cap) |
| `IMPORT_TITLE_SPLIT_MAX` | 80 | Longest title taken from a line |
| `INGEST_CHANNEL_DAILY_CAPS.import` | 150 | Imported rows per user per day (start low; revisit with real use) |
| `BULK_PUBLISH_MAX` | 50 | Ids per bulk publish |
| `IMPORT_LABEL_MAX` | `INGEST_CLIENT_LABEL_MAX` (60) | |

Combined cap: `assertWithinCaps` counts all channels except `import`.

## DTOs (`packages/shared/src/schemas/import.ts`)

### `ImportRow` (parser output)

| Field | Type | Notes |
|-------|------|-------|
| `line` | number | 1-based source line (CSV: row number) |
| `type` | `'text' \| 'link'` | |
| `title` | string | |
| `body` | string | |
| `sourceUrl` | string \| null | |
| `category` | string \| null | Name from heading/column |
| `error` | string \| null | Validation reason; invalid rows are not sent |

### `ImportRequest`

`{ label: string (1–60), rows: DirectDraft[] (1–100) }`, where each draft is `{ type, title, body, sourceUrl?, categoryIds?: [], newCategory?: string }`. The client maps `category` to an existing category id by name/slug, else `newCategory`.

### `ImportResult`

`{ imported: number, duplicates: number, failed: { index: number, problem: string, detail?: string }[] }`

### `BulkPublishRequest` / `BulkPublishResult`

`{ ids: uuid[] (1–50) }` → `{ published: string[], skipped: { id: string, reason: 'needs-decision' | 'already-handled' }[] }`

## Web labels

`CHANNEL_LABELS.import = 'Imported'`.
