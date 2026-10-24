# Quickstart: Search on public pages

Validates [spec.md](./spec.md) end to end. Setup per `README.md` with `OPENAI_API_KEY` set; the public deck from [016's quickstart](../016-public-read-api/quickstart.md). Contract: [public-search](./contracts/public-search.md).

## 1. Automated

```sh
pnpm test:unit                 # query-embedder budget keys
pnpm test:int                  # public-search.int, search.int (migration)
pnpm test:search               # includes אמקה → AMKA
pnpm api:openapi && git diff --exit-code packages/api-client
pnpm test:e2e -- public.spec.ts
```

## 2. Demo 4

1. In the public deck, add a published card titled "AMKA" (with a short English description) in a public category. Wait for the embeddings worker (a few seconds).
2. Open `http://127.0.0.1:8080/p/our-street` in a private window; search `אמקה`. The AMKA card is in the first results; the page doesn't say "text matches only".
3. Search a word that appears only in the shared category's card: no results.
4. `curl 'http://127.0.0.1:3000/public/our-street/search?q=amka'`: JSON with the card and `why`.
5. Signed in as a member, submit the same search on the public page: the app's search opens with the query.

## 3. Caps

1. In the int test (lowered caps), the 31st new query from one IP returns `semantic: false`; a repeated query still returns `semantic: true` (cache).
2. `SELECT mode, user_id FROM search_queries ORDER BY created_at DESC LIMIT 5;` shows `public` rows with no user.

## 4. Deployed instance

1. Add the AMKA card to the deployed public deck (content task).
2. Repeat section 2 steps 2–3 from a phone on mobile data.
3. Tick demo 4 in `PLAN.md`.
