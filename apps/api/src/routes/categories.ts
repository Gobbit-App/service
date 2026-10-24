import { createRoute, z, type OpenAPIHono } from '@hono/zod-openapi';
import {
  categoryListSchema,
  categorySchema,
  categoryCreateSchema,
  categoryPatchSchema,
  problemSchema,
  uuidSchema,
} from '@pb/shared';
import type { AppEnv } from '../types';
import type { Services } from '../services';
import { getUser } from '../lib/current-user';
import { AUTH_SECURITY, problems } from '../lib/openapi';

export function registerCategoriesRoutes(app: OpenAPIHono<AppEnv>, services: Services): void {
  const listCategoriesRoute = createRoute({
    method: 'get',
    path: '/decks/{id}/categories',
    tags: ['categories'],
    request: {
      params: z.object({ id: z.string().min(1) }),
    },
    responses: {
      ...problems('forbidden'),
      200: {
        content: {
          'application/json': {
            schema: categoryListSchema,
          },
        },
        description: 'Categories in the deck',
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
        description: 'Deck not found',
      },
    },
    security: AUTH_SECURITY,
  });

  app.openapi(listCategoriesRoute, async (c) => {
    const user = getUser(c);
    const { id } = c.req.valid('param');
    const categories = await services.categories.list(user, id);
    return c.json({ data: categories }, 200);
  });

  const createCategoryRoute = createRoute({
    method: 'post',
    path: '/decks/{id}/categories',
    tags: ['categories'],
    request: {
      params: z.object({ id: z.string().min(1) }),
      body: {
        content: {
          'application/json': {
            schema: categoryCreateSchema,
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
            schema: categorySchema,
          },
        },
        description: 'Category created',
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
        description: 'Deck not found',
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
    security: AUTH_SECURITY,
  });

  app.openapi(createCategoryRoute, async (c) => {
    const user = getUser(c);
    const { id } = c.req.valid('param');
    const input = c.req.valid('json');
    const category = await services.categories.create(user, id, input);
    return c.json(category, 201);
  });

  const updateCategoryRoute = createRoute({
    method: 'patch',
    path: '/decks/{id}/categories/{categoryId}',
    tags: ['categories'],
    summary: 'Rename a category or change its visibility (D176)',
    request: {
      params: z.object({ id: z.string().min(1), categoryId: uuidSchema }),
      body: {
        content: { 'application/json': { schema: categoryPatchSchema } },
        required: true,
      },
    },
    responses: {
      ...problems('bad-request', 'unauthorized', 'forbidden', 'not-found'),
      200: {
        content: { 'application/json': { schema: categorySchema } },
        description: 'The updated category',
      },
    },
    security: AUTH_SECURITY,
  });

  app.openapi(updateCategoryRoute, async (c) => {
    const user = getUser(c);
    const { id, categoryId } = c.req.valid('param');
    const patch = c.req.valid('json');
    const category = await services.categories.update(user, id, categoryId, patch);
    return c.json(category, 200);
  });
}
