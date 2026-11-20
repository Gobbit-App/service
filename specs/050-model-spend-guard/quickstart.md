# Quickstart: validating the model spend guard (050)

Contracts: [contracts/best-effort.md](./contracts/best-effort.md). Data: [data-model.md](./data-model.md).

## Prerequisites

`pnpm install`; Docker running (integration tests use Testcontainers). The integration suite uses the fake extractor from `ingest-pipeline.int.test.ts`, so no provider key is needed.

## Automated

```bash
pnpm db:migrate                                   # applies 0028_smart_share locally
pnpm --filter @gobbit/api test:unit               # best-effort.test.ts, ingest.test.ts, shares/review mappers
pnpm test:int -- ingest-spend-guard ingest-pipeline   # zero extractor calls; switch on/off; caps
pnpm --filter @gobbit/web test                    # share-state, ShareRow, fallback-line
pnpm api:openapi && git diff --exit-code packages/api-client   # no drift
pnpm typecheck && pnpm lint
```

Expected: every kind (link, photos, text, email forms) gives one `proposed` card with no category and `extraction.fallback = 'no_smart_share'`; the fake extractor's call count and the `llm_calls` extraction rows stay 0; the same shares from a switched-on user and from an admin are extracted.

## By hand (local, `pnpm dev`, a provider key set)

1. Sign in as a normal member (not in `PLATFORM_ADMINS`). Share a web address from the paste box. Within seconds Your shares shows "Saved as you sent it. Smart share is coming soon." and the review queue holds a link card titled from the page.
2. Check no model call: `SELECT count(*) FROM llm_calls WHERE job_id = '<the job id>' AND purpose LIKE 'extract%';` → 0.
3. Switch the member on: `UPDATE users SET smart_share = true WHERE email = '<their email>';` Share again: an extracted card, no notice, one or two `llm_calls` rows.
4. Switch them off again; share a photo and a long text (over 2,000 characters): a media card, then a text card marked "cut" in review.
5. Find the events: `grep ingest.extraction_skipped` in the worker log, one line per plain share, no content in it.

## UI check (constitution X)

Screenshots at 412 px and 1280 px, light and dark, of a share row with the notice (against a row with the event line) and of a review card with the marker (against the D355 preview-fallback card). Attach them to the UI task and the PR.

## E2E

`@full`: `e2e/tests/full/shares.spec.ts` — a stubbed share with `savedAsSent: true` shows the line; one with `false` does not. The smoke share test is unchanged (the e2e stack has no provider).
