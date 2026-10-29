# Implementation Plan: Server-rendered public pages

**Branch**: `017-public-pages` | **Date**: 2026-10-23 | **Spec**: [spec.md](./spec.md) | **Roadmap**: `PLAN.md` § Phase 8 (demos 2, 3)

**Input**: Feature specification from `/specs/017-public-pages/spec.md`

Project override of the core template. Written for outside readers: the repository is public.

## Summary

**Pages.** The API renders HTML for `/p/{slug}`, `/p/{slug}/c/{category}` and `/p/{slug}/i/{itemId}` from 016's `public-deck.service`:

- Templates use `hono/html` tagged templates, which escape every interpolation. No JSX, no client script, one inline stylesheet.
- Card bodies render through `micromark` (CommonMark, raw HTML off, unsafe link protocols dropped). Each card type has a small renderer; calculators show the default result computed with `@gobbit/shared/calc` (D177).
- Every page carries OG/Twitter tags. Card pages reuse the share pipeline's image (the card's own image or the generated OG image, D60). Page language and direction come from `htmlLang()` on the content (D177).
- A `publicUrl(deck, path)` helper builds every absolute URL, so Phase 12 can switch it to a deck's own domain in one place.

**Members.** A request whose session has a role on the deck gets a 302 to the matching PWA route, unless `?view=public`. Responses vary by cookie (D178).

**Indexing.** Communal decks are indexable and listed in `/sitemap.xml`; shared decks are `noindex`. `/robots.txt` is served by the API (D179).

**Caching.** An in-process LRU page cache keyed by a per-deck generation. Writes that change public content bump the generation after commit. Browsers and crawlers get `public, max-age=300` (D180).

**Share links.** `/s/{id}` for a public card redirects to `/p/{slug}/i/{id}` (D181).

**Proxy.** Caddy routes `/p/*`, `/sitemap.xml` and `/robots.txt` to the API.

## Starting point

- `016-public-read-api` merged: `public-deck.service` (`resolvePublicDeck`, `summary`, `list`, `get`), `toPublicItem`, `anon-rate-limiter` + `public-rate-limit` middleware.
- Share previews (`apps/api/src/share/`): `share.service` with `origin` (from `APP_URL`), `publicMeta` and `generatedImageUrl(itemId, content)`; `share-page.ts` renders by string concatenation with `escapeHtml`; `excerpt.ts` (`stripMarkdown`, `excerpt`, `OG_DESCRIPTION_MAX = 160`); `mode.ts` decides public mode. `/s/:itemId` sets `public, max-age=300` and `X-Robots-Tag: noindex`.
- `@gobbit/shared` `utils/text-script.ts`: `htmlLang`, `ogLocale`, direction helpers.
- `@gobbit/shared/calc`: the calculator engine the PWA uses.
- Web: PWA routes `/d/$slug`, `/d/$slug/c/$category`, `/i/$itemId`; `/sign-in?next=` (D66, `safeNext`).
- Caddy (`apps/web/Caddyfile`): `/api/*` (stripped) and `/s/*` go to the API; everything else is the SPA.
- No `micromark` dependency yet; the PWA uses `react-markdown` (which wraps micromark via mdast).

## Technical Context

**Language/Version**: TypeScript (strict, ESM, no build step) on Node ≥ 22

**Primary Dependencies**: Hono (`hono/html`), `micromark` (new, small, no dependencies beyond its own packages; already in the web bundle through `react-markdown`), `lru-cache` (existing)

**Storage**: PostgreSQL 17. No migration.

**Testing**: Vitest unit (templates, renderers, cache, redirects); integration with Testcontainers (routes, headers, redirects, sitemap, purge); Playwright `@smoke`

**E2E tier**: smoke — the public page and the member redirect are the phase's critical journeys (demos 2, 3). One smoke test: anonymous `curl`-style fetch of a card page (content, OG tags, no `<script>`), then the same URL with a member session → 302 to the app.

**Target Platform**: Docker Compose on Dokploy; Caddy in front; one API instance

**Project Type**: pnpm monorepo — API, PWA, shared packages

**Performance Goals**: cached page < 50 ms server time; uncached < 300 ms; HTML + CSS < 30 KB

**Constraints**: no JavaScript on public pages; every interpolation escaped; markdown without raw HTML; CSP unchanged (inline styles are already allowed); no personal data in cached pages

**Scale/Scope**: a few public decks, a few thousand cards, crawler traffic from one or two search engines and chat apps

## Constitution Check

| Principle | How this plan complies |
|-----------|------------------------|
| I. Layered API | `routes/public-pages.ts` (parse, headers, redirects) → `public-pages.service` (compose, cache) → 016's `public-deck.service` → repositories |
| II. One source of truth | Pages read the same `PublicDeck`/`PublicItem` DTOs as the JSON API; calc results from `@gobbit/shared/calc` |
| III. Invariants in the DB | Visibility stays in SQL (016); no new data |
| IV. Private by default | Pages built only from `PublicItem`; member redirects are `private, no-store`; cache keyed without user data; shared decks `noindex` |
| V. Tests at the right tier | Unit (escaping, markdown safety, renderers, cache), int (routes, redirects, sitemap, purge), smoke (demos 2, 3) |
| VI. Lean web | No PWA change; public pages ship no JavaScript and < 30 KB |
| VII. Simple, optional | One small dependency; no env var (`APP_URL` already required in production) |

No violations.

## Decisions this plan pins down

Full reasoning in [research.md](./research.md).

| ID | Decision | ADR? |
|----|----------|------|
| D177 | SSR with `hono/html` (auto-escaped), one inline stylesheet, no JS; `micromark` with HTML off for bodies; per-type renderers (calc default result server-side); OG/Twitter tags reuse the share OG image; `lang`/`dir` from `htmlLang`; `publicUrl(deck, path)` builds every absolute URL; card permalinks resolve by id and 301 to the current deck slug | yes → **ADR-056** |
| D178 | A session with a role on the deck → 302 to the PWA route (`/d/{slug}`, `/d/{slug}/c/{cat}`, `/i/{id}`) unless `?view=public`; redirects `private, no-store`; pages `Vary: Cookie`; "Open in app" → `/sign-in?next=` | yes → **ADR-056** |
| D179 | Indexing by kind: communal = indexable + `/sitemap.xml` (`lastmod`), shared = `noindex` (meta + `X-Robots-Tag`); `/robots.txt` from the API disallows `/api/`, `/s/`, `/d/`, `/i/`, `/settings`, `/share`, `/sign-in`, `/p/*/search` | yes → **ADR-056** |
| D180 | In-process page cache (`lru-cache`, 500 entries, 5 min TTL) keyed `generation:path?query`; `publicCache.purgeDeck(deckId)` bumps the deck's generation after commit from item, review, category and deck writes; HTTP `public, max-age=300` | no |
| D181 | `/s/{id}` in public mode → 302 to `/p/{slug}/i/{id}`; private mode unchanged | no |

## Project Structure

### Documentation (this feature)

```text
specs/017-public-pages/
├── spec.md
├── checklists/requirements.md
├── plan.md
├── research.md
├── data-model.md
├── contracts/public-pages.md
├── quickstart.md
├── tasks.md
└── implementation-notes.md   # created during /speckit-implement
```

### Source Code (repository root)

```text
apps/api/src/
├── public/
│   ├── layout.ts                 # NEW: html shell (head, OG tags, inline CSS, lang/dir, robots meta)
│   ├── styles.ts                 # NEW: the inline stylesheet (one string)
│   ├── pages.ts                  # NEW: deckPage, categoryPage, itemPage, notFoundPage, rateLimitedPage
│   ├── render-item.ts            # NEW: per-type renderers (text, link, image, table, calc)
│   ├── markdown.ts               # NEW: micromark wrapper (html off, safe protocols)
│   ├── public-url.ts             # NEW: publicUrl(deck, path), appPath(target)
│   ├── seo.ts                    # NEW: robotsFor(deck), sitemap XML, robots.txt
│   └── page-cache.ts             # NEW: generation-keyed LRU, purgeDeck
├── services/public-pages.service.ts   # NEW: compose pages from public-deck.service + share image; member check
├── services/public-deck.service.ts    # + itemById(itemId) (any public deck), sitemapEntries()
├── services/items.service.ts          # purge after commit
├── services/review.service.ts         # purge after commit
├── services/categories.service.ts     # purge after commit
├── services/decks.service.ts          # purge after commit
├── share/share.service.ts             # expose ogImageFor(item); public mode → redirect target
├── routes/public-pages.ts             # NEW: /p/*, /sitemap.xml, /robots.txt (not in OpenAPI)
├── routes/share.ts                    # 302 in public mode
├── middleware/session-auth.ts         # LENIENT_PREFIXES + '/p/'; LENIENT_PATHS + sitemap, robots
└── app.ts                             # registerPublicPageRoutes; rate limit on /p/*
apps/api/test/public-pages.int.test.ts # NEW
apps/web/Caddyfile                     # handle /p/*, /sitemap.xml, /robots.txt → API
e2e/tests/smoke/public.spec.ts         # + page and member redirect
```

**Structure Decision**:

- Rendering lives in `apps/api/src/public/` next to `share/`, not in the PWA, because the pages must work without JavaScript and must be produced by the server that enforces visibility.
- `hono/html` instead of extending `share-page.ts`'s string concatenation: auto-escaping removes the "forgot to escape" class of bug across many templates. `share-page.ts` stays as is.
- The page cache sits in the service, not as HTTP middleware, so the member check runs before it and the cache never stores a redirect.

## Invariant → test traceability

| Invariant / rule | Enforced in | Test (file, tier) |
|------------------|-------------|-------------------|
| FR-001 pages follow 016's rules | `public-pages.service` reads only `public-deck.service` | `public-pages.int.test.ts` (int: shared-only card page 404; private deck 404; category page lists public cards only) |
| FR-002 no script | `layout.ts` | `pages.test.ts` (unit: no `<script` in any page); smoke |
| FR-003 escaping, safe markdown | `hono/html`, `markdown.ts` | `markdown.test.ts` (unit: raw HTML escaped, `javascript:` dropped); `render-item.test.ts` (unit: each type; title with `<b>` escaped) |
| FR-004 preview tags | `layout.ts` + share image | `pages.test.ts` (unit: og:title/description/image/url, twitter:card); smoke |
| FR-005 language and direction | `htmlLang` | `pages.test.ts` (unit: Hebrew card → `lang="he" dir="rtl"`) |
| FR-006 member redirect, `?view=public` | `public-pages.service` + route | `public-pages.int.test.ts` (int: member 302 to each app path, `no-store`; non-member signed in → page; `?view=public` → page); smoke |
| FR-007 indexing by kind | `seo.ts` | `public-pages.int.test.ts` (int: sitemap has communal pages only; shared deck `X-Robots-Tag: noindex`); `seo.test.ts` (unit: robots.txt lines, XML escaping) |
| FR-008 cacheable, fresh within 5 min | `page-cache.ts` + purge calls | `page-cache.test.ts` (unit: TTL, generation bump); `public-pages.int.test.ts` (int: edit → next request shows the change; `Cache-Control`, `Vary: Cookie`) |
| FR-009 share redirect | `routes/share.ts` | `share.int.test.ts` (int: public → 302 `/p/…`; private → page as today) |
| FR-010 stable card URLs | `itemPage` 301 | `public-pages.int.test.ts` (int: old slug → 301 to current; wrong public deck → 301; non-public deck → 404) |
| Limit applies to pages | `public-rate-limit` on `/p/*` | `public-pages.int.test.ts` (int: lowered limit → 429 HTML page with `Retry-After`) |

## Rollout

- **Migrations**: none.
- **Env / config**: none new. `APP_URL` is the public origin (already required in production for share previews).
- **API client**: no change (pages are outside OpenAPI).
- **Deploy order / flags**: API and web images deploy together (the Caddyfile change routes `/p/*`). Until a deck is public every `/p/…` answers 404. After deploy, submit `/sitemap.xml` in Google Search Console (owner action, noted in README).

## Risks

| Risk | Likelihood / impact | Mitigation |
|------|---------------------|------------|
| XSS through card content on a public origin | L / H | `hono/html` escaping, micromark with HTML off and protocol allow-list, CSP without `script-src` sources beyond `'self'`, unit tests for each vector |
| A cached page outlives a visibility change | M / M | Generation purge on every relevant write; 5 min TTL ceiling; HTTP max-age 300 accepted in the spec |
| A member redirect is cached by a shared proxy | L / M | Redirects `private, no-store`; pages `Vary: Cookie` |
| Crawlers burn the anonymous limit | L / L | Crawlers hit cached pages; Googlebot respects the sitemap; Phase 11 adds burst limits |
| WhatsApp ignores the generated image | L / M | Same OG pipeline as `/s/` previews, already validated in Phase 3 |

## Settle before starting

- [ ] Indexing default for shared public decks: `noindex` (this plan) or a per-deck switch later?
- [ ] Should card pages show "last verified" dates to strangers?

## Complexity Tracking

None.
