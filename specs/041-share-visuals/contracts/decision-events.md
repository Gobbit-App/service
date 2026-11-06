# Contract: decision events (D352)

These are pino log lines following `docs/design/api-conventions.md#decision-events`. They never carry URLs, titles, captions, descriptions or page text. `host` is the lower-cased hostname without `www.`.

The outcome and reason sets are declared as const arrays in `fetch/preview-events.ts`, and tests import them from there.

## `link_preview.built`

```json
{ "event": "link_preview.built", "outcome": "discarded", "reason": "login_wall",
  "caller": "ingest", "jobId": "…", "deckId": "…", "host": "instagram.com", "lockedHost": "Instagram",
  "imageSource": "none", "titleSource": "none", "lookup": "skipped", "ms": 412 }
```

- `caller`: `ingest` | `snapshot` | `editor`.
- `requestId` is used instead of `jobId` for `editor`. `itemId` is present for `snapshot`.
- Level: `warn` when the outcome is `discarded`, `info` otherwise.

## `link_preview.lookup`

```json
{ "event": "link_preview.lookup", "outcome": "failed", "reason": "timeout", "caller": "ingest", "jobId": "…", "host": "youtube.com", "ms": 2500 }
```

Level: `warn` when the outcome is `failed`, `info` otherwise.

## `link_preview.applied` (ingest, after validation, link cards only)

```json
{ "event": "link_preview.applied", "outcome": "applied", "jobId": "…", "itemId": "…", "deckId": "…",
  "host": "instagram.com", "lockedHost": "Instagram", "image": "member_share", "description": "caption", "honestTitle": false }
```

- `image`: `member_share` | `page` | `none`.
- `description`: `caption` | `page` | `none`.

## `link_snapshot.image`

```json
{ "event": "link_snapshot.image", "outcome": "dropped", "reason": "not_image", "jobId": "…", "itemId": "…", "deckId": "…", "host": "example.com", "tries": 3 }
```

- `outcome`: `copied` | `dropped` | `kept` (storage failure) | `none` (no candidates) | `member_choice` (`imageRemoved`).
- `reason`: the last image failure, or `upload_failed` / `unavailable` for `kept`.
- Level: `warn` when the outcome is `dropped`, `info` otherwise.

## `link_snapshot.backfill` (script)

```json
{ "event": "link_snapshot.backfill", "outcome": "done", "runId": "…", "scanned": 120, "enqueued": 87, "skippedMemberEdit": 9, "hosts": 31 }
```
