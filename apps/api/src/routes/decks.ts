import { createRoute, z, type OpenAPIHono } from '@hono/zod-openapi';
import {
  deckCreateSchema,
  deckListSchema,
  deckPatchSchema,
  deckSchema,
  deckWithCategoriesSchema,
} from '@pb/shared';
import type { AppEnv } from '../types';
import type { Services } from '../services';
import { getUser } from '../lib/current-user';
import { AUTH_SECURITY as security, problems } from '../lib/openapi';

export function registerDecksRoutes(app: OpenAPIHono<AppEnv>, services: Services): void {
  // GET /decks
  const listRoute = createRoute({
    method: 'get',
    path: '/decks',
    tags: ['decks'],
    security,
    responses: {
      200: {
        content: { 'application/json': { schema: deckListSchema } },
        description: 'List of decks',
      },
      ...problems('unauthorized'),
    },
  });

  app.openapi(listRoute, async (c) => {
    const user = getUser(c);
    const decks = await services.decks.list(user);
    return c.json({ data: decks }, 200);
  });

  // POST /decks
  const createDeckRoute = createRoute({
    method: 'post',
    path: '/decks',
    tags: ['decks'],
    security,
    request: {
      body: {
        content: { 'application/json': { schema: deckCreateSchema } },
        required: true,
      },
    },
    responses: {
      201: {
        content: { 'application/json': { schema: deckWithCategoriesSchema } },
        description: 'Deck created',
      },
      ...problems('bad-request', 'validation', 'unauthorized', 'conflict'),
    },
  });

  app.openapi(createDeckRoute, async (c) => {
    const user = getUser(c);
    const input = c.req.valid('json');
    const deck = await services.decks.create(user, input);
    return c.json(deck, 201);
  });

  // GET /decks/{id}
  const getRoute = createRoute({
    method: 'get',
    path: '/decks/{id}',
    tags: ['decks'],
    security,
    request: {
      params: z.object({ id: z.string().min(1) }),
    },
    responses: {
      200: {
        content: { 'application/json': { schema: deckSchema } },
        description: 'Deck details',
      },
      ...problems('unauthorized', 'not-found'),
    },
  });

  app.openapi(getRoute, async (c) => {
    const user = getUser(c);
    const { id } = c.req.valid('param');
    const deck = await services.decks.get(user, id);
    return c.json(deck, 200);
  });

  // PATCH /decks/{id}
  const updateRoute = createRoute({
    method: 'patch',
    path: '/decks/{id}',
    tags: ['decks'],
    security,
    request: {
      params: z.object({ id: z.string().min(1) }),
      body: {
        content: { 'application/json': { schema: deckPatchSchema } },
        required: true,
      },
    },
    responses: {
      200: {
        content: { 'application/json': { schema: deckSchema } },
        description: 'Deck updated',
      },
      ...problems(
        'bad-request',
        'validation',
        'unauthorized',
        'forbidden',
        'not-found',
        'conflict',
      ),
    },
  });

  app.openapi(updateRoute, async (c) => {
    const user = getUser(c);
    const { id } = c.req.valid('param');
    const patch = c.req.valid('json');
    const deck = await services.decks.update(user, id, patch);
    return c.json(deck, 200);
  });

  const deleteRoute = createRoute({
    method: 'delete',
    path: '/decks/{id}',
    tags: ['decks'],
    security,
    request: {
      params: z.object({ id: z.string().min(1) }),
    },
    responses: {
      204: { description: 'Deck deleted (soft)' },
      ...problems('unauthorized', 'forbidden', 'not-found'),
    },
  });

  app.openapi(deleteRoute, async (c) => {
    const user = getUser(c);
    const { id } = c.req.valid('param');
    await services.decks.remove(user, id);
    return c.body(null, 204);
  });
}
