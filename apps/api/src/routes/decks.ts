import { createRoute, z, type OpenAPIHono } from '@hono/zod-openapi';
import {
  deckCreateSchema,
  deckListSchema,
  deckPatchSchema,
  deckSchema,
  deckWithCategoriesSchema,
  problemSchema,
} from '@pb/shared';
import type { AppEnv } from '../types';
import type { Services } from '../services';
import { getUser } from '../lib/current-user';

const security = [{ DevToken: [], DevUser: [] }];

function problems(
  ...codes: string[]
): Record<
  number,
  { content: { 'application/problem+json': { schema: typeof problemSchema } }; description: string }
> {
  const codeToStatus: Record<string, number> = {
    'bad-request': 400,
    validation: 400,
    unauthorized: 401,
    'not-found': 404,
    conflict: 409,
    unprocessable: 422,
  };

  const statusToDescription: Record<number, string> = {
    400: 'Bad Request',
    401: 'Unauthorized',
    404: 'Not Found',
    409: 'Conflict',
    422: 'Unprocessable Content',
  };

  const statuses = new Set<number>();
  for (const code of codes) {
    if (code in codeToStatus) {
      statuses.add(codeToStatus[code]);
    }
  }

  const result: Record<
    number,
    {
      content: { 'application/problem+json': { schema: typeof problemSchema } };
      description: string;
    }
  > = {};
  for (const status of statuses) {
    result[status] = {
      content: { 'application/problem+json': { schema: problemSchema } },
      description: statusToDescription[status],
    };
  }

  return result;
}

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
      ...problems('bad-request', 'validation', 'unauthorized', 'not-found', 'conflict'),
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
      ...problems('unauthorized', 'not-found'),
    },
  });

  app.openapi(deleteRoute, async (c) => {
    const user = getUser(c);
    const { id } = c.req.valid('param');
    await services.decks.remove(user, id);
    return c.body(null, 204);
  });
}
