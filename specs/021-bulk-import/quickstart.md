# Quickstart: Bulk import of notes

Validates [spec.md](./spec.md) end to end. Setup per `README.md`; no AI key needed. Contract: [import-api](./contracts/import-api.md).

## 1. Automated

```sh
pnpm db:migrate
pnpm test:unit                 # parser fixtures, preview, CLI
pnpm test:int                  # imports.int, review.int (bulk publish)
pnpm api:openapi && git diff --exit-code packages/api-client
pnpm build:web && pnpm budget
pnpm test:e2e -- full/import.spec.ts
```

## 2. Demo 6

1. Prepare a 40-line note (a few `#` headings, some lines with links, one Hebrew line).
2. As the deck owner: deck menu → Import notes → paste. The preview shows 40 cards with categories from the headings. Untick none. Import.
3. Result: imported 40 (duplicates N). Tap "Review them".
4. Select → Select all shown → Publish selected. Repeat for the next page if any. Skipped duplicates stay with "needs a decision"; decide them one by one.
5. The deck shows the new cards; 020's Activity lists the proposals (`via` ingest) and publishes.

## 3. CLI

```sh
GOBBIT_API_URL=http://127.0.0.1:3000 GOBBIT_TOKEN=$SMOKE_SESSION_TOKEN pnpm import:notes notes.csv --deck <slug> --dry-run
GOBBIT_API_URL=http://127.0.0.1:3000 GOBBIT_TOKEN=$SMOKE_SESSION_TOKEN pnpm import:notes notes.csv --deck <slug>
```

## 4. Deployed instance

Import the community's real notes on the deployed instance; time the sitting; tick demo 6 in `PLAN.md`.
