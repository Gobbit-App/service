import { createRoute, z, type OpenAPIHono } from '@hono/zod-openapi';
import {
  itemListQuerySchema,
  itemPageSchema,
  itemCreateSchema,
  itemSchema,
  itemPatchSchema,
  problemSchema,
} from '@pb/shared';
import type { AppEnv } from '../types';
import type { Services } from '../services';
import { getUser } from '../lib/current-user';
import { AUTH_SECURITY, problems } from '../lib/openapi';

export function registerItemsRoutes(app: OpenAPIHono<AppEnv>, services: Services): void {
  const listRoute = createRoute({
    method: 'get',
    path: '/decks/{id}/items',
    tags: ['items'],
    security: AUTH_SECURITY,
    request: {
      params: z.object({ id: z.string().min(1) }),
      query: itemListQuerySchema,
    },
    responses: {
      ...problems('forbidden'),
      200: {
        content: {
          'application/json': {
            schema: itemPageSchema,
          },
        },
        description: 'Items listed successfully',
      },
      400: {
        content: {
          'application/problem+json': {
            schema: problemSchema,
          },
        },
        description: 'Bad request',
      },
      401: {
        content: {
          'application/problem+json': {
            schema: problemSchema,
          },
        },
        description: 'Unauthorized',
      },
      404: {
        content: {
          'application/problem+json': {
            schema: problemSchema,
          },
        },
        description: 'Not found',
      },
    },
  });

  app.openapi(listRoute, async (c) => {
    const user = getUser(c);
    const { id } = c.req.valid('param');
    const q = c.req.valid('query');
    const page = await services.items.list(user, id, q);
    return c.json(page, 200);
  });

  const createItemRoute = createRoute({
    method: 'post',
    path: '/decks/{id}/items',
    tags: ['items'],
    security: AUTH_SECURITY,
    request: {
      params: z.object({ id: z.string().min(1) }),
      body: {
        content: {
          'application/json': {
            schema: itemCreateSchema,
          },
        },
        required: true,
      },
    },
    responses: {
      ...problems('forbidden'),
      201: {
        content: {
          'application/json': {
            schema: itemSchema,
          },
        },
        description: 'Item created successfully',
      },
      400: {
        content: {
          'application/problem+json': {
            schema: problemSchema,
          },
        },
        description: 'Bad request',
      },
      401: {
        content: {
          'application/problem+json': {
            schema: problemSchema,
          },
        },
        description: 'Unauthorized',
      },
      404: {
        content: {
          'application/problem+json': {
            schema: problemSchema,
          },
        },
        description: 'Not found',
      },
      409: {
        content: {
          'application/problem+json': {
            schema: problemSchema,
          },
        },
        description: 'Conflict',
      },
      422: {
        content: {
          'application/problem+json': {
            schema: problemSchema,
          },
        },
        description: 'Unprocessable content',
      },
    },
  });

  app.openapi(createItemRoute, async (c) => {
    const user = getUser(c);
    const { id } = c.req.valid('param');
    const input = c.req.valid('json');
    const item = await services.items.create(user, id, input);
    return c.json(item, 201);
  });

  const getRoute = createRoute({
    method: 'get',
    path: '/items/{id}',
    tags: ['items'],
    security: AUTH_SECURITY,
    request: {
      params: z.object({ id: z.string().min(1) }),
    },
    responses: {
      ...problems('forbidden'),
      200: {
        content: {
          'application/json': {
            schema: itemSchema,
          },
        },
        description: 'Item retrieved successfully',
      },
      401: {
        content: {
          'application/problem+json': {
            schema: problemSchema,
          },
        },
        description: 'Unauthorized',
      },
      404: {
        content: {
          'application/problem+json': {
            schema: problemSchema,
          },
        },
        description: 'Not found',
      },
    },
  });

  app.openapi(getRoute, async (c) => {
    const user = getUser(c);
    const { id } = c.req.valid('param');
    const item = await services.items.get(user, id);
    return c.json(item, 200);
  });

  const updateRoute = createRoute({
    method: 'patch',
    path: '/items/{id}',
    tags: ['items'],
    security: AUTH_SECURITY,
    request: {
      params: z.object({ id: z.string().min(1) }),
      body: {
        content: {
          'application/json': {
            schema: itemPatchSchema,
          },
        },
        required: true,
      },
    },
    responses: {
      ...problems('forbidden'),
      200: {
        content: {
          'application/json': {
            schema: itemSchema,
          },
        },
        description: 'Item updated successfully',
      },
      400: {
        content: {
          'application/problem+json': {
            schema: problemSchema,
          },
        },
        description: 'Bad request',
      },
      401: {
        content: {
          'application/problem+json': {
            schema: problemSchema,
          },
        },
        description: 'Unauthorized',
      },
      404: {
        content: {
          'application/problem+json': {
            schema: problemSchema,
          },
        },
        description: 'Not found',
      },
      409: {
        content: {
          'application/problem+json': {
            schema: problemSchema,
          },
        },
        description: 'Conflict',
      },
      422: {
        content: {
          'application/problem+json': {
            schema: problemSchema,
          },
        },
        description: 'Unprocessable content',
      },
    },
  });

  app.openapi(updateRoute, async (c) => {
    const user = getUser(c);
    const { id } = c.req.valid('param');
    const patch = c.req.valid('json');
    const item = await services.items.update(user, id, patch);
    return c.json(item, 200);
  });

  const deleteRoute = createRoute({
    method: 'delete',
    path: '/items/{id}',
    tags: ['items'],
    security: AUTH_SECURITY,
    request: {
      params: z.object({ id: z.string().min(1) }),
    },
    responses: {
      ...problems('forbidden'),
      204: {
        description: 'Item deleted successfully',
      },
      401: {
        content: {
          'application/problem+json': {
            schema: problemSchema,
          },
        },
        description: 'Unauthorized',
      },
      404: {
        content: {
          'application/problem+json': {
            schema: problemSchema,
          },
        },
        description: 'Not found',
      },
    },
  });

  app.openapi(deleteRoute, async (c) => {
    const user = getUser(c);
    const { id } = c.req.valid('param');
    await services.items.remove(user, id);
    return c.body(null, 204);
  });

  const archiveRoute = createRoute({
    method: 'post',
    path: '/items/{id}/archive',
    tags: ['items'],
    security: AUTH_SECURITY,
    request: {
      params: z.object({ id: z.string().min(1) }),
    },
    responses: {
      ...problems('forbidden'),
      200: {
        content: {
          'application/json': {
            schema: itemSchema,
          },
        },
        description: 'Item archived successfully',
      },
      401: {
        content: {
          'application/problem+json': {
            schema: problemSchema,
          },
        },
        description: 'Unauthorized',
      },
      404: {
        content: {
          'application/problem+json': {
            schema: problemSchema,
          },
        },
        description: 'Not found',
      },
    },
  });

  app.openapi(archiveRoute, async (c) => {
    const user = getUser(c);
    const { id } = c.req.valid('param');
    const item = await services.items.archive(user, id);
    return c.json(item, 200);
  });
}
