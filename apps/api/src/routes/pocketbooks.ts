import { createRoute, z, type OpenAPIHono } from '@hono/zod-openapi';
import {
  pocketbookCreateSchema,
  pocketbookListSchema,
  pocketbookPatchSchema,
  pocketbookSchema,
  pocketbookWithCategoriesSchema,
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

export function registerPocketbooksRoutes(app: OpenAPIHono<AppEnv>, services: Services): void {
  // GET /pocketbooks
  const listRoute = createRoute({
    method: 'get',
    path: '/pocketbooks',
    tags: ['pocketbooks'],
    security,
    responses: {
      200: {
        content: { 'application/json': { schema: pocketbookListSchema } },
        description: 'List of pocketbooks',
      },
      ...problems('unauthorized'),
    },
  });

  app.openapi(listRoute, async (c) => {
    const user = getUser(c);
    const pocketbooks = await services.pocketbooks.list(user);
    return c.json({ data: pocketbooks }, 200);
  });

  // POST /pocketbooks
  const createPocketbookRoute = createRoute({
    method: 'post',
    path: '/pocketbooks',
    tags: ['pocketbooks'],
    security,
    request: {
      body: {
        content: { 'application/json': { schema: pocketbookCreateSchema } },
        required: true,
      },
    },
    responses: {
      201: {
        content: { 'application/json': { schema: pocketbookWithCategoriesSchema } },
        description: 'Pocketbook created',
      },
      ...problems('bad-request', 'validation', 'unauthorized', 'conflict'),
    },
  });

  app.openapi(createPocketbookRoute, async (c) => {
    const user = getUser(c);
    const input = c.req.valid('json');
    const pocketbook = await services.pocketbooks.create(user, input);
    return c.json(pocketbook, 201);
  });

  // GET /pocketbooks/{id}
  const getRoute = createRoute({
    method: 'get',
    path: '/pocketbooks/{id}',
    tags: ['pocketbooks'],
    security,
    request: {
      params: z.object({ id: z.string().min(1) }),
    },
    responses: {
      200: {
        content: { 'application/json': { schema: pocketbookSchema } },
        description: 'Pocketbook details',
      },
      ...problems('unauthorized', 'not-found'),
    },
  });

  app.openapi(getRoute, async (c) => {
    const user = getUser(c);
    const { id } = c.req.valid('param');
    const pocketbook = await services.pocketbooks.get(user, id);
    return c.json(pocketbook, 200);
  });

  // PATCH /pocketbooks/{id}
  const updateRoute = createRoute({
    method: 'patch',
    path: '/pocketbooks/{id}',
    tags: ['pocketbooks'],
    security,
    request: {
      params: z.object({ id: z.string().min(1) }),
      body: {
        content: { 'application/json': { schema: pocketbookPatchSchema } },
        required: true,
      },
    },
    responses: {
      200: {
        content: { 'application/json': { schema: pocketbookSchema } },
        description: 'Pocketbook updated',
      },
      ...problems('bad-request', 'validation', 'unauthorized', 'not-found', 'conflict'),
    },
  });

  app.openapi(updateRoute, async (c) => {
    const user = getUser(c);
    const { id } = c.req.valid('param');
    const patch = c.req.valid('json');
    const pocketbook = await services.pocketbooks.update(user, id, patch);
    return c.json(pocketbook, 200);
  });
}
