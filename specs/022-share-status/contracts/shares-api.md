# Contract: shares API and deck setting

All JSON; errors are `application/problem+json` (RFC 9457). Session or bearer auth. `ing_` ingest tokens are **not** accepted (ADR-046). DTOs live in `packages/shared/src/schemas/share.ts`; `pnpm api:openapi` regenerates `@gobbit/api-client`.

## `GET /decks/{idOrSlug}/shares`

The caller's own shares on the deck.

- **Access**: member with `deck.read`. A deck the caller can't see → 404 `/problems/not-found`.
- **Rows**: `user_id = caller`, `channel IN shareChannels`, `created_at ≥ now − 30 days`, newest first, at most `SHARES_LIST_LIMIT` (50).
- **200**: `{ shares: ShareSummary[] }`. An empty list is `{ shares: [] }`.

## `GET /shares/{id}`

- **Access**: only the sharer (`job.user_id = caller`) who is still a member of the deck. Otherwise 404 (no existence leak).
- **200**: `ShareSummary`.

## `POST /shares/{id}/retry`

- **Access**: as `GET /shares/{id}`, plus `item.create` on the deck now. Missing → 403 `/problems/forbidden`.
- **Body**: none.
- **202**: `ShareSummary` (state `processing`).
- **Errors**:
  - 404: not found, or not the sharer.
  - 409 `/problems/share-not-failed`: the job is not `failed`. A double tap resolves here.
  - 410 `/problems/share-expired`: `raw` is gone (past retention). The client shows "Paste it again".
  - 422 `/problems/share-retry-limit`: `retry_count ≥ 3`.
  - 429 `/problems/rate-limited`: daily cap reached (same `rateLimited()` as `POST /ingest`).

## `PATCH /decks/{id}` (changed)

- `DeckPatch` gains `autoPublishShares?: boolean`.
- A change by a non-owner → 403 `/problems/owner-required` (same as `isPublic`, D176). `ownerRequired()` gains a `detail` argument so its message stops saying "public".
- Allowed on the personal deck.
- `Deck` gains `autoPublishShares: boolean`.

## `POST /ingest` (changed response)

- **Unchanged**: the 202 body still carries `id` (job id). The web now uses it to open `GET /shares/{id}` on the Sent screen.

## Worker log lines (operator contract, D195)

| Level | Message | Fields |
|-------|---------|--------|
| warn | `ingest attempt failed, will retry` | `jobId`, `attempts`, `failureCode` |
| error | `ingest job failed` | `jobId`, `deckId`, `channel`, `attempts`, `failureCode` |
| warn | `ingest auto-publish failed` | `jobId`, `deckId` |

These lines never contain shared text, URLs, titles, tokens or provider responses.
