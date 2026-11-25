import { createRoute, z, type OpenAPIHono } from '@hono/zod-openapi';
import {
  inviteAcceptResponseSchema,
  inviteAcceptSchema,
  inviteLinkCreateSchema,
  inviteLinkListSchema,
  inviteLinkSchema,
  invitePreviewSchema,
} from '@gobbit/shared';
import type { AppEnv } from '../types';
import type { Services } from '../services';
import { getActor, getUser } from '../lib/current-user';
import { AUTH_SECURITY, problems } from '../lib/openapi';

const idParam = z.object({ id: z.string().min(1) });

export function registerInviteLinksRoutes(app: OpenAPIHono<AppEnv>, services: Services): void {
  const createLink = createRoute({
    method: 'post',
    path: '/decks/{id}/invite-links',
    tags: ['invite-links'],
    security: AUTH_SECURITY,
    request: {
      params: idParam,
      body: { content: { 'application/json': { schema: inviteLinkCreateSchema } }, required: true },
    },
    responses: {
      ...problems('bad-request', 'unauthorized', 'forbidden', 'not-found', 'conflict'),
      201: {
        content: { 'application/json': { schema: inviteLinkSchema } },
        description: 'A waiting invite link; `url` is the shareable address',
      },
    },
  });

  const listLinks = createRoute({
    method: 'get',
    path: '/decks/{id}/invite-links',
    tags: ['invite-links'],
    security: AUTH_SECURITY,
    request: { params: idParam },
    responses: {
      ...problems('unauthorized', 'forbidden', 'not-found'),
      200: {
        content: { 'application/json': { schema: inviteLinkListSchema } },
        description: 'Waiting, no-longer-valid and recently ended links, newest first',
      },
    },
  });

  const revokeLink = createRoute({
    method: 'delete',
    path: '/decks/{id}/invite-links/{linkId}',
    tags: ['invite-links'],
    security: AUTH_SECURITY,
    request: { params: idParam.extend({ linkId: z.string().min(1) }) },
    responses: {
      ...problems('unauthorized', 'forbidden', 'not-found', 'conflict'),
      204: { description: 'The link is revoked' },
    },
  });

  const previewRoute = createRoute({
    method: 'get',
    path: '/invites/preview',
    tags: ['invite-links'],
    summary: 'What an invite link offers (anonymous; unknown and stopped links answer alike)',
    request: { query: z.object({ t: z.string().min(1).max(256) }) },
    responses: {
      ...problems('bad-request', 'rate-limited'),
      200: {
        content: { 'application/json': { schema: invitePreviewSchema } },
        description: 'The link state; deck fields only while waiting',
      },
    },
  });

  const acceptRoute = createRoute({
    method: 'post',
    path: '/invite-links/accept',
    tags: ['invite-links'],
    security: AUTH_SECURITY,
    request: {
      body: { content: { 'application/json': { schema: inviteAcceptSchema } }, required: true },
    },
    responses: {
      ...problems('bad-request', 'unauthorized', 'conflict'),
      200: {
        content: { 'application/json': { schema: inviteAcceptResponseSchema } },
        description: 'Joined the deck with the link role',
      },
    },
  });

  app.openapi(previewRoute, async (c) => {
    const preview = await services.inviteLinks.preview(c.req.valid('query').t, 'preview', {
      requestId: c.get('requestId'),
    });
    c.header('Cache-Control', 'no-store');
    return c.json(preview, 200);
  });

  app.openapi(acceptRoute, async (c) =>
    c.json(await services.inviteLinks.accept(getActor(c), c.req.valid('json').token), 200),
  );

  app.openapi(createLink, async (c) => {
    const { id } = c.req.valid('param');
    const link = await services.inviteLinks.create(getActor(c), id, c.req.valid('json'));
    return c.json(link, 201);
  });

  app.openapi(revokeLink, async (c) => {
    const { id, linkId } = c.req.valid('param');
    await services.inviteLinks.revoke(getActor(c), id, linkId);
    return c.body(null, 204);
  });

  app.openapi(listLinks, async (c) => {
    const { id } = c.req.valid('param');
    return c.json({ links: await services.inviteLinks.list(getUser(c), id) }, 200);
  });
}
