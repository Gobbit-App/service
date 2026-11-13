import { createRoute, z, type OpenAPIHono } from '@hono/zod-openapi';
import {
  linkPreviewRequestSchema,
  linkPreviewResponseSchema,
  mediaAssetConfirmRequestSchema,
  mediaAssetSchema,
  mediaSignRequestSchema,
  mediaSignResponseSchema,
  type MediaKind,
  mediaUploadFailureRequestSchema,
} from '@gobbit/shared';
import type { AppEnv } from '../types';
import type { Services } from '../services';
import { getUser } from '../lib/current-user';
import { badRequest } from '../errors/http-errors';
import { AUTH_SECURITY, problems } from '../lib/openapi';

const deckParams = z.object({ id: z.string().min(1) });

/** Phase 6 card media (D133, D134): signed editor uploads and link preview lookups. */
export function registerMediaRoutes(app: OpenAPIHono<AppEnv>, services: Services): void {
  const signRoute = createRoute({
    method: 'post',
    path: '/decks/{id}/media/sign',
    tags: ['media'],
    summary:
      'Signed permission for one direct upload of one kind of file to Cloudinary (D133, D389)',
    description:
      'Optional JSON body `{ "kind": "image" | "pdf" | "audio" | "video" }` (D389). Without a body ' +
      '(clients before 045) the upload is an image.',
    // The optional body is read in the handler: a declared body is validated even when absent
    // (no content type → 400), which would break clients that send none.
    request: { params: deckParams },
    responses: {
      200: {
        content: { 'application/json': { schema: mediaSignResponseSchema } },
        description: 'Signed upload parameters; the API secret is never included',
      },
      ...problems(
        'validation',
        'unauthorized',
        'forbidden',
        'not-found',
        'rate-limited',
        'unavailable',
      ),
    },
    security: AUTH_SECURITY,
  });

  app.openapi(signRoute, async (c) => {
    const user = getUser(c);
    const { id } = c.req.valid('param');
    const text = await c.req.text();
    let raw: unknown = {};
    if (text.trim() !== '') {
      try {
        raw = JSON.parse(text);
      } catch {
        throw badRequest('Body must be JSON');
      }
    }
    const parsed = mediaSignRequestSchema.safeParse(raw);
    if (!parsed.success) throw badRequest('Unknown media kind');
    const kind: MediaKind = parsed.data.kind;
    const signed = await services.media.signUpload({
      user,
      deckId: id,
      kind,
      requestId: c.get('requestId'),
    });
    c.header('Cache-Control', 'no-store');
    return c.json(signed, 200);
  });

  const confirmRoute = createRoute({
    method: 'post',
    path: '/decks/{id}/media/assets',
    tags: ['media'],
    summary: 'Record a finished editor upload from its signed Cloudinary response (D157)',
    request: {
      params: deckParams,
      body: {
        content: { 'application/json': { schema: mediaAssetConfirmRequestSchema } },
        required: true,
      },
    },
    responses: {
      201: {
        content: { 'application/json': { schema: mediaAssetSchema } },
        description: 'Recorded',
      },
      200: {
        content: { 'application/json': { schema: mediaAssetSchema } },
        description: 'Already recorded for this deck (idempotent)',
      },
      ...problems(
        'validation',
        'unauthorized',
        'forbidden',
        'not-found',
        'unprocessable',
        'rate-limited',
        'unavailable',
      ),
    },
    security: AUTH_SECURITY,
  });

  app.openapi(confirmRoute, async (c) => {
    const user = getUser(c);
    const { id } = c.req.valid('param');
    const body = c.req.valid('json');
    const { asset, created } = await services.media.confirmUpload({
      user,
      deckId: id,
      body,
      requestId: c.get('requestId'),
    });
    c.header('Cache-Control', 'no-store');
    return created ? c.json(asset, 201) : c.json(asset, 200);
  });

  const failureRoute = createRoute({
    method: 'post',
    path: '/decks/{id}/media/upload-failures',
    tags: ['media'],
    summary: "Report a failed direct upload so Cloudinary's refusal reaches the API log",
    request: {
      params: deckParams,
      body: {
        content: { 'application/json': { schema: mediaUploadFailureRequestSchema } },
        required: true,
      },
    },
    responses: {
      204: { description: 'Logged; nothing is stored' },
      ...problems('validation', 'unauthorized', 'forbidden', 'not-found', 'rate-limited'),
    },
    security: AUTH_SECURITY,
  });

  app.openapi(failureRoute, async (c) => {
    const user = getUser(c);
    const { id } = c.req.valid('param');
    const report = c.req.valid('json');
    await services.media.reportUploadFailure({ user, deckId: id, report });
    return c.body(null, 204);
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
    const preview = await services.linkPreview.lookup({
      user,
      deckId: id,
      url,
      requestId: c.get('requestId'),
    });
    c.header('Cache-Control', 'no-store');
    return c.json({ preview }, 200);
  });
}
