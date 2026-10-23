# Contract: Bulk import and bulk publish

## 1. `POST /decks/{id}/imports`

| | |
|---|---|
| Auth | Session (cookie or bearer); `item.publish` (owner, maintainer) |
| Body | `ImportRequest` |
| 200 | `ImportResult` (also when some rows failed) |
| 400 | Bad body, > 100 rows, a row failing the draft schema (whole request refused, row index in the problem) |
| 403 | Member without `item.publish` |
| 404 | Deck not visible |
| 429 | Daily `import` cap already reached before the first row; `Retry-After` |

```json
{
  "label": "Street notes.md",
  "rows": [
    { "type": "text", "title": "Clinic", "body": "Open Sun–Thu 8–14", "newCategory": "Health" },
    { "type": "link", "title": "Municipality forms", "body": "", "sourceUrl": "https://example.org/forms" }
  ]
}
```

```json
{ "imported": 2, "duplicates": 0, "failed": [] }
```

`duplicates` counts imported rows whose dedup verdict is `possible_duplicate` or `update` (they are in the queue with the flag).

## 2. `POST /decks/{id}/review/publish`

| | |
|---|---|
| Auth | Session; `item.publish` |
| Body | `{ "ids": ["…", "…"] }` (1–50) |
| 200 | `BulkPublishResult` |
| 400 | Bad body, > 50 ids |
| 403 / 404 | As above |

```json
{ "published": ["…"], "skipped": [{ "id": "…", "reason": "needs-decision" }] }
```

## 3. `GET /decks/{id}/review?source=<label>`

Existing route; new optional `source` filters by the job's `client_label`.

## 4. CLI

```sh
GOBBIT_API_URL=http://127.0.0.1:3000 GOBBIT_TOKEN=<session token> \
  pnpm import:notes ./notes.md --deck our-street [--format lines|markdown|csv] [--label "Street notes"] [--dry-run]
```

Prints `imported N, duplicates N, failed N` and each failed row's line and problem. Exit code 1 when any row failed.

## 5. PWA

- `/d/$slug/import` (lazy), "Import notes" in the deck menu for owner/maintainer: paste box or file picker (`.txt`, `.md`, `.csv`), format switch, preview table (tick, edit title/body/category, error badge), "Import N cards".
- Result: counts and "Review them" → `/d/$slug/review?source=<label>`.
- Review queue: "Select" toggles checkboxes, "Select all shown", "Publish selected (N)"; result toast lists skipped cards.
