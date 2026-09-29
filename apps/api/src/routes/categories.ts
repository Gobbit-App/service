import { createRoute, z, type OpenAPIHono } from '@hono/zod-openapi';
import {
  categoryListSchema,
  categorySchema,
  categoryCreateSchema,
  problemSchema,
} from '@pb/shared';
import type { AppEnv } from '../types';
import type { Services } from '../services';
import { getUser } from '../lib/current-user';

export function registerCategoriesRoutes(app: OpenAPIHono<AppEnv>, services: Services): void {
  const listCategoriesRoute = createRoute({
    method: 'get',
    path: '/decks/{id}/categories',
    tags: ['categories'],
    request: {
      params: z.object({ id: z.string().min(1) }),
    },
    responses: {
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
    security: [{ DevToken: [], DevUser: [] }],
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
    security: [{ DevToken: [], DevUser: [] }],
  });

  app.openapi(createCategoryRoute, async (c) => {
    const user = getUser(c);
    const { id } = c.req.valid('param');
    const input = c.req.valid('json');
    const category = await services.categories.create(user, id, input);
    return c.json(category, 201);
  });
}
