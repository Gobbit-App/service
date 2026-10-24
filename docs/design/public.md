# Public decks (Phase 8, `specs/016-public-read-api`, ADR-056)

A shared or communal deck can publish some of its categories to anyone. Strangers read them without
signing in; members keep using `/decks/...`.

## Making a deck public (D176)

- `PATCH /decks/{id}` with `isPublic` needs role `owner` (co-owners included). A maintainer gets 403
  `/problems/owner-required` but can still change the deck's other fields. The personal deck answers
  409 `/problems/personal-deck`.
- `PATCH /decks/{id}/categories/{categoryId}` (`category.update`: owner, maintainer) takes
  `{ name?, visibility? }`, strict, at least one field. The slug never changes, so public URLs stay
  stable. The default category can change visibility and stays the default.

## Deck rule and reads (D174)

- `public-deck.service.resolvePublicDeck(slug)`: the deck must be live, `is_public`, not `personal`
  and not the default (personal) deck. Everything else, an unknown slug included, is the member
  routes' 404 `"Deck not found"`, so the answer leaks nothing.
- Reads use the member repositories with `role = null`: `visibleCategoriesWhere(null)` keeps only
  `public` categories. The service fixes `status = 'published'` and live rows; the query can't change them.
- Routes (`routes/public.ts`, `security: []`, tag `public`):
  - `GET /public/{slug}`: `PublicDeck` with public categories and their published card counts
    (`categories.repo.countPublished`).
  - `GET /public/{slug}/items?category=&cursor=&limit=`: newest first, member cursor format,
    `limit` ≤ `PUBLIC_PAGE_LIMIT_MAX` (50). A category slug that isn't public is a 404
    `"Category not found"`.
  - `GET /public/{slug}/items/{itemId}`: one card; a hidden, foreign or malformed id is a 404
    `"Item not found"`.
- Every answer carries `Cache-Control: public, max-age=60`.

## DTO allow-list

`toPublicItem` (`services/public-dtos.ts`) copies only `id, type, title, body, payload, entities,
sourceUrl, verifiedAt, createdAt, updatedAt` and the card's public categories as `{ slug, name }`.
No author, favourite, status, deck id, link health or review/ingest fields. A unit test pins the key
set to `publicItemSchema`.

## Caller identity

`/public/*` is in `CREDENTIAL_FREE_PREFIXES`: session-auth doesn't look at the cookie or bearer, so a
member gets the stranger's answer and a stale or bad credential never fails the request.

## Anonymous limiter (D175)

`lib/anon-rate-limiter.ts`: an `lru-cache` of fixed one-hour windows per key (max 10,000 keys, TTL one
hour). `middleware/public-rate-limit.ts` applies it to `/public/*` keyed by
`clientIp(c, CLIENT_IP_HEADER)`, at `PUBLIC_READ_PER_HOUR` (600). Over the limit: 429
`/problems/rate-limited` with `Retry-After`. It never touches the database, and it is per API
instance (one instance today). The limiter is injectable through `createApp({ anonLimiter })`.

## Deviations from the 016 plan

- **404 body**: the contract shows `type: "about:blank"`. The routes use the existing `notFound()`
  problem (`/problems/not-found`), which is identical to the member routes' 404 as the research asks.
- **Credentials**: rather than marking `/public/` lenient for cookies only, session-auth skips
  `/public/*` entirely, so a bad bearer or an ingest token is ignored too (the contract's
  "a cookie or bearer sent anyway is ignored").
- **Tests**: the category PATCH and owner-only switch tests live in `test/public-settings.int.test.ts`,
  and the stale-cookie test in `test/public-read.int.test.ts`, rather than in `categories.int`,
  `decks.int` and `sessions.int`.
- **Deck rule**: the default deck is excluded as well as `kind = 'personal'`, matching
  `decks.service`'s personal-deck checks.
