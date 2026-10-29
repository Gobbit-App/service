# Research: Server-rendered public pages

Decisions continue the project-wide D numbering. Phase 8 reserves D174–D191. This feature owns **D177–D181**; D177–D179 are recorded in **ADR-056** with 016's and 018's public-surface decisions.

## What exists today

- **Share previews** (D58–D61): `/s/:itemId` renders a tiny HTML page with OG tags and a refresh to the PWA. Public mode uses the real title, excerpt and image; the image is the card's own (Cloudinary `c_fill,w_1200,h_630`) or a generated OG image (Satori + resvg, stored in Cloudinary, keyed by content hash).
- **Language** (`@gobbit/shared` `text-script`): `htmlLang(text)` and `ogLocale(text)` guess Hebrew, Arabic or English from the script.
- **PWA**: renders cards client-side with `react-markdown` (no GFM). Its routes need JavaScript and an API session; strangers can't use them.
- **Caddy**: one origin. Only `/api/*` and `/s/*` reach the API.

## D177 — Server-side rendering

- **Decision**:
  - Routes `/p/{slug}`, `/p/{slug}/c/{category}`, `/p/{slug}/i/{itemId}` on the API, outside OpenAPI, behind Caddy `handle` blocks.
  - Templates are `hono/html` tagged templates. Every interpolation is escaped; the only `raw()` input is micromark output.
  - Card bodies: `micromark(body)` with defaults (HTML disabled, `javascript:`/`data:` URLs dropped). Same CommonMark subset as the PWA.
  - Per-type renderers: text (markdown), link (title, host, preview image, `rel="nofollow ugc noopener"`), image (Cloudinary URL with a width-limited transformation and `alt`), table (a `<table>` with header row, horizontally scrollable), calc (inputs with defaults, the default result from `@gobbit/shared/calc`, "open in app to change values").
  - One inline `<style>` (system font, max width 40rem, logical properties so RTL works), no external CSS, no JS.
  - Head: `<title>`, description (`excerpt`, 160), canonical, `og:*` (type `article` for cards, `website` otherwise), `twitter:card=summary_large_image`, `og:locale` from `ogLocale`. The card image reuses `share.service`'s image logic (exported as `ogImageFor(item)`). Deck and category pages use the static `/og/` image.
  - `<html lang dir>` from `htmlLang` on the page's main text (card title + body, or deck name).
  - `publicUrl(deck, path)` returns `${APP_URL}/p/${slug}${path}`. Every absolute URL (canonical, og:url, sitemap) goes through it, so Phase 12 changes one function.
  - Card permalinks: the item id decides. `/p/{anything}/i/{id}` loads the card through 016's rules; if its deck's slug differs, 301 to the current one.
- **Rationale**: `hono/html` is part of Hono (no dependency) and escapes by default, which the existing string concatenation doesn't. micromark is the parser underneath the PWA's markdown, so rendering matches. Plain HTML keeps pages light for old phones and readable by every crawler.
- **Alternatives considered**:
  - **Hono JSX**: also escapes, but adds a JSX build setting to a no-build API for a few templates.
  - **PWA prerendering / SSR of the React app**: needs a Node renderer for the web bundle, hydration and per-request data, far more than these pages need.
  - **`marked` + a sanitiser**: two dependencies and a sanitiser to keep correct; micromark is safe by default.
  - **Slug-only card URLs** (`/p/{slug}/{card-slug}`): cards have no slugs; ids are stable.

## D178 — Members go to the app

- **Decision**: the route reads `c.var.user` (sessionAuth resolves it; `/p/` is lenient so a stale cookie is ignored). If the user has a role on the deck and the query has no `view=public`, answer 302 to `/d/{slug}`, `/d/{slug}/c/{category}` or `/i/{id}` with `Cache-Control: private, no-store`. Pages always send `Vary: Cookie`. Every page has an "Open in app" link to `/sign-in?next=<app path>`, and a member reaching a page through `?view=public` sees a "You're viewing the public page" note.
- **Rationale**: demo 3 needs one link for both audiences. The PWA already shows the member's full view with their counts. The page cache never stores a redirect because the check runs first.
- **Alternatives considered**:
  - **Render member-specific HTML**: duplicates the app and makes caching per user.
  - **Client-side redirect with a script**: breaks the no-JS rule and flashes the public page.
  - **Always show the public page with a banner**: members would have to click again every time; the demo asks for different counts.

## D179 — Indexing by deck kind

- **Decision**:
  - Communal public decks: pages are indexable; `/sitemap.xml` lists the deck page, each public category page and each public card page with `lastmod` (card `updated_at`; deck/category = newest card).
  - Shared public decks: `<meta name="robots" content="noindex">` and `X-Robots-Tag: noindex`; not in the sitemap.
  - `/robots.txt` (API): `Disallow: /api/`, `/s/`, `/d/`, `/i/`, `/settings`, `/share`, `/sign-in`, `/p/*/search`; `Sitemap: ${APP_URL}/sitemap.xml`.
  - One sitemap file until it nears 50,000 URLs (far off).
- **Rationale**: "communal" means "for a community"; a family that makes its deck public wants a shareable link, not search results. Kind already exists, so no new switch is needed now.
- **Alternatives considered**:
  - **A per-deck `indexable` flag**: more UI and a migration; add later if a shared deck wants indexing.
  - **Index everything public**: surprises families.
  - **robots.txt in the web image**: the sitemap URL depends on `APP_URL`, which the API knows.

## D180 — Page cache and purge

- **Decision**: `page-cache.ts` keeps an `lru-cache` (max 500 entries, TTL 5 min) of rendered anonymous pages, keyed `${generation(deckId)}:${path}?${normalisedQuery}`. `purgeDeck(deckId)` increments the deck's generation (old entries age out). Services call it after commit in item create/update/archive/restore/remove/undelete, review publish/discard, category create/update/delete and deck update/delete. HTTP: `Cache-Control: public, max-age=300` for pages and the sitemap; 404 pages `public, max-age=60`.
- **Rationale**: rendering is cheap but each page needs two to three queries; crawlers and chat previews hit the same pages repeatedly. Generation keys make purge O(1) without scanning keys. One API instance keeps it exact.
- **Alternatives considered**:
  - **No server cache, HTTP only**: browsers cache, but each new visitor and crawler hits the DB.
  - **Caddy cache**: needs a plugin and an invalidation path.
  - **Purge by path**: every write would need to know every affected path (deck, categories, card, sitemap).

## D181 — Share links lead to public pages

- **Decision**: `/s/{id}` in public mode answers 302 to `publicUrl(deck, /i/{id})`. Private mode is unchanged (generic preview, refresh to `/i/{id}`).
- **Rationale**: one page per public card. The `/p/` page has the same OG tags, so chat previews of old `/s/` links are unchanged, and strangers see content instead of a sign-in screen.
- **Alternatives considered**: keep `/s/` as is (strangers who tap it hit the PWA's sign-in), or render the full page at `/s/` (two canonical URLs).
