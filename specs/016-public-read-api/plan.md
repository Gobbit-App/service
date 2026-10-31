# Implementation Plan: Public read API for public decks

**Branch**: `016-public-read-api` | **Date**: 2026-10-23 | **Spec**: [spec.md](./spec.md) | **Roadmap**: `PLAN.md` § Phase 8 (demo 1)

**Input**: Feature specification from `/specs/016-public-read-api/spec.md`

Project override of the core template. Written for outside readers: the repository is public.

## Summary

**Public read.** Three anonymous JSON routes serve a public deck:

- `GET /public/{slug}`, `GET /public/{slug}/items` and `GET /public/{slug}/items/{itemId}`.
- A new `public-deck.service` resolves the deck (public, not personal, not deleted, else 404) and reads with `role = null`. `visibleCategoriesWhere(null)` already means "public categories only" (D38), so the existing repositories do the filtering once their `role` parameter accepts `null`.
- Results map to a new `PublicItem` DTO with no member data (D174).
- The routes never look at the caller. A signed-in member gets the stranger's view (D174).

**Settings.** `PATCH /decks/{id}/categories/{categoryId}` renames a category and changes its visibility (`category.update`). Changing `isPublic` through `PATCH /decks/{id}` now needs the `owner` role (D176).

**Limits.** Anonymous reads go through an in-process, per-IP fixed-window limiter, 600 requests an hour (D175). `/public/` joins the session middleware's lenient prefixes.

The public surface (016–018) is recorded in **ADR-056**.

## Starting point

- `main @ a980598` (Phase 7 merged).
- Access:
  - `access/visibility.ts`: `visibleCategoriesWhere(role: MemberRole | null)` returns `visibility = 'public'` for `null`. `itemHasVisibleCategory(role)` is used by item lists.
  - `authorize()` maps "no role" to 404 (ADR-004); `can()` uses `PERMISSION_MATRIX` (`category.update`: owner, maintainer; `deck.update`: owner, maintainer).
- Repositories:
  - `categories.repo.listByDeck(deckId, role: MemberRole)`, `findBySlug(deckId, slug, role)`; no update method.
  - `items.repo.list(q)` with `filterConditions(q)` (deck, role, category); keyset cursor on `(created_at, id)`.
  - `decks.repo.findBySlug(slug)` returns live decks.
- Deck rules: `decks.service.update` refuses `isPublic` on personal decks (409 `/problems/personal-deck`); `isPublic` and `kind` are set on create.
- Share previews (`share/mode.ts`): a card is "public" when published, live, `deck.isPublic` and in a public category. 016 uses the same rule for the read surface.
- Middleware: `session-auth.ts` `LENIENT_PREFIXES = ['/s/']`; `lib/client-ip.ts` `clientIp(c, env.CLIENT_IP_HEADER)`; `rate-limit.service` is DB-backed with hourly windows (`rate-window.ts`).
- Routes: `routes/categories.ts` has GET and POST only. No `/public` routes exist.
- e2e: `e2e/fixtures/api.ts` provides an `anon` request context.

## Technical Context

**Language/Version**: TypeScript (strict, ESM, no build step) on Node ≥ 22

**Primary Dependencies**: Hono + `@hono/zod-openapi`, Drizzle, `lru-cache` (already a dependency). No new dependencies.

**Storage**: PostgreSQL 17. No migration: the visibility, deck and category columns already exist.

**Testing**: Vitest unit; integration with Testcontainers; Playwright `@smoke`

**E2E tier**: smoke — anonymous reading of a public deck is the phase's critical journey and a privacy boundary: a leak of a non-public category must fail every PR (constitution V). One smoke test: create a deck, make it public with one public and one shared category, read anonymously, assert the shared card is absent.

**Target Platform**: Docker Compose on Dokploy; one API instance

**Project Type**: pnpm monorepo — API, PWA, shared packages

**Performance Goals**: list of 50 cards < 200 ms; one extra category query per page

**Constraints**: never leak non-public categories, member data or non-published cards; same 404 for every "not public" reason; anonymous reads never write to the database

**Scale/Scope**: a few public decks, up to a few thousand public cards, low anonymous traffic before the community launch

## Constitution Check

| Principle | How this plan complies |
|-----------|------------------------|
| I. Layered API | `routes/public.ts` (parse, headers) → `public-deck.service` (deck rule, DTO) → existing repositories with `role: null`; `categories.service.update` for the new PATCH |
| II. One source of truth | `PublicDeck`, `PublicItem`, `PublicItemPage`, `CategoryPatch` schemas in `@gobbit/shared`; OpenAPI regenerated |
| III. Invariants in the DB | Visibility is already enforced in SQL (`visibleCategoriesWhere`); the personal-deck rule stays in the service and the existing CHECKs; no new invariant needs a constraint |
| IV. Private by default | `role = null` is the narrowest view; the DTO is an allow-list; the same 404 for every reason; no cookies read; per-IP limit |
| V. Tests at the right tier | Unit (DTO allow-list, limiter), int (access matrix incl. leak cases), smoke (anonymous read of a public deck) |
| VI. Lean web | No web change (019 adds screens) |
| VII. Simple, optional | No dependency, no env var; the limiter is in-process |

No violations.

## Decisions this plan pins down

Full reasoning in [research.md](./research.md).

| ID | Decision | ADR? |
|----|----------|------|
| D174 | Public read surface: `GET /public/{slug}`, `/items`, `/items/{itemId}`; deck must be `isPublic`, not personal, live, else one 404; reads with `role = null`; `PublicItem` allow-list DTO (no author, favourite, link health, review/ingest data; only public categories); caller identity ignored; `Cache-Control: public, max-age=60` | yes → **ADR-056** |
| D175 | Anonymous read limiter: in-process LRU of per-IP fixed one-hour windows, 600/hour (`PUBLIC_READ_PER_HOUR`), shared by 016–018's anonymous routes; 429 `Retry-After`; never touches the DB; members on `/decks` unaffected | yes → **ADR-056** |
| D176 | `PATCH /decks/{id}/categories/{categoryId}` `{ name?, visibility? }` with `category.update`; changing `deck.isPublic` needs `owner` (403 `/problems/owner-required` for a maintainer); `/public/` added to `LENIENT_PREFIXES` | no |

## Project Structure

### Documentation (this feature)

```text
specs/016-public-read-api/
├── spec.md
├── checklists/requirements.md
├── plan.md
├── research.md
├── data-model.md
├── contracts/public-api.md
├── quickstart.md
├── tasks.md
└── implementation-notes.md   # created during /speckit-implement
```

### Source Code (repository root)

```text
packages/shared/src/
├── schemas/public.ts                        # NEW: publicDeckSchema, publicItemSchema, publicItemPageSchema, publicItemListQuerySchema
├── schemas/category.ts                      # + categoryPatchSchema
├── limits.ts                                # + PUBLIC_READ_PER_HOUR
└── index.ts                                 # exports

apps/api/src/
├── access/visibility.ts                     # unchanged (role null already handled); doc comment
├── repositories/categories.repo.ts          # role: MemberRole | null; + countPublished(deckId, role); + update(id, patch)
├── repositories/items.repo.ts               # role: MemberRole | null in list/findVisible
├── services/public-deck.service.ts          # NEW: resolvePublicDeck, summary, list, get
├── services/public-dtos.ts                  # NEW: toPublicItem (allow-list), public categories only
├── services/categories.service.ts           # + update(user, deck, categoryId, patch)
├── services/decks.service.ts                # isPublic change needs owner
├── services/index.ts                        # wire public-deck.service + limiter
├── lib/anon-rate-limiter.ts                 # NEW: in-process per-IP fixed window (lru-cache)
├── middleware/public-rate-limit.ts          # NEW: applies the limiter to anonymous public routes
├── middleware/session-auth.ts               # LENIENT_PREFIXES + '/public/'
├── errors/http-errors.ts                    # + ownerRequired()
├── routes/public.ts                         # NEW: three GET routes (OpenAPI, security: [])
├── routes/categories.ts                     # + PATCH /decks/{id}/categories/{categoryId}
└── app.ts                                   # registerPublicRoutes
apps/api/test/
├── public-read.int.test.ts                  # NEW: access matrix, leaks, pagination, headers
├── categories.int.test.ts                   # + PATCH cases
└── decks.int.test.ts                        # + isPublic owner-only
e2e/tests/smoke/public.spec.ts               # NEW @smoke
api.http                                     # + public requests
```

**Structure Decision**:

- The public service is separate from `items.service` because it has no actor and no permissions, only the deck rule. Mixing it into the member paths would make "no user" a special case everywhere.
- The DTO mapper is an allow-list, so a new member-only field added to `Item` later doesn't leak by default.
- The limiter is a middleware on the `/public` prefix (and 017's page routes), not a service call, because it guards requests, not business actions.

## Invariant → test traceability

| Invariant / rule | Enforced in | Test (file, tier) |
|------------------|-------------|-------------------|
| FR-001 anonymous summary, list, card | `routes/public.ts` + `public-deck.service` | `public-read.int.test.ts` (int: no cookie → 200 for each route) |
| FR-002 deck rule, one 404 | `public-deck.service.resolvePublicDeck` | `public-read.int.test.ts` (int: private, personal, deleted, unknown → identical problem bodies) |
| FR-003 only published, live cards in a live public category; only public categories listed | `visibleCategoriesWhere(null)` + repos + `toPublicItem` | `public-read.int.test.ts` (int: proposed, archived, deleted, shared-only, private-only absent; mixed card lists one category; deleted public category hides its cards) |
| FR-004 DTO allow-list | `public-dtos.toPublicItem` | `public-dtos.test.ts` (unit: output keys exactly the allow-list); `public-read.int.test.ts` (int: no `createdBy`/`favorite`/`linkHealth` keys) |
| FR-005 same answer when signed in | routes ignore `c.var.user` | `public-read.int.test.ts` (int: owner cookie → byte-identical JSON to anonymous) |
| FR-006 owner-only public switch; category PATCH roles | `decks.service.update`, `categories.service.update` | `decks.int.test.ts`, `categories.int.test.ts` (int: owner ✓, co-owner ✓, maintainer 403 on `isPublic`, maintainer ✓ on category, editor/reader 403, personal 409) |
| FR-007 per-IP hourly limit; members unaffected | `anon-rate-limiter` + `public-rate-limit` | `anon-rate-limiter.test.ts` (unit: window roll-over, eviction); `public-read.int.test.ts` (int: limit lowered via deps → 429 + `Retry-After`; `/decks` call from same IP 200) |
| FR-008 cacheable | `routes/public.ts` | `public-read.int.test.ts` (int: `Cache-Control: public, max-age=60`) |
| Stale cookie ignored on `/public/` | `LENIENT_PREFIXES` | `sessions.int.test.ts` (int: bad cookie → 200, cookie not cleared) |
| Privacy boundary on every PR | — | `e2e/tests/smoke/public.spec.ts` (e2e:smoke) |

## Rollout

- **Migrations**: none.
- **Env / config**: none. README: the public routes, the limit, and how to make a deck public (`PATCH /decks/{id}` as owner, then `PATCH …/categories/{categoryId}`).
- **API client**: `pnpm api:openapi` (three public routes, category PATCH).
- **Deploy order / flags**: no flag. Nothing is public until an owner flips `isPublic` and a category is `public`. Existing public decks (if any were marked public for share previews) become readable at `/public/<slug>`; check `SELECT slug FROM decks WHERE is_public` before deploying and note the result in implementation-notes.md.

## Risks

| Risk | Likelihood / impact | Mitigation |
|------|---------------------|------------|
| A repository path forgets the visibility filter and leaks a card | L / H | Every public read goes through `itemHasVisibleCategory(null)`; the int test seeds one card per leak case; the smoke test runs on every PR |
| A later field on `Item` leaks through the public DTO | M / M | Allow-list mapper + exact-keys unit test |
| In-process limiter resets on restart or differs per instance | M / L | One API instance today; ADR-056 notes the limit is per instance; Phase 11 revisits with burst limits |
| `CLIENT_IP_HEADER` unset behind the proxy: every visitor shares one IP | M / M | Already required in deployment for magic-link limits; quickstart checks two IPs get separate counters |
| Making a family deck public by mistake | L / H | Owner-only switch; 019 adds a confirmation in the UI |

## Settle before starting

- [ ] Is 600 anonymous requests per IP per hour right for the first community (shared NATs in schools)?
- [ ] Should `shared` decks be allowed to be public at all, or only `communal`? The plan keeps today's rule (any non-personal deck) and lets 017 decide indexing by kind (D179).
- [ ] Confirm PLAN.md Gate B is satisfied before implementing (owner's call).

## Complexity Tracking

None.
