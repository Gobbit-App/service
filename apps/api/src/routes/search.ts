import { createRoute, z, type OpenAPIHono } from '@hono/zod-openapi';
import {
  askRequestSchema,
  askResponseSchema,
  searchQuerySchema,
  searchResponseSchema,
} from '@gobbit/shared';
import type { AppEnv } from '../types';
import type { Services } from '../services';
import { getUser } from '../lib/current-user';
import { AUTH_SECURITY, problems } from '../lib/openapi';

const deckParams = z.object({ id: z.string().min(1) });

export function registerSearchRoutes(app: OpenAPIHono<AppEnv>, services: Services): void {
  const searchRoute = createRoute({
    method: 'get',
    path: '/decks/{id}/search',
    tags: ['search'],
    summary: 'Hybrid text + semantic search over the deck (D75)',
    request: { params: deckParams, query: searchQuerySchema },
    responses: {
      200: {
        content: { 'application/json': { schema: searchResponseSchema } },
        description: 'Ranked matches; `semantic` is false when only the text arm ran',
      },
      ...problems('validation', 'unauthorized', 'forbidden', 'not-found'),
    },
    security: AUTH_SECURITY,
  });

  app.openapi(searchRoute, async (c) => {
    const user = getUser(c);
    const { id } = c.req.valid('param');
    const query = c.req.valid('query');
    return c.json(await services.search.search(user, id, query), 200);
  });

  const askRoute = createRoute({
    method: 'post',
    path: '/decks/{id}/ask',
    tags: ['search'],
    summary: 'Answer a question from the deck’s cards only, with citations (D77)',
    request: {
      params: deckParams,
      body: { content: { 'application/json': { schema: askRequestSchema } }, required: true },
    },
    responses: {
      200: {
        content: { 'application/json': { schema: askResponseSchema } },
        description: 'Grounded answer, or the fixed not-found answer with `grounded: false`',
      },
      ...problems(
        'validation',
        'unauthorized',
        'forbidden',
        'not-found',
        'rate-limited',
        'unavailable',
        'timeout',
      ),
    },
    security: AUTH_SECURITY,
  });

  app.openapi(askRoute, async (c) => {
    const user = getUser(c);
    const { id } = c.req.valid('param');
    const { question } = c.req.valid('json');
    return c.json(await services.ask.ask(user, id, question), 200);
  });
}
