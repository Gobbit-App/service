# Research: Public read API for public decks

Decisions continue the project-wide D numbering. Phase 8 reserves D174–D191. This feature owns **D174–D176**; D174 and D175 are recorded in **ADR-056** together with 017's and 018's public-surface decisions.

## What exists today

- **Visibility** (Phase 2, D38): every member read path filters categories with `visibleCategoriesWhere(role)`. The `null` branch (`visibility = 'public'`) was written for Phase 8 and has unit coverage but no caller.
- **Public flag**: `decks.is_public` exists. It is set on create or `PATCH /decks/{id}` (`deck.update`: owner, maintainer). Personal decks can't be public (409).
- **Share previews** (D58–D61): `/s/:itemId` already decides "public mode" with the same rule this feature uses: published, live, deck public, in a public category. In public mode the preview shows the real title, excerpt and image.
- **No anonymous JSON route** exists. Every `/decks` route needs a role, and "no role" is a 404.

## D174 — Public read surface

- **Decision**: three routes under `/public/{slug}`, served by a new `public-deck.service`:
  - `GET /public/{slug}`: `PublicDeck` (`{ slug, name, kind, categories: [{ slug, name, itemCount }] }`). Counts are published, live cards per public category.
  - `GET /public/{slug}/items?category=&cursor=&limit=`: `PublicItemPage`, newest first, the same cursor format as the member list. `category` is a public category slug; any other slug is a 404, the same as an unknown one.
  - `GET /public/{slug}/items/{itemId}`: one `PublicItem`.
- **Deck rule** (`resolvePublicDeck(slug)`): live, `is_public = true` and `kind <> 'personal'`. Otherwise one 404 problem, `"Deck not found"`, identical to the member routes' 404 so the answer leaks nothing.
- **Reading**: the existing repositories with `role = null`. Their `role` parameter widens to `MemberRole | null`, which `visibleCategoriesWhere` and `itemHasVisibleCategory` already accept. `status = 'published'` and `deleted_at IS NULL` are fixed by the service, not taken from the query.
- **DTO** (`toPublicItem`, an allow-list): `id, type, title, body, payload, entities, sourceUrl, verifiedAt, createdAt, updatedAt, categories` (public ones only, `{ slug, name }`). Left out: `createdBy`, `favorite`, `status`, `linkHealth`, `deckId` (the slug is the public handle), and every review or ingest field.
- **Caller**: the routes never read `c.var.user`. A member sees the stranger's view here and uses `/decks/...` (or 017's "open in app") for their own. This keeps the answer cacheable and the code free of per-user branches.
- **Headers**: `Cache-Control: public, max-age=60`. JSON changes as soon as a card is published, so a short browser cache is enough; 017's pages carry their own cache.
- **Rationale**: the role-null branch reuses the one tested visibility filter instead of writing a second "public" query. An allow-list DTO is the safest default for the first anonymous surface. Slugs are the public handle because they are readable and already unique among live decks.
- **Alternatives considered**:
  - **Reuse `/decks/{id}/items` with an optional user**: every service method would need a "no user" branch, and a mistake there exposes member data. Rejected.
  - **A separate `public_items` view or table**: duplicates the visibility rule in SQL and needs syncing. Rejected.
  - **Personalised public answers for members** (showing their private categories at `/public`): breaks caching and blurs which view is which. 017 sends members to the app instead (D178).
  - **Hiding the deck when it has no public categories**: admins couldn't check the address before choosing categories, and "empty" leaks nothing.

## D175 — Anonymous read limiter

- **Decision**: `lib/anon-rate-limiter.ts`, an in-process fixed one-hour window per client IP, held in an `lru-cache` (max 10,000 IPs, TTL one hour). `PUBLIC_READ_PER_HOUR = 600` in `@gobbit/shared` limits. Over the limit: 429 problem with `Retry-After` from `retryAfterSeconds()`. A middleware applies it to `/public/*` (016) and to 017's page routes; 018's search adds its own, lower bucket on the same limiter.
- The IP comes from `clientIp(c, env.CLIENT_IP_HEADER)`, the same as magic-link limits.
- **Rationale**: the DB-backed `rate-limit.service` writes a row per counted request. That is right for expensive or security-relevant actions (sign-in, embeddings), but it would turn every anonymous page view into a database write and defeat 017's page cache. One API instance runs today, so an in-process counter is exact.
- **Alternatives considered**:
  - **DB-backed limiter**: correct across instances, but a write per anonymous read. Rejected for reads; 018 still uses it for the paid embedding call.
  - **Caddy or Cloudflare rate limiting**: needs a Caddy plugin or a paid rule; Phase 11 reconsiders it together with burst limits.
  - **No limit until Phase 11**: the public routes are the first unauthenticated database reads; a basic ceiling is cheap.

## D176 — Category PATCH and owner-only public switch

- **Decision**:
  - `PATCH /decks/{id}/categories/{categoryId}` with `{ name?, visibility? }` (strict, at least one field). Permission `category.update` (owner, maintainer). The slug doesn't change on rename: public category URLs (017) and member deep links stay stable. The default category can change visibility but stays the default.
  - `PATCH /decks/{id}` with `isPublic` now needs role `owner` (co-owners included). A maintainer gets 403 `/problems/owner-required`. Other deck fields keep `deck.update`.
  - `/public/` joins `LENIENT_PREFIXES`, so a stale cookie never blocks a public read.
- **Rationale**: demo 1 asks to "mark three categories public" on an existing deck; today visibility can only be set at creation. Making a deck public exposes content to the internet, which is a deck-level decision like inviting members (`member.invite` is owner-only).
- **Alternatives considered**:
  - **A new `deck.publish` permission**: one more matrix row for one field. The check is a role comparison in the service; revisit if more owner-only fields appear.
  - **Slug follows the name on rename**: breaks shared public links.
