# Implementation notes: 016-public-read-api

Plan: `specs/016-public-read-api/plan.md`, tasks: `tasks.md`. Branch `worktree-phase8-016-public-read-api`.

No migration, queue or env var. E2E tier: smoke (`e2e/tests/smoke/public.spec.ts`).

## Decisions not specified by the plan

- **`isPublicDeck(deck)`** also excludes the default deck (`isDefault`), not only `kind = 'personal'`.
- **`categories.repo.countPublished(deckId, role)`** returns a `Map<categoryId, count>` of published, live cards per visible category; the summary drops categories the role can't see.
- **`CREDENTIAL_FREE_PREFIXES = ['/public/']`** in session-auth: the middleware returns before reading any credential, so a cookie, a bad bearer and an ingest token are all ignored (the routes never read the user anyway).
- **`AppDeps.anonLimiter`** makes the limiter injectable; the integration test uses a composite limiter (a low limit for one IP range) with `CLIENT_IP_HEADER` set.
- **Category PATCH**: an unknown or foreign category is a 404 `"Category not found"` via `categories.repo.findExistingIds` with the caller's role.

## Deviations from the plan

- **404 body**: the contract shows `type: "about:blank"`; the routes use `notFound()` (`/problems/not-found`), identical to the member 404 as research D174 asks.
- **T012**: the stale-cookie test is in `test/public-read.int.test.ts`, not `sessions.int.test.ts`; T020/T021 are in a new `test/public-settings.int.test.ts`, not `categories.int` / `decks.int`.
- **T054/T055**: the PLAN demo is not ticked; quickstart step 10 needs the deployed instance.
