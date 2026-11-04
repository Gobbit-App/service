import { createRoute, type OpenAPIHono } from '@hono/zod-openapi';
import {
  notificationPreferencesSchema,
  pendingListSchema,
  pushSubscriptionInputSchema,
  pushTestResultSchema,
  removePushSubscriptionSchema,
} from '@gobbit/shared';
import type { AppEnv } from '../types';
import type { Services } from '../services';
import { getUser } from '../lib/current-user';
import { AUTH_SECURITY, problems } from '../lib/openapi';

/**
 * 037 (D297, D298): what is waiting on the caller, their push devices, test notification and
 * reminder-email switch.
 */
export function registerNotificationRoutes(app: OpenAPIHono<AppEnv>, services: Services): void {
  const json = <T>(schema: T) => ({ content: { 'application/json': { schema } }, required: true });

  const pendingRoute = createRoute({
    method: 'get',
    path: '/me/pending',
    tags: ['notifications'],
    security: AUTH_SECURITY,
    responses: {
      200: {
        content: { 'application/json': { schema: pendingListSchema } },
        description:
          'Reminders waiting on you (overdue first, then by deadline) and your not-yet-shown ones',
      },
      ...problems('unauthorized'),
    },
  });
  app.openapi(pendingRoute, async (c) => {
    return c.json(await services.pending.list(getUser(c)), 200);
  });

  const addRoute = createRoute({
    method: 'post',
    path: '/me/push-subscriptions',
    tags: ['notifications'],
    security: AUTH_SECURITY,
    request: { body: json(pushSubscriptionInputSchema) },
    responses: {
      204: {
        description: 'This device now gets reminder push notifications (re-adding refreshes it)',
      },
      ...problems('bad-request', 'unauthorized', 'forbidden', 'not-found'),
    },
  });
  app.openapi(addRoute, async (c) => {
    await services.pushSubscriptions.add(getUser(c).id, c.req.valid('json'), {
      requestId: c.get('requestId'),
    });
    return c.body(null, 204);
  });

  const removeRoute = createRoute({
    method: 'delete',
    path: '/me/push-subscriptions',
    tags: ['notifications'],
    security: AUTH_SECURITY,
    request: { body: json(removePushSubscriptionSchema) },
    responses: {
      204: { description: 'Push is off for this device (or was already)' },
      ...problems('bad-request', 'unauthorized', 'forbidden', 'not-found'),
    },
  });
  app.openapi(removeRoute, async (c) => {
    await services.pushSubscriptions.remove(getUser(c).id, c.req.valid('json').endpoint, {
      requestId: c.get('requestId'),
    });
    return c.body(null, 204);
  });

  const testRoute = createRoute({
    method: 'post',
    path: '/me/push-subscriptions/test',
    tags: ['notifications'],
    security: AUTH_SECURITY,
    responses: {
      202: {
        content: { 'application/json': { schema: pushTestResultSchema } },
        description: 'A test notification went to this many of your devices',
      },
      ...problems('unauthorized', 'forbidden', 'not-found', 'rate-limited'),
    },
  });
  app.openapi(testRoute, async (c) => {
    return c.json(await services.pushSubscriptions.test(getUser(c).id), 202);
  });

  const getPrefsRoute = createRoute({
    method: 'get',
    path: '/me/notification-preferences',
    tags: ['notifications'],
    security: AUTH_SECURITY,
    responses: {
      200: {
        content: { 'application/json': { schema: notificationPreferencesSchema } },
        description: 'Whether you get an email when a reminder you can mark done is due',
      },
      ...problems('unauthorized'),
    },
  });
  app.openapi(getPrefsRoute, async (c) => {
    return c.json(await services.pushSubscriptions.preferences(getUser(c).id), 200);
  });

  const putPrefsRoute = createRoute({
    method: 'put',
    path: '/me/notification-preferences',
    tags: ['notifications'],
    security: AUTH_SECURITY,
    request: { body: json(notificationPreferencesSchema) },
    responses: {
      200: {
        content: { 'application/json': { schema: notificationPreferencesSchema } },
        description: 'Your notification choices after saving',
      },
      ...problems('bad-request', 'unauthorized', 'forbidden'),
    },
  });
  app.openapi(putPrefsRoute, async (c) => {
    const prefs = await services.pushSubscriptions.setPreferences(
      getUser(c).id,
      c.req.valid('json'),
    );
    return c.json(prefs, 200);
  });
}
