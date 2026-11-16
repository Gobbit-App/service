import { createRoute, type OpenAPIHono } from '@hono/zod-openapi';
import {
  analyticsConsentSchema,
  mediaAssetConfirmRequestSchema,
  mediaAssetSchema,
  mediaSignResponseSchema,
  meSchema,
  profilePatchSchema,
  profileSchema,
  setAnalyticsConsentSchema,
  usernameCheckRequest,
  usernameCheckResponse,
} from '@gobbit/shared';
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
    const [decks, analyticsConsent, profile] = await Promise.all([
      services.decks.list(user),
      services.analyticsConsent.get(user),
      services.profile.get(user),
    ]);
    return c.json(
      {
        user: { id: user.id, email: user.email, displayName: user.displayName },
        profile,
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

  const profileRoute = createRoute({
    method: 'patch',
    path: '/me/profile',
    tags: ['auth'],
    security: AUTH_SECURITY,
    request: {
      body: { content: { 'application/json': { schema: profilePatchSchema } }, required: true },
    },
    responses: {
      200: {
        content: { 'application/json': { schema: profileSchema } },
        description:
          'The updated profile (046). Absent fields stay; null or blank clears. 422 on username (invalid, reserved, unavailable) or a field over its limit',
      },
      ...problems('bad-request', 'validation', 'unauthorized', 'unprocessable', 'rate-limited'),
    },
  });

  app.openapi(profileRoute, async (c) => {
    const profile = await services.profile.update(
      getUser(c),
      c.req.valid('json'),
      c.get('requestId'),
    );
    return c.json(profile, 200);
  });

  const usernameCheckRoute = createRoute({
    method: 'post',
    path: '/me/username/check',
    tags: ['auth'],
    security: AUTH_SECURITY,
    request: {
      body: { content: { 'application/json': { schema: usernameCheckRequest } }, required: true },
    },
    responses: {
      200: {
        content: { 'application/json': { schema: usernameCheckResponse } },
        description:
          'Advisory availability (D425): a taken and a held name both answer `unavailable`; the save decides. Rate limited per member, shared with member lookup',
      },
      ...problems('bad-request', 'validation', 'unauthorized', 'rate-limited'),
    },
  });

  app.openapi(usernameCheckRoute, async (c) => {
    const result = await services.profile.checkUsername(
      getUser(c),
      c.req.valid('json').username,
      c.get('requestId'),
    );
    return c.json(result, 200);
  });

  const avatarSignRoute = createRoute({
    method: 'post',
    path: '/me/avatar/sign',
    tags: ['auth'],
    summary: "Signed permission to upload the caller's own profile photo (046, D423)",
    security: AUTH_SECURITY,
    responses: {
      200: {
        content: { 'application/json': { schema: mediaSignResponseSchema } },
        description:
          'Signed image upload parameters for `gobbit/profiles/<userId>`; the API secret is never included',
      },
      ...problems('unauthorized', 'rate-limited', 'unavailable'),
    },
  });

  app.openapi(avatarSignRoute, async (c) => {
    const signed = await services.media.signProfileUpload({
      user: getUser(c),
      requestId: c.get('requestId'),
    });
    c.header('Cache-Control', 'no-store');
    return c.json(signed, 200);
  });

  const avatarAssetRoute = createRoute({
    method: 'post',
    path: '/me/avatar/assets',
    tags: ['auth'],
    summary: 'Record a finished profile-photo upload from its signed Cloudinary response (046)',
    security: AUTH_SECURITY,
    request: {
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
        description: 'Already recorded (idempotent)',
      },
      ...problems('validation', 'unauthorized', 'unprocessable', 'rate-limited', 'unavailable'),
    },
  });

  app.openapi(avatarAssetRoute, async (c) => {
    const { asset, created } = await services.media.confirmProfileUpload({
      user: getUser(c),
      body: c.req.valid('json'),
      requestId: c.get('requestId'),
    });
    c.header('Cache-Control', 'no-store');
    return created ? c.json(asset, 201) : c.json(asset, 200);
  });
}
