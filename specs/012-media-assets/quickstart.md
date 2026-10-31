# Quickstart: Media assets

Validates [spec.md](./spec.md) end to end. Setup per `README.md` (`pnpm dev`, a signed-in member, `CLOUDINARY_URL` set for sections 2–3). Contract: [media-assets](./contracts/media-assets.md).

## 1. Automated

```sh
pnpm db:migrate                         # applies 0012_media_assets
pnpm test:unit                          # safe-fetch binary mode, media.service, sweep batching
pnpm test:int                           # media-assets.int, media-sweep.int, items.int, ingest.int (Docker)
pnpm api:openapi && git diff --exit-code packages/api-client
pnpm test:e2e -- editor.spec.ts         # image card happy path still passes
pnpm db:rollback && pnpm db:migrate     # the down file round-trips
```

## 2. API by hand (`api.http` style, `SMOKE_SESSION_TOKEN`)

1. Upload a photo in the editor of a test deck and save the card. In SQL: `SELECT source, width, height FROM assets ORDER BY created_at DESC LIMIT 1` returns `editor` with real dimensions. `GET /items/<id>` shows `payload.width` and `payload.height`.
2. `POST /decks/<deckId>/items` with an image payload whose `publicId` is `gobbit/items/<otherDeckId>/x` → 422 "Unknown image".
3. `POST /decks/<deckId>/media/assets` with a tampered `signature` → 422; with `CLOUDINARY_URL` unset → 503.
4. Share a photo into the deck (ingest); the proposal's image has an asset row with `source = ingest`.

## 3. Orphan cleanup (PLAN.md Phase 7 demo 1)

1. Upload a photo in the editor and cancel the card (don't save). Note the `public_id`.
2. Backdate it: `UPDATE assets SET created_at = now() - interval '8 days' WHERE public_id = '<id>'`.
3. Run the sweep now: `pnpm --filter @gobbit/api exec tsx scripts/run-job.ts media-sweep` (or wait for 06:00).
4. The worker log shows `media-sweep` with `deleted: 1`. The image URL `https://res.cloudinary.com/<cloud>/image/upload/f_auto,q_auto,c_limit,w_720/<id>` now answers 404. The row is gone.
5. Repeat with a saved card's image: it is kept (`deleted: 0`).
6. On the deployed instance: repeat steps 1–4 once and tick demo 1 in `PLAN.md` together with the camera upload from 008.

## 4. Legacy report

`pnpm media:reconcile` lists `editor` and `ingest` uploads that have no asset row. It deletes nothing unless `--delete` is passed explicitly.
