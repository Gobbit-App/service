# Contracts: Import v2

The OpenAPI document is generated from the route definitions (`pnpm api:openapi`); this file is the human-readable intent. Authoritative shapes are the zod schemas in `packages/shared/src/schemas/import.ts`.

## `POST /decks/{id}/imports` (changed)

Needs `item.publish` (owner, maintainer). Unchanged: auth, 100 rows per request, per-row direct proposal on channel `import`, partial success.

Request:

```json
{
  "label": "health.md",
  "strict": true,
  "rows": [
    {
      "type": "text",
      "title": "How do I register with a family doctor?",
      "body": "First paragraph.\nSecond line.\n\n- item one\n- item two\n\n**Call 555-0100**",
      "sourceUrl": "https://example.test/clinic",
      "categoryIds": ["<uuid health>", "<uuid athens>"],
      "unmatched": []
    }
  ]
}
```

| Field | Rule |
|-------|------|
| `strict` | Optional, default `false`. With `true`, a row whose `unmatched` is non-empty is refused (`/problems/import-unmatched-category`, `detail` = the names) and no category suggestion is made |
| `rows[].type` | `text`, `link`, or `media` (media only from the CLI, PR 2) |
| `rows[].categoryIds` | Existing categories of the deck the caller can see (as `proposeDirect` checks today) |
| `rows[].unmatched` | ≤ 5 names. Not strict: exactly one becomes the card's suggested category; two or more fail the row with `/problems/import-too-many-new-categories` |
| `rows[].cover` | `{ publicId }` of an asset recorded for the deck (PR 2) |
| `rows[].payload` | Media payload, `type: media` only (PR 2) |

Response `200`:

```json
{ "imported": 98, "duplicates": 3, "refused": 2, "failed": [
  { "index": 4, "problem": "/problems/import-unmatched-category", "detail": "בריאת" },
  { "index": 9, "problem": "/problems/rate-limited", "detail": "Daily import limit reached" }
] }
```

- `refused` counts rows in `failed[]` refused by a rule; rows that errored unexpectedly (`/problems/internal`) are in `failed[]` only.
- Daily cap: rows already proposed stay; the rest are listed with `/problems/rate-limited`. When nothing was imported yet the answer is `429` with `Retry-After` (unchanged).
- The whole request is still `400` when a row fails the card rules (`assertImportRows`, unchanged), naming the row index.
- Old clients (no `strict`, no `unmatched`, `newCategory` only) behave as in 021.

Errors: `400`, `401`, `403`, `404`, `429` as today.

## `POST /decks/{id}/review/discard` (new)

Needs `item.publish`. Tag `review`.

Request: `{ "source": "health.md" }`

Response `200`: `{ "discarded": 8, "skipped": 0 }`

- Discards every proposal still `proposed` in this deck whose import label is `source`, newest last, through `review.service.discard` (one transaction each; `discarded` log entry per card attributed to the caller; uploads released).
- Published and already-discarded cards are untouched. A card handled by someone else mid-run is counted in `skipped`.
- Acts on at most `IMPORT_DISCARD_MAX` (1000) per call; call again to finish a larger label (the result says `discarded: 1000`).
- A label with no pending proposals answers `200 { discarded: 0, skipped: 0 }` (a double click is harmless).
- Errors: `400` (empty source), `401`, `403` (not a publisher; the `imports.discard_refused` event), `404` (deck not visible).

## `POST /decks/{id}/categories` (behaviour change)

No schema change. A name with no Latin letters or digits that `slugify` reduces to nothing now gets the address `c-<8 hex>` (D445) instead of `400`. An explicit `slug` still wins; a clash is still `409`.

## `POST /items/{id}/publish`, `POST /decks/{id}/review/publish` (behaviour change)

No schema change. Publishing a proposal with a suggested category whose name has no Latin letters creates it with the derived address instead of `400 "The suggested category has no usable name"`.

## CLI

```
pnpm import:notes <file> --deck <slug> [--dry-run] [--no-strict] [--label <text>]
```

Environment: `GOBBIT_API_URL`, `GOBBIT_TOKEN` (session bearer; owner or maintainer).

| Flag | Behaviour |
|------|-----------|
| (default) | Strict category mode on (D446), reads the deck's categories, imports in chunks of 100, prints imported / duplicates / refused / failed and the unmatched names |
| `--no-strict` | Unmatched names become one suggestion per card, as in the app |
| `--dry-run` | Prints per-category counts and every problem with its line; imports and uploads nothing; exit code 1 when any problem is found, 0 when clean; with no `--deck` or token it skips the checks that need the deck and says so |
| `--label` | Overrides the import label (default: the file name) |
| media (PR 2) | `cover:` / `image:` paths relative to the file are uploaded before the card is proposed; `--dry-run` only checks they exist and are an accepted kind |

Dry-run output (shape, not final wording):

```
health.md — 12 cards
  בריאות       12
  אתונה         3
problems:
  line 41: title is longer than 120 characters (131)
  line 58: unknown field "colour"
  line 77: no category
  line 90: category "בריאת" matches no category of the deck
```

## Markdown format (authors)

```
# בריאות                         ← category (name or address)

## How do I register with a family doctor?
source: https://example.test/clinic
categories: athens, thessaloniki
type: text

Body: **any** Markdown — paragraphs, line breaks, lists, links.
```

- `#` sets the category; `##` starts a card; `###` and deeper are body.
- Fields go on the lines immediately under the `##` line, one per line, before any body text; a field repeated or unknown is an error.
- A file with no `##` heading is parsed as in 021.
- Documented for authors in `docs/design/ingestion.md` ("Import format") and linked from the README.
