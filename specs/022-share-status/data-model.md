# Data Model: Share status and auto-publish for publishers

## Migration `0017_share_status`

| Change | Up | Down |
|--------|----|------|
| `decks.auto_publish_shares` | `boolean NOT NULL DEFAULT false`; `UPDATE decks SET auto_publish_shares = true WHERE is_default` (D192) | drop column |
| `ingest_jobs.failure_code` | `text NULL`, `CHECK (failure_code IS NULL OR failure_code IN (…ingestFailureCodes))`, `CHECK (failure_code IS NULL OR status = 'failed')`; backfill failed rows from `error` (D194) | drop column |
| `ingest_jobs.auto_publish` | `text NULL`, `CHECK (auto_publish IS NULL OR auto_publish IN (…autoPublishOutcomes))` (D193) | drop column |
| `ingest_jobs.retry_count` | `smallint NOT NULL DEFAULT 0`, `CHECK (retry_count BETWEEN 0 AND 3)` (D197) | drop column |
| `ingest_jobs.retried_at` | `timestamptz(3) NULL` (D197) | drop column |
| Index | `ingest_jobs (user_id, deck_id, created_at DESC)` for the shares list (D196) | drop index |

Backfill for `failure_code` (only `status = 'failed'`):

| `error` | `failure_code` |
|---------|----------------|
| `raw_missing` | `content_expired` |
| `sharer_gone`, `sharer_not_member` | `sharer_left` |
| starts with `invalid_output` | `unreadable_answer` |
| anything else | `unknown` |

Down file `packages/db/migrations/down/0017_share_status.down.sql` drops the index and columns in reverse order. It loses no data the previous version used.

## Constants (`packages/shared/src/ingest/constants.ts`)

| Name | Value | Use |
|------|-------|-----|
| `ingestFailureCodes` | `content_expired`, `sharer_left`, `fetch_failed`, `unreadable_answer`, `assistant_unavailable`, `image_unavailable`, `unknown` | D194; mirrored by the DB CHECK (an `enums.test.ts` case keeps them equal) |
| `autoPublishOutcomes` | `published`, `held_not_publisher`, `held_needs_category`, `held_duplicate`, `held_duplicate_check_failed`, `held_publish_failed` | D193 |
| `shareChannels` | `pwa`, `shortcut`, `paste`, `email` | Channels listed and auto-published (excludes `mcp`, `import`, FR-015) |
| `SHARES_LIST_LIMIT` | 50 | D196 |
| `SHARE_MAX_RETRIES` | 3 | D197 |
| `SHARE_POLL_MS` | 3000 | D198 web polling while processing |
| `RETRYABLE_FAILURES` | all except `sharer_left` | `canRetry` also needs `raw` present and `retry_count < SHARE_MAX_RETRIES` |

## Entities

### Deck (changed)

| Field | Type | Rule |
|-------|------|------|
| `autoPublishShares` | boolean | Read by every member; changed only by `owner` (`ownerRequired`, as `isPublic`); allowed on the personal deck; personal decks created with `true` |

### Ingest job (changed)

| Field | Type | Rule |
|-------|------|------|
| `failureCode` | `IngestFailureCode \| null` | Set with `status = failed`; cleared on retry |
| `autoPublish` | `AutoPublishOutcome \| null` | Set by the worker after proposing when the deck setting is on and the channel is a share channel; `null` otherwise; cleared on retry |
| `retryCount` | 0–3 | +1 per retry |
| `retriedAt` | timestamp \| null | Last retry; counted by caps |

### ShareSummary (DTO, `packages/shared/src/schemas/share.ts`)

| Field | Type | Notes |
|-------|------|-------|
| `id` | uuid | ingest job id |
| `deckId` | uuid | |
| `channel` | `ShareChannel` | |
| `createdAt` | datetime | |
| `state` | `processing \| failed \| in_review \| published \| not_added` | queued/running → processing; proposed → in_review; published → published; discarded → not_added; failed → failed |
| `preview` | `{ title: string \| null, host: string \| null, photoCount: number }` | `title` from the result item, else `raw.title`; `host` from the URL; never `raw.text` |
| `failureCode` | `IngestFailureCode \| null` | |
| `canRetry` | boolean | |
| `autoPublish` | `AutoPublishOutcome \| null` | Shown as "Waiting for review because …" |
| `item` | `{ id, title, deleted: boolean } \| null` | the result item, if any; `deleted` when soft-deleted |
| `reviewedBy` | `{ displayName: string } \| null` | sharer themselves when auto-published |
| `reviewedAt` | datetime \| null | |

## State transitions (ingest job)

```text
queued ─claim→ running ─propose→ proposed ─(auto-publish gate passes)→ published
   ↑              │                  │ ─(publisher publishes)→ published
   │              │                  └─(publisher discards)→ discarded
   │              └─fail (last attempt / non-retryable)→ failed
   └──────────── retry (sharer, D197: raw present, retry_count < 3, caps) ──┘
```

`auto_publish` is written once per processing run, before the job leaves `proposed` (or stays there with a `held_*` reason).
