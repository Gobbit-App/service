# Quickstart: Share status and auto-publish for publishers

Validates [spec.md](./spec.md) end to end. Setup per `README.md`. Contracts: [shares-api](./contracts/shares-api.md); data: [data-model](./data-model.md).

## 1. Automated

```sh
pnpm db:migrate                # 0017_share_status (backfills personal decks + failure codes)
pnpm test:unit                 # failure-code classifier, auto-publish gate, share-state copy, ShareRow/SharesScreen, ReviewPill
pnpm test:int                  # shares.int (list/get/retry/access/caps), ingest-pipeline.int (auto-publish, failure codes, log line), decks.int (setting)
pnpm api:openapi && git diff --exit-code packages/api-client
pnpm build:web && pnpm budget  # shares route is lazy; initial bundle unchanged ±1 KB
pnpm test:e2e -- --grep @smoke # review entry + empty queue → Your shares; Sent → Your shares
pnpm test:e2e -- full/shares.spec.ts full/deck-admin.spec.ts
pnpm db:rollback && pnpm db:migrate   # down file round-trip
```

## 2. Manual: the incident (no AI key needed)

1. Start with an invalid provider key (e.g. `OPENROUTER_API_KEY=invalid`), so ingestion is on but every extraction call fails. `pnpm dev`.
2. As an editor on a shared deck, paste a link in the share box → "Sent". The screen shows **Processing…** and then **Couldn't add this: the assistant wasn't available** with **Try again**.
3. Deck header → **Your shares** lists the same share with the same reason.
4. The worker output has one `ingest job failed` error line with `jobId`, `deckId`, `channel`, `attempts`, `failureCode`, and no URL.
5. Set a valid key, restart, tap **Try again** → Processing → **Waiting for review** (link opens the proposal for a publisher; for the editor it opens the card in review).

## 3. Manual: auto-publish

1. With an AI key, as the owner: Deck settings → turn on **Publish shares from publishers directly**. A maintainer sees the switch disabled.
2. As the owner, share a link whose topic matches an existing category. **Your shares** shows **Published**. The card is in the deck. Activity shows "published · via share/import" by the owner.
3. Share the same link again: **Waiting for review — possible duplicate**.
4. As an editor, share a link: **Waiting for review** (not a publisher).
5. Personal deck (`/d/me`): the switch is on by default; a share lands directly.

## 4. Deployed instance

After deploy: share an image from Android to the personal deck. "Sent" shows the live status and ends in **Published** (or a plain reason with **Try again**). Check `docker logs` for the worker: no `ingest job failed` line, or one with a code.
