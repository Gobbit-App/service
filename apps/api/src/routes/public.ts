import { createRoute, z, type OpenAPIHono } from '@hono/zod-openapi';
import {
  publicDeckSchema,
  publicItemListQuerySchema,
  publicItemPageSchema,
  publicItemSchema,
  publicSearchQuerySchema,
  publicSearchResponseSchema,
} from '@pb/shared';
import type { AppEnv } from '../types';
import type { Env } from '../env';
import type { Services } from '../services';
import { clientIp } from '../lib/client-ip';
import { problems } from '../lib/openapi';

/** D174: shared caches may hold public answers briefly; the routes never vary by caller. */
export const PUBLIC_CACHE_CONTROL = 'public, max-age=60';

const PUBLIC_TAG = 'public';
const slugParam = z.object({ slug: z.string().min(1).max(200) });

/**
 * D174: anonymous reads of public decks. These handlers never read `c.var.user`: a signed-in
 * member gets exactly the stranger's answer.
 */
export function registerPublicRoutes(
  app: OpenAPIHono<AppEnv>,
  services: Services,
  env: Pick<Env, 'CLIENT_IP_HEADER'>,
): void {
  const summaryRoute = createRoute({
    method: 'get',
    path: '/public/{slug}',
    tags: [PUBLIC_TAG],
    summary: 'A public deck and its public categories',
    request: { params: slugParam },
    responses: {
      ...problems('bad-request', 'not-found', 'rate-limited'),
      200: {
        content: { 'application/json': { schema: publicDeckSchema } },
        description: 'The public deck',
      },
    },
    security: [],
  });

  app.openapi(summaryRoute, async (c) => {
    const { slug } = c.req.valid('param');
    const deck = await services.publicDecks.summary(slug);
    c.header('Cache-Control', PUBLIC_CACHE_CONTROL);
    return c.json(deck, 200);
  });

  const listRoute = createRoute({
    method: 'get',
    path: '/public/{slug}/items',
    tags: [PUBLIC_TAG],
    summary: 'Published cards in public categories, newest first',
    request: { params: slugParam, query: publicItemListQuerySchema },
    responses: {
      ...problems('bad-request', 'not-found', 'rate-limited'),
      200: {
        content: { 'application/json': { schema: publicItemPageSchema } },
        description: 'A page of public cards',
      },
    },
    security: [],
  });

  app.openapi(listRoute, async (c) => {
    const { slug } = c.req.valid('param');
    const query = c.req.valid('query');
    const page = await services.publicDecks.list(slug, query);
    c.header('Cache-Control', PUBLIC_CACHE_CONTROL);
    return c.json(page, 200);
  });

  const getRoute = createRoute({
    method: 'get',
    path: '/public/{slug}/items/{itemId}',
    tags: [PUBLIC_TAG],
    summary: 'One public card',
    request: { params: slugParam.extend({ itemId: z.string().min(1) }) },
    responses: {
      ...problems('bad-request', 'not-found', 'rate-limited'),
      200: {
        content: { 'application/json': { schema: publicItemSchema } },
        description: 'The public card',
      },
    },
    security: [],
  });

  app.openapi(getRoute, async (c) => {
    const { slug, itemId } = c.req.valid('param');
    const item = await services.publicDecks.get(slug, itemId);
    c.header('Cache-Control', PUBLIC_CACHE_CONTROL);
    return c.json(item, 200);
  });

  const searchRoute = createRoute({
    method: 'get',
    path: '/public/{slug}/search',
    tags: [PUBLIC_TAG],
    summary: 'Search the public cards of a public deck',
    description:
      'Hybrid (text + meaning) search over published cards in public categories. `semantic` is false when the meaning arm did not run (no embedding key, anonymous budget used up, provider error). No Ask for strangers.',
    request: { params: slugParam, query: publicSearchQuerySchema },
    responses: {
      ...problems('bad-request', 'not-found', 'rate-limited'),
      200: {
        content: { 'application/json': { schema: publicSearchResponseSchema } },
        description: 'Public cards, best first',
      },
    },
    security: [],
  });

  app.openapi(searchRoute, async (c) => {
    const { slug } = c.req.valid('param');
    const query = c.req.valid('query');
    // D182: the IP only keys the anonymous embedding budgets; it is never logged.
    const results = await services.search.searchPublic(
      slug,
      query,
      clientIp(c, env.CLIENT_IP_HEADER),
    );
    c.header('Cache-Control', PUBLIC_CACHE_CONTROL);
    return c.json(results, 200);
  });
}
