import { createRoute, type OpenAPIHono } from '@hono/zod-openapi';
import { analyticsConsentSchema, meSchema, setAnalyticsConsentSchema } from '@gobbit/shared';
import type { AppEnv } from '../types';
import type { Services } from '../services';
import { getUser } from '../lib/current-user';
import { AUTH_SECURITY, problems } from '../lib/openapi';

export function registerMeRoutes(app: OpenAPIHono<AppEnv>, services: Services): void {
  const meRoute = createRoute({
    method: 'get',
    path: '/me',
    tags: ['auth'],
    security: AUTH_SECURITY,
    responses: {
      200: {
        content: { 'application/json': { schema: meSchema } },
        description:
          'The signed-in user and every deck they have a role on; `isPlatformAdmin` shows the admin entry (032); `analyticsConsent` is their analytics choice (035)',
      },
      ...problems('unauthorized'),
    },
  });

  app.openapi(meRoute, async (c) => {
    const user = getUser(c);
    const [decks, analyticsConsent] = await Promise.all([
      services.decks.list(user),
      services.analyticsConsent.get(user),
    ]);
    return c.json(
      {
        user: { id: user.id, email: user.email, displayName: user.displayName },
        decks,
        isPlatformAdmin: services.platformAdmins.is(user),
        analyticsConsent,
      },
      200,
    );
  });

  const consentRoute = createRoute({
    method: 'put',
    path: '/me/analytics-consent',
    tags: ['auth'],
    security: AUTH_SECURITY,
    request: {
      body: {
        content: { 'application/json': { schema: setAnalyticsConsentSchema } },
        required: true,
      },
    },
    responses: {
      200: {
        content: { 'application/json': { schema: analyticsConsentSchema } },
        description:
          "The caller's analytics choice after saving (D260); the same answer when it was already that value",
      },
      ...problems('bad-request', 'unauthorized', 'forbidden'),
    },
  });

  app.openapi(consentRoute, async (c) => {
    const consent = await services.analyticsConsent.set(getUser(c), c.req.valid('json'), {
      requestId: c.get('requestId'),
    });
    return c.json(consent, 200);
  });
}
