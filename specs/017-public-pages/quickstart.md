# Quickstart: Server-rendered public pages

Validates [spec.md](./spec.md) end to end. Setup per `README.md`; a public communal deck from [016's quickstart](../016-public-read-api/quickstart.md) (`our-street`, three public categories, one shared). Contract: [public-pages](./contracts/public-pages.md).

## 1. Automated

```sh
pnpm test:unit                 # markdown, render-item, pages, seo, page-cache
pnpm test:int                  # public-pages.int, share.int
pnpm test:e2e -- public.spec.ts
```

## 2. Pages without JavaScript (demo 2, part 1)

1. `pnpm compose:up` (pages go through Caddy on `127.0.0.1:8080`).
2. `curl -s http://127.0.0.1:8080/p/our-street | grep -c '<script'` → `0`. The output contains the deck name and the three public categories with counts, not the shared one.
3. `curl -s http://127.0.0.1:8080/p/our-street/i/<card id>`: full card content, `og:title`, `og:image`, canonical URL.
4. Open the card page in a browser with JavaScript disabled: readable, links work. Repeat with a Hebrew card: right-to-left.
5. A table card and a calculator card: the table scrolls on a narrow window; the calculator shows its default result.

## 3. Members and strangers (demo 3)

1. Signed in as the owner, open `http://127.0.0.1:8080/p/our-street/c/schools`: the app opens on the category, with the shared category visible in the deck menu.
2. In a private window, open the same link: the public page; the deck page lists three categories.
3. As the owner, add `?view=public`: the public page with the "public view" note.

## 4. Freshness and indexing

1. Edit a public card in the app; reload its public page: the change shows at once.
2. `curl -s http://127.0.0.1:8080/sitemap.xml`: the communal deck's pages are listed.
3. Make a shared deck public: `curl -sI …/p/<shared-slug>` shows `X-Robots-Tag: noindex`; it is not in the sitemap.
4. `curl -s http://127.0.0.1:8080/robots.txt`: disallow lines and the sitemap URL.
5. `curl -sI http://127.0.0.1:8080/s/<public card id>` → 302 to `/p/our-street/i/<id>`.

## 5. Deployed instance (demo 2, part 2)

1. Paste a public card's `/p/` link into WhatsApp: the preview shows title, snippet and image.
2. Repeat sections 2 and 3 on the deployed origin.
3. Submit `/sitemap.xml` in Google Search Console (owner action).
4. Tick demos 2 and 3 in `PLAN.md`.
