# Data Model: Link snapshots and link checks

Migration **`0013_link_checks`** (hand-written down file in `packages/db/migrations/down/`).

## Enum `link_check_status`

`ok` | `dead` | `changed` | `unchecked`

`unchecked` is used by [`015-locked-host-links`](../015-locked-host-links/data-model.md) for hosts the check never probes.

## Table `link_checks`

| Column | Type | Null | Notes |
|--------|------|------|-------|
| `item_id` | uuid PK, FK → `items.id` `ON DELETE CASCADE` | no | One row per link card, created on its first check |
| `status` | `link_check_status` | no | Latest classified status |
| `http_status` | integer | yes | Last HTTP status (after redirects) |
| `error` | text | yes | `safe-fetch` error code (`timeout`, `blocked`, `fetch_failed: …`), ≤ 200 chars |
| `title_seen` | text | yes | Normalized page title from the last successful check, ≤ 200 chars |
| `consecutive_failures` | integer | no, default 0 | Definite failures in a row; CHECK `>= 0` |
| `checked_at` | timestamptz(3) | no | Last check |
| `next_check_at` | timestamptz(3) | no | When the sweep may pick it again |
| `flagged_at` | timestamptz(3) | yes | Set when the status becomes `dead` or `changed`; cleared on `ok` |
| `dismissed_at` | timestamptz(3) | yes | Set by Dismiss; cleared when the status changes |

CHECK: `dismissed_at IS NULL OR flagged_at IS NOT NULL`.

Indexes:

- `link_checks_next_check_idx` on `(next_check_at)`, for the sweep.
- `link_checks_flagged_idx` on `(flagged_at DESC) WHERE flagged_at IS NOT NULL AND dismissed_at IS NULL`, for `?flag=link`.

There is no `updated_at` trigger, because every write sets `checked_at`.

## Items: search text and preview index

- `item_search_text(item_type, text, text, jsonb, jsonb)` is replaced:
  - its `CASE` gains `WHEN 'link' THEN payload #- '{preview,publicId}'`;
  - `items.search_text` is dropped and re-added (generated), and `items_search_trgm_idx` is recreated;
  - this is the same procedure as 0009, and the down file restores the 0009 body.
- A new partial index, `items_link_preview_public_id_idx` on `((payload #>> '{preview,publicId}')) WHERE type = 'link'`. It is used by the 012 sweep and the D160 lookup.

## Payload change (`@gobbit/shared` `payloads.ts`)

```ts
linkPayloadSchema = z.object({
  url: httpUrlSchema,
  preview: z.object({
    title: z.string().optional(),
    description: z.string().optional(),
    image: httpUrlSchema.optional(),          // remote source, kept
    publicId: z.string().min(1).optional(),   // NEW: stored copy (server-owned, or a recorded asset per D160)
    width: z.number().int().positive().max(MEDIA_IMAGE_DIMENSION_MAX).optional(),   // NEW, server-owned
    height: z.number().int().positive().max(MEDIA_IMAGE_DIMENSION_MAX).optional(),  // NEW, server-owned
  }).strict().optional(),
}).strict();
```

The payload stays backwards compatible: every existing link payload still parses.

## DTO change (`@gobbit/shared` `schemas/item.ts`)

```ts
linkHealthSchema = z.object({
  status: z.enum(['dead', 'changed']),
  checkedAt: isoDateTimeSchema,
});
itemSchema = itemSchema.extend({ linkHealth: linkHealthSchema.nullable() });  // null for non-links and healthy links
itemListQuerySchema += { flag: z.enum(['link']).optional() };
```

## Queues and constants

`@gobbit/shared` `links/constants.ts`, a new zod-free subpath `@gobbit/shared/links`:

| Constant | Value |
|----------|-------|
| `LINK_CHECK_CRON` | `'30 6 * * *'` |
| `LINK_CHECK_BATCH` | 100 |
| `LINK_CHECK_INTERVAL_DAYS` | 30 |
| `LINK_CHECK_JITTER_DAYS` | 3 |
| `LINK_CHECK_RETRY_DAYS` | 1 |
| `LINK_CHECK_DEAD_AFTER` | 2 |
| `LINK_CHECK_HOST_PARALLEL` | 4 |
| `LINK_CHECK_READ_BYTES` | 262 144 |
| `LINK_CHECK_RATE_PER_HOUR` | 10 |
| `LINK_SNAPSHOT_REQUEUE_MAX` | 1 |

Queues (`jobs/queues.ts`): `linkSnapshot: 'link-snapshot'` (data `{ itemId, attempt? }`, `singletonKey` = item id) and `linkCheckSweep: 'link-check-sweep'`.

Rate key: `rateKeys.linkCheckUser(userId)`.

## Storage

| Asset | Folder | Tags | Cleanup |
|-------|--------|------|---------|
| Link snapshot | `gobbit/links/<deckId>` | `link_snapshot`, `deck:<deckId>` | 012 sweep (reference = link `preview.publicId`); `deleteForDeck` |

## Down file

Drop both indexes and the table, then the enum. Restore the 0009 `item_search_text` body and regenerate `search_text` and its trigram index.
