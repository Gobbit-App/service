import type { OpenAPIHono } from '@hono/zod-openapi';
import type { AppEnv } from '../types';
import type { Services } from '../services';

/** Crawlers re-fetch rarely; five minutes keeps edits visible soon after (D58). */
export const SHARE_CACHE_CONTROL = 'public, max-age=300';

/**
 * `GET /s/:itemId` — HTML with OG tags for link-preview crawlers and a refresh to the
 * PWA for humans (D58); a 302 to the public page for cards in public decks (D181). Not part of the JSON API, so it is kept out of the OpenAPI document.
 */
export function registerShareRoutes(app: OpenAPIHono<AppEnv>, services: Services): void {
  app.get('/s/:itemId', async (c) => {
    const itemId = c.req.param('itemId');
    // D181: a public card's share link leads to its public page.
    const target = await services.share.publicTarget(itemId);
    if (target) {
      c.header('Cache-Control', SHARE_CACHE_CONTROL);
      return c.redirect(target, 302);
    }
    const html = await services.share.sharePage(itemId);
    c.header('Cache-Control', SHARE_CACHE_CONTROL);
    c.header('X-Robots-Tag', 'noindex');
    return c.html(html, 200);
  });
}
