# Implementation notes: 017-public-pages

Plan: `specs/017-public-pages/plan.md`, tasks: `tasks.md`. Branch `phase8-017-public-pages`, stacked on 016 (`worktree-phase8-016-public-read-api`).

No migration, queue or env var. New dependency: `micromark` (API only). E2E tier: smoke (`e2e/tests/smoke/public.spec.ts`).

## Decisions not specified by the plan

- **`public/responses.ts`**: a `PageResponse` (`status`, `html`, `headers`) built by `htmlPage`, `redirect`, `notFound` and `badRequest`, so the service decides status and caching and the route only sends it.
- **`public-deck.service`** exposes `summaryFor(deck)` and `listFor(deck, query)` taking an already resolved deck; `summary(slug)` and `list(slug, q)` delegate to them, so pages don't resolve the deck twice.
- **`share.service`** gained `publicTarget(itemId)` (the `/p/` URL for a public card in a non-personal deck, else null), `ogImageFor(itemId)`, `imageUrl(publicId, transformation)`, `siteImageUrl` and `origin`; card pages reuse the share image pipeline.
- **`purgeDeck`** is an optional dependency (default no-op) of the items, categories, decks and review services and of the ingest wiring; `buildServices` binds it to the one page cache.
- **`publicRateLimit({ onLimited })`**: `/p/*` answers an HTML 429 (`no-store`, `Retry-After`, `noindex`) instead of the problem JSON.
- **Lenient paths**: `/sitemap.xml` and `/robots.txt` are lenient paths, and `/p/` is a lenient prefix (not credential-free), because member detection needs the session.

## Deviations from the plan

- **Sitemap queries**: a dedicated `repositories/sitemap.repo.ts` instead of `public-deck.service.sitemapEntries`/`lastChanged`.
- **Cache contents**: only 200 pages are cached; 404s are not (a probe could fill the cache).
- **Sitemap and robots** are neither cached in-process nor rate-limited.
- **Limiter**: `/p/*` and `/public/*` share one per-IP budget.
- **Service worker and Vite proxy**: added a navigation denylist for `/p/`, `/sitemap.xml` and `/robots.txt` in `apps/web/src/sw.ts` and a dev proxy entry in `vite.config.ts`; without them the installed PWA serves the SPA shell for public links.
- **Purge coverage**: link-snapshot updates run in the worker process and can't reach the API's in-process cache (the 5-minute TTL bounds staleness); review discard doesn't purge (proposals are never public); there is no category delete to hook.
- **Bad bearer on `/p/`**: still a 401 problem, like other lenient paths (only a stale cookie is forgiven).
- **T021**: `share.int.test.ts`'s "renders a public card once and reuses the image" case moved to the `/p/` card page, since `/s/` now redirects public cards.
- **T031**: the smoke check that "deck page counts differ from the app's" is expressed as "the deck page shows the public card and not the shared one".
- **T054–T056**: not run; the PLAN demos and quickstart need the deployed instance.
