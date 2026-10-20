import { createRoute, z, type OpenAPIHono } from '@hono/zod-openapi';
import {
  linkPreviewRequestSchema,
  linkPreviewResponseSchema,
  mediaSignResponseSchema,
} from '@pb/shared';
import type { AppEnv } from '../types';
import type { Services } from '../services';
import { getUser } from '../lib/current-user';
import { AUTH_SECURITY, problems } from '../lib/openapi';

const deckParams = z.object({ id: z.string().min(1) });

/** Phase 6 card media (D133, D134): signed editor uploads and link preview lookups. */
export function registerMediaRoutes(app: OpenAPIHono<AppEnv>, services: Services): void {
  const signRoute = createRoute({
    method: 'post',
    path: '/decks/{id}/media/sign',
    tags: ['media'],
    summary: 'Signed permission for one direct image upload to Cloudinary (D133)',
    request: { params: deckParams },
    responses: {
      200: {
        content: { 'application/json': { schema: mediaSignResponseSchema } },
        description: 'Signed upload parameters; the API secret is never included',
      },
      ...problems('unauthorized', 'forbidden', 'not-found', 'rate-limited', 'unavailable'),
    },
    security: AUTH_SECURITY,
  });

  app.openapi(signRoute, async (c) => {
    const user = getUser(c);
    const { id } = c.req.valid('param');
    const signed = await services.media.signUpload({ user, deckId: id });
    c.header('Cache-Control', 'no-store');
    return c.json(signed, 200);
  });

  const previewRoute = createRoute({
    method: 'post',
    path: '/decks/{id}/link-preview',
    tags: ['media'],
    summary: 'Open Graph preview for a link card, fetched through safe-fetch (D134)',
    request: {
      params: deckParams,
      body: {
        content: { 'application/json': { schema: linkPreviewRequestSchema } },
        required: true,
      },
    },
    responses: {
      200: {
        content: { 'application/json': { schema: linkPreviewResponseSchema } },
        description: 'The preview, or `null` when the page gave none (the reason is not returned)',
      },
      ...problems('validation', 'unauthorized', 'forbidden', 'not-found', 'rate-limited'),
    },
    security: AUTH_SECURITY,
  });

  app.openapi(previewRoute, async (c) => {
    const user = getUser(c);
    const { id } = c.req.valid('param');
    const { url } = c.req.valid('json');
    const preview = await services.linkPreview.lookup({ user, deckId: id, url });
    c.header('Cache-Control', 'no-store');
    return c.json({ preview }, 200);
  });
}
