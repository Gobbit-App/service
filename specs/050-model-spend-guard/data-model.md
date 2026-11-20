# Data model: Model spend guard (050)

## `users` (migration `0028_smart_share`)

| Column | Type | Notes |
|--------|------|-------|
| `smart_share` | `boolean NOT NULL DEFAULT false` | Off for every existing and new user. Written only by an operator in the database (FR-002); no route, service or schema writes it. Platform admins count as on whatever it says (FR-003, in code). |

Drizzle: `smartShare: boolean().notNull().default(false)` in `packages/db/src/schema/users.ts`, with a comment. Down file `packages/db/migrations/down/0028_smart_share.down.sql`: `ALTER TABLE "users" DROP COLUMN IF EXISTS "smart_share";`.

No index (read by primary key), no check (a boolean has no invalid value), no trigger. The user DTOs (`/me`, member summaries, public DTOs) do not change: nothing in the web reads the setting.

## `ingest_jobs.extraction` (jsonb, no migration)

`ExtractionSummary` gains:

| Field | Type | Notes |
|-------|------|-------|
| `fallback` | `'preview' \| 'no_smart_share'` (enum widened) | `no_smart_share`: saved without a model because the sharer's switch was off. |
| `bodyCut` | `boolean?` | Present and `true` only when the best-effort body was cut at the limit. |

A best-effort job ends `status = 'proposed'` with `extraction = { model: 'direct', escalated: false, type, confidence: 0, language, categoryIds: [], newCategory: null, fallback: 'no_smart_share', bodyCut? }`, `auto_publish = null`, `result_item_id` set and `dedup` set as for any proposal. A share that cannot become a card ends `status = 'failed'` with `failure_code = 'unknown'` (the existing reason copy) and no extraction summary.

## Derived (not stored)

- `ShareSummary.savedAsSent = job.extraction?.fallback === 'no_smart_share'`.
- `ReviewEntry.job.extractionFallback` (existing) carries the widened enum; `extractionBodyCut = job.extraction?.bodyCut === true`.

## State transitions

`queued → running → proposed` (best effort or extracted) or `→ failed`. No new states. The setting is read at `running` (FR-012); nothing is redone when it changes later (US3 scenario 2).
