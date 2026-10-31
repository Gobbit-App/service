# Testing and test data

_Overview: [architecture.md](../architecture.md). Decisions: [adr.md](../adr.md)._

## Test Pyramid

### Unit tests

Location: `**/*.test.ts` (next to source)  
Environment: Node  
Test data: mocked/inline  
Examples:
- `@gobbit/shared/src/schemas/pagination.test.ts`: cursor encoding, Zod parse
- Service unit tests with mocked repos

### Integration tests

Location: `**/*.int.test.ts` (under `test/`)  
Environment: Node + Docker (Testcontainers PostgreSQL)  
Test data: built with `@gobbit/db/test` factories (`createSampleWorld()`)  
Examples:
- Repository tests (actual SQL via Drizzle)
- Service tests calling real repos
- API route tests via `setupApiTest()`

**Test isolation**: Each test file gets a fresh DB cloned from `template_pb`:
1. Global setup: creates template DB with all migrations
2. Per file: `withTestDb()` clones the template (fast), the file's tests run, the clone is dropped

### Search eval (`pnpm test:search`)

Location: `apps/api/test/*.search.test.ts` (vitest project `search`, excluded from `unit`)
Environment: Node + Docker (same template database as integration)
Test data: `searchCards` + `search-eval.json`, vectors from the committed `search-embeddings.json`
Gate: recall@5 ≥ 0.9 (see Search → Evaluation)

### E2E tests (smoke)

#### Choosing the tier: smoke vs full (constitution V, ADR-053)

Every feature and fix decides where its end-to-end coverage lives, records it in the plan ("E2E tier") and states it in the PR:

| Tier | Put it here when | Runs |
|------|------------------|------|
| `@smoke` (`e2e/tests/smoke/`) | It is on a critical journey (sign-in, reading a deck, creating or editing a card, photo upload, search, share/ingest submit, review publish), a regression would block core use, or it crosses a deployment boundary (proxy, CSP, env/secret, third-party call) | Every PR (planned, 010) and after every deploy; ≤ 5 min |
| `@full` (`e2e/tests/full/`) | Secondary paths, role variants, extra negatives and edge cases, async or costly third-party work, cross-browser and offline variants | Nightly (planned, 011); until then `pnpm test:e2e --grep @full` |
| none | Pure logic with no new UI or flow | Unit / integration tests only |

A bug that reached production gets its regression test at the tier and in the environment that would have caught it. Smoke tests are being rewritten as real-usage journeys (magic-link sign-in through a test mailbox, real `media/sign`, real worker; only third-party hosts faked on the PR stack): see [`specs/010-e2e-journeys`](../../specs/010-e2e-journeys/plan.md). The nightly full suite is outlined in [`specs/011-e2e-nightly`](../../specs/011-e2e-nightly/plan.md).

#### Current suite

Location: `e2e/tests/smoke/*.spec.ts`  
Environment: Playwright  
Base URL: `http://localhost:3000` (or BASE_URL env)  
Tagging: every test title includes `@smoke`

**Pre-test**: global-setup waits for `/health` to report `ok=true` and migration tag matching the latest journal entry — and, when `EXPECTED_SHA` is set (CI sets the triggering commit), `commit` equal to it, for up to 10 minutes while Dokploy pulls and restarts.

**API helpers**:
- `api`: request context carrying `Authorization: Bearer ${SMOKE_SESSION_TOKEN}` (locally the seeded owner session; deployed, a bearer minted with `/auth/token-exchange`)
- `anon`: request context with no credentials (401 checks)
- `smokeDeck`: creates a `smoke-<id>` deck before the test; afterwards removes its memberships and soft-deletes it
- The members spec invites the single standing user `smoke-invitee@example.test`; only its membership is cleaned up

**Search smoke (Phase 4)**: `search.spec.ts` checks three API cases: a phone number searched as digits without the dash, a query with no results, and the 400 for a blank `q`. `web.spec.ts` checks that typing in the search box opens `/search` with highlighted, tagged results, and checks the empty state.

**Browser smoke (`web-smoke` project, D62)**: `web.spec.ts`, `share.spec.ts` and `lifecycle.spec.ts` (Phase 6: demo 2 archive → Undo → search miss → restore → search hit; delete with confirm, Undo and Undelete; unavailable deck/card links) run in Chromium with a Pixel 7 viewport against `WEB_BASE_URL`. The browser is signed in by setting the `gobbit_session` cookie to the smoke token (sessions are looked up by token hash whatever the transport). Each test seeds a smoke deck with one card per type and checks: the deck list, no horizontal overflow at 360 px, the calc result, category switching via the URL, favorites surviving a reload, and the private share preview. The page itself never gets the bearer header.
## Seeding and test data (D49)

### Owner-only seed

`pnpm db:seed` (`packages/db/scripts/seed.ts` → `seed/run-seed.ts`) upserts exactly **one account and one user** — the owner — and nothing else. No decks, categories or cards are seeded; a fresh deployment starts empty.

- `SEED_OWNER_EMAIL` is required (the script exits non-zero without it); `SEED_OWNER_NAME` defaults to the email local part. Parsing lives in `seed/owner.ts` (`parseOwnerSeedEnv`).
- Ids are uuid v5 under `SEED_NAMESPACE` (`seedId('owner')` for the account, `seedId('owner/user')` for the user), so re-running upserts in place.
- Idempotent: `ON CONFLICT … DO UPDATE … WHERE … IS DISTINCT FROM`, so a second run with the same values leaves `updated_at` untouched; a changed name or email updates the row in place.
- Local development only: the script refuses `NODE_ENV=production` outright (Oct 1). A deployed instance is never seeded; the owner's first magic-link sign-in creates the user (D25).
- `SMOKE_SESSION_TOKEN` (D43, ≥32 chars) upserts one 365-day `bearer` session for the owner (`user_agent = 'smoke'`); re-running with a new token rotates it. No other users are seeded.

### Test factories (`@gobbit/db/test`)

Integration tests build their own data; nothing depends on seeded rows.

- `factories.ts`: `createAccountUser`, `createDeck` (the trigger adds `general`), `defaultCategory`, `createCategory`, `createItem` (runs the card through `itemCreateSchema`, links categories, defaults to `general`), `addFavorite`. Ids come from `fixtureId(key)` — uuid v5 under a separate `FIXTURE_NAMESPACE`.
- `fixtures/sample-cards.ts`: the 25 Phase 1 cards (`SampleCard`: `ItemCreate` + category slugs + status/lang/favorite), and `SAMPLE_CATEGORIES`. Its unit test pins the shape the suites rely on: 23 published + 2 archived, 12 food (all published), 2 table, 1 calc, 1 favorite, he/el/en.
- `sample-world.ts`: `createSampleWorld(db)` reproduces the Phase 1 layout — owner (`owner@example.test`) with decks `personal` (empty), `family` (six categories + the 25 cards), `scratch` (empty), and a second user (`other@example.test`) with `other-personal`. `apps/api/test/helpers.ts#setupApiTest()` builds it once per suite and exposes it as `world`.
