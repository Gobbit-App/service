import type { Context } from 'hono';
import type { OpenAPIHono } from '@hono/zod-openapi';
import type { AppEnv } from '../types';
import type { Services } from '../services';
import type { PageRequest } from '../services/public-pages.service';
import type { PageResponse } from '../public/responses';
import { PAGE_CACHE_CONTROL } from '../public/responses';
import { rateLimitedPage } from '../public/pages';

/** D177: every page varies by the session cookie (members are redirected, D178). */
const VARY = 'Cookie';

function pageRequest(c: Context<AppEnv>): PageRequest {
  return { user: c.get('user'), view: c.req.query('view'), cursor: c.req.query('cursor') };
}

function send(c: Context<AppEnv>, page: PageResponse): Response {
  const headers = { ...page.headers, Vary: VARY };
  if (page.status === 301 || page.status === 302) {
    return c.body(null, page.status, headers);
  }
  return c.html(page.html, page.status, headers);
}

/** D177: the HTML answer of the anonymous limiter on `/p/*` (D175). */
export function rateLimitedHtml(c: Context<AppEnv>, retryAfterSeconds: number): Response {
  return c.html(rateLimitedPage(), 429, {
    'Cache-Control': 'no-store',
    'Retry-After': String(retryAfterSeconds),
    'X-Robots-Tag': 'noindex',
  });
}

/**
 * D177–D179: server-rendered public pages, the sitemap and robots.txt. HTML for strangers and
 * crawlers, so they are kept out of the OpenAPI document.
 */
export function registerPublicPagesRoutes(app: OpenAPIHono<AppEnv>, services: Services): void {
  const pages = services.publicPages;

  app.get('/p/:slug', async (c) =>
    send(c, await pages.deckPage(c.req.param('slug'), pageRequest(c))),
  );

  app.get('/p/:slug/c/:category', async (c) =>
    send(c, await pages.categoryPage(c.req.param('slug'), c.req.param('category'), pageRequest(c))),
  );

  app.get('/p/:slug/i/:itemId', async (c) =>
    send(c, await pages.itemPage(c.req.param('slug'), c.req.param('itemId'), pageRequest(c))),
  );

  app.get('/sitemap.xml', async (c) =>
    c.body(await pages.sitemap(), 200, {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': PAGE_CACHE_CONTROL,
    }),
  );

  app.get('/robots.txt', (c) =>
    c.text(pages.robots(), 200, { 'Cache-Control': PAGE_CACHE_CONTROL }),
  );
}
