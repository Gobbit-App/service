---

description: "Task list for 017-public-pages"
---

# Tasks: Server-rendered public pages

**Input**: Design documents from `/specs/017-public-pages/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/public-pages.md; `016-public-read-api` merged

**Tests**: REQUIRED (constitution V). Every row of the plan's traceability table maps to a test task below.

**Organization**: Tasks are grouped by user story.

## Format: `[ID] [P?] [Story] [Tier?] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: US1 pages, US2 previews, US3 member redirect, US4 indexing
- **[Tier]**: `[unit]` `*.test.ts(x)` next to code, `[int]` `apps/api/test/*.int.test.ts` (Docker), `[e2e:smoke]` `e2e/tests/smoke/`, `[e2e:full]` `e2e/tests/full/` (tier rule: constitution V, ADR-053)

---

## Phase 1: Foundational (Blocking Prerequisites)

**Purpose**: Rendering building blocks, URL helper, cache, routing.

- [ ] T001 `pnpm --filter @pb/api add micromark`
- [ ] T002 [P] `markdown.ts` (micromark, HTML off) + [unit] test (raw HTML escaped, `javascript:` and `data:` links dropped, lists and links kept) in apps/api/src/public/
- [ ] T003 [P] `public-url.ts` (`publicUrl(deck, path)`, `appPath(target)`) + [unit] test in apps/api/src/public/
- [ ] T004 [P] `page-cache.ts` (`get`, `set`, `purgeDeck`) + [unit] test (TTL, generation bump, max entries) in apps/api/src/public/
- [ ] T005 [P] `layout.ts` + `styles.ts` (head tags, `lang`/`dir`, robots meta) in apps/api/src/public/
- [ ] T006 Caddy `handle /p/*` and `@seo` blocks in apps/web/Caddyfile; `/p/` in `LENIENT_PREFIXES`, `/sitemap.xml` and `/robots.txt` in `LENIENT_PATHS` in apps/api/src/middleware/session-auth.ts

**Checkpoint**: Building blocks tested; Caddy routes `/p/*` to the API

---

## Phase 2: User Story 1 — A stranger reads public pages (Priority: P1) 🎯 MVP

**Goal**: Deck, category and card pages, complete without JavaScript.

**Independent Test**: `curl` each page of a public deck: full content, no `<script>`.

### Tests for User Story 1

- [ ] T010 [P] [US1] [unit] `render-item` per type (text, link `rel`, image `alt` and width, table, calc default result); title with markup escaped, in apps/api/src/public/render-item.test.ts
- [ ] T011 [P] [US1] [unit] Pages: no `<script` in any page; Hebrew card → `lang="he" dir="rtl"`; "Older" link only with a next cursor, in apps/api/src/public/pages.test.ts
- [ ] T012 [P] [US1] [int] Routes: deck, category, card 200; shared-only card, private deck, unknown category → 404 page; old slug → 301; card in another public deck → 301; bad cursor → 400 page; lowered limit → 429 page with `Retry-After`; `Cache-Control`, `Vary: Cookie`, in apps/api/test/public-pages.int.test.ts
- [ ] T013 [P] [US1] [int] Freshness: edit, publish, archive, category visibility change and deck un-publish each show on the next request, in apps/api/test/public-pages.int.test.ts

### Implementation for User Story 1

- [ ] T014 [US1] `render-item.ts` and `pages.ts` (`deckPage`, `categoryPage`, `itemPage`, `notFoundPage`, `rateLimitedPage`, `badRequestPage`) in apps/api/src/public/
- [ ] T015 [US1] `public-deck.service.itemById`, `lastChanged` in apps/api/src/services/public-deck.service.ts
- [ ] T016 [US1] `public-pages.service` (compose, cache) in apps/api/src/services/public-pages.service.ts; wire in apps/api/src/services/index.ts
- [ ] T017 [US1] Routes in apps/api/src/routes/public-pages.ts; register and mount `public-rate-limit` on `/p/*` in apps/api/src/app.ts
- [ ] T018 [US1] `purgeDeck` after commit in apps/api/src/services/items.service.ts, review.service.ts, categories.service.ts, decks.service.ts

**Checkpoint**: Demo 2 part 1 (`curl`) works locally

---

## Phase 3: User Story 2 — Links preview well (Priority: P1)

**Goal**: OG/Twitter tags with the share image; `/s/` leads to the public page.

**Independent Test**: card page head has title, description ≤ 160, image, canonical; `/s/<public id>` → 302.

### Tests for User Story 2

- [ ] T020 [P] [US2] [unit] Head tags per page type (og:type, og:image for image cards vs generated, og:url = canonical, twitter:card), in apps/api/src/public/pages.test.ts
- [ ] T021 [P] [US2] [int] `/s/{id}`: public → 302 to `/p/{slug}/i/{id}`; private → page as today, in apps/api/test/share.int.test.ts

### Implementation for User Story 2

- [ ] T022 [US2] Export `ogImageFor(item)` from apps/api/src/share/share.service.ts; use it in `public-pages.service`
- [ ] T023 [US2] Public-mode redirect in apps/api/src/routes/share.ts (and `shareTarget` in share.service)

**Checkpoint**: Previews correct; share links lead to pages

---

## Phase 4: User Story 3 — Members land in the app (Priority: P1)

**Goal**: Members get a 302 to the matching app route unless `?view=public`.

**Independent Test**: member cookie on a category page → 302 `/d/{slug}/c/{cat}`; no cookie → page.

### Tests for User Story 3

- [ ] T030 [P] [US3] [int] Member → 302 for deck, category and card with `private, no-store`; signed-in non-member → page; `?view=public` → page with the note; stale cookie → page, in apps/api/test/public-pages.int.test.ts
- [ ] T031 [P] [US3] [e2e:smoke] Anonymous fetch of a card page (content, `og:title`, no `<script>`); same URL with the member's session → 302 to `/i/{id}`; deck page counts differ from the app's, in e2e/tests/smoke/public.spec.ts

### Implementation for User Story 3

- [ ] T032 [US3] Member check (role lookup) and redirect in apps/api/src/services/public-pages.service.ts and apps/api/src/routes/public-pages.ts; "Open in app" → `/sign-in?next=`

**Checkpoint**: Demo 3 works locally

---

## Phase 5: User Story 4 — Indexing by deck kind (Priority: P2)

**Goal**: Sitemap and robots; shared decks `noindex`.

**Independent Test**: sitemap lists communal pages only; shared deck page has `X-Robots-Tag: noindex`.

### Tests for User Story 4

- [ ] T040 [P] [US4] [unit] `seo.ts`: robots.txt lines; sitemap XML escaping and `lastmod` format; `robotsFor(deck)`, in apps/api/src/public/seo.test.ts
- [ ] T041 [P] [US4] [int] Sitemap contains communal deck, category and card URLs only; shared deck pages `noindex`; private deck absent, in apps/api/test/public-pages.int.test.ts

### Implementation for User Story 4

- [ ] T042 [US4] `seo.ts` in apps/api/src/public/; `public-deck.service.sitemapEntries`; `/sitemap.xml` and `/robots.txt` routes in apps/api/src/routes/public-pages.ts

**Checkpoint**: All four stories work independently

---

## Phase 6: Close-out

- [ ] T050 `pnpm lint && pnpm format:check && pnpm typecheck && pnpm test:unit && pnpm test:int && pnpm budget`
- [ ] T051 [P] docs/adr.md: append D177–D179 to **ADR-056**; docs/architecture.md: Caddy routes and the "Public" row; docs/design/public.md: pages, member redirect, indexing, cache and purge, Deviations
- [ ] T052 [P] README.md: public page URLs, sitemap, Search Console step; infra/README.md: Caddy routes
- [ ] T053 [P] CLAUDE.md ground rules: public pages use `hono/html` and `publicUrl()`; writes that change public content call `purgeDeck`
- [ ] T054 PLAN.md: tick demos 2 and 3 only after quickstart section 5 has run on the deployed instance
- [ ] T055 Run quickstart.md validation
- [ ] T056 `/speckit-converge` until it reports Converged

---

## Dependencies & Execution Order

- **Foundational (Phase 1)**: blocks all stories
- **US1**: after Phase 1
- **US2, US3, US4**: after US1 (they extend its pages and routes); independent of each other
- **External**: `016-public-read-api` merged; `018-public-search` adds the search box to these templates
- **Close-out**: after all stories

### Within Each User Story

- Tests written and FAILING before implementation
- helpers → service → route → Caddy

---

## Notes

- [P] tasks = different files, no dependencies
- Log decisions the plan did not make, and deviations, in implementation-notes.md as you go
- Commit after each task or logical group (e.g. `feat(api): public card pages`)
- Never call `raw()` on anything but micromark output; never cache a redirect or a member's response
