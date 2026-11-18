# Quickstart: validating Import v2

Run after implementation. Fixtures are made-up content; nothing here uses real data or the real media service.

## Prerequisites

```
pnpm install
pnpm compose:up            # Postgres + API + worker + web on 127.0.0.1:8080
pnpm db:seed               # owner + smoke session (SMOKE_SESSION_TOKEN)
export GOBBIT_API_URL=http://127.0.0.1:8080/api GOBBIT_TOKEN=$SMOKE_SESSION_TOKEN
```

Create a communal deck and, from the app (deck settings), the categories `בריאות` and `אתונה` (Hebrew names must create on the first try — SC-006).

## 1. Card-per-section file (Stories 1–3)

Use `packages/shared/src/import/fixtures/sections-he.md` (a `# בריאות` file with a three-paragraph card, a list, bold, a link, `source:` and `categories: אתונה`).

```
pnpm import:notes packages/shared/src/import/fixtures/sections-he.md --deck <slug> --dry-run
```

Expected: card counts per category (`בריאות` n, `אתונה` m), no problems, exit 0, nothing created (the review queue stays empty).

```
pnpm import:notes packages/shared/src/import/fixtures/sections-he.md --deck <slug>
```

Expected: `imported n`, review queue shows one proposal per `##`, titled by the heading, body intact (paragraphs, list, bold, link), filed under both categories.

## 2. Dry run finds the problems (Story 4)

```
pnpm import:notes packages/shared/src/import/fixtures/sections-problems.md --deck <slug> --dry-run
```

Expected: one report line per problem with its line — long title, no category, unknown key, repeated key, malformed address, unmatched category (`בריאת`), ignored text — exit 1, nothing imported.

## 3. Strict vs app mode (Story 3)

- CLI with the misspelled category: refused, unmatched name listed, no suggestion created.
- `--no-strict`: one suggestion per card; publishing it in the app creates the Hebrew category with a `c-…` address.
- App import screen: paste the same text; unmatched names are suggestions, strict is off by default.

## 4. Limit (Story 5)

Generate 400 rows (`node` one-liner or the integration test's helper) across files; import all in a day: all `imported`. With `INGEST_IMPORT_DAILY_CAP=150` the rows over 150 are reported refused with `/problems/rate-limited`, and the log has one `imports.rows_refused` event with `reason=daily_cap`.

## 5. Undo (Story 6)

Review queue → filter by the import → "Discard all from this import" → confirm. Expected: pending proposals from that import are discarded, published ones untouched, count shown, activity log has one `discarded` entry per card.

## 6. Media (Story 7, PR 2)

Fixture with `cover: media/clinic.jpg` and a `type: media` card with `image: media/form.pdf` (tiny generated files). The integration/unit tests use a fake uploader; a manual run against a real deck uses the real signed upload. Expected: both proposals reference assets of the deck; the app's import screen shows the rows as "import this file from the command line".

## Automated checks

```
pnpm typecheck && pnpm lint && pnpm format:check
pnpm test:unit
pnpm test:int              # imports, review discard, categories, slug
pnpm api:openapi           # no drift
pnpm budget                # web bundle within 150 KB gzip
pnpm test:e2e              # smoke unchanged; the nightly journey is e2e/tests/full/import-sections.spec.ts
```

Screenshots (phone and desktop widths) of the import preview with several categories, a media row, and the review select bar with the discard action, compared with `ReviewSelectBar` and `ImportPreviewRow` before the change (constitution X).
