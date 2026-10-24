# Quickstart: Public read API for public decks

Validates [spec.md](./spec.md) end to end. Setup per `README.md` (`pnpm dev`, a signed-in owner, `SMOKE_SESSION_TOKEN` for `api.http`). Contract: [public-api](./contracts/public-api.md).

## 1. Automated

```sh
pnpm test:unit                 # public-dtos, anon-rate-limiter
pnpm test:int                  # public-read.int, categories.int, decks.int, sessions.int
pnpm api:openapi && git diff --exit-code packages/api-client
pnpm test:e2e -- public.spec.ts
```

## 2. Demo 1 (PLAN.md Phase 8)

1. As the owner: `POST /decks { "name": "Our street", "kind": "communal" }`. Note the deck id and its `general` category.
2. Create categories `emergency`, `schools`, `services` (public) and `committee` (shared) with `POST /decks/{id}/categories`. Or create them as shared and switch three with `PATCH /decks/{id}/categories/{categoryId} { "visibility": "public" }`.
3. Add one published card to each category, and one card in both `schools` and `committee`.
4. `curl -i http://localhost:3000/public/our-street/items` (no cookie): 404, the deck isn't public yet.
5. `PATCH /decks/{id} { "isPublic": true }` as the owner. The same `curl` now lists four cards. The mixed card lists only `schools`. No response mentions `committee`.
6. `curl http://localhost:3000/public/our-street`: three categories with counts.
7. `curl http://localhost:3000/public/our-street/items/<committee-only card id>`: 404.
8. Invite a maintainer. As the maintainer, `PATCH /decks/{id} { "isPublic": false }`: 403 `owner-required`. Renaming a category works.
9. With an invalid `gobbit_session` cookie, `curl -b gobbit_session=bad …/public/our-street`: 200 and no `Set-Cookie`.
10. On the deployed instance (through Caddy at `/api/public/...`), repeat steps 4–7 from a phone on mobile data, and tick demo 1 in `PLAN.md`.

## 3. Limit

1. Start the API with `PUBLIC_READ_PER_HOUR` lowered in the test deps (int test) or loop `curl` 601 times locally: the 601st answers 429 with `Retry-After`.
2. From the same machine, a signed-in `GET /decks` still answers 200.
