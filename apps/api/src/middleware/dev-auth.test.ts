import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import type { AppEnv, CurrentUser } from '../types';
import { devAuth } from './dev-auth';
import { errorHandler } from './error-handler';

describe('devAuth middleware', () => {
  const TOKEN = 'x'.repeat(40);
  const USER: CurrentUser = {
    id: 'user-123',
    accountId: 'account-456',
    email: 'dev@example.test',
  };

  function setupApp(middlewareEnabled: boolean = true) {
    const app = new Hono<AppEnv>();

    if (middlewareEnabled) {
      app.use(
        '*',
        devAuth({
          token: TOKEN,
          lookupUser: async (email) => (email === 'dev@example.test' ? USER : null),
        }),
      );
    }

    app.get('/health', (c) => c.text('ok'));
    app.get('/me', (c) => c.json(c.get('user')));
    app.onError(errorHandler);

    return app;
  }

  describe('bypass paths', () => {
    it('/health without headers should bypass → 200', async () => {
      const app = setupApp();
      const res = await app.request('/health');
      expect(res.status).toBe(200);
      expect(await res.text()).toBe('ok');
    });
  });

  describe('authentication failures', () => {
    it('/me missing Authorization header → 401 problem+json', async () => {
      const app = setupApp();
      const res = await app.request('/me', {
        headers: {
          'X-Dev-User': 'dev@example.test',
        },
      });
      expect(res.status).toBe(401);
      expect(res.headers.get('Content-Type')).toBe('application/problem+json');
      const problem = await res.json();
      expect(problem.type).toBe('/problems/unauthorized');
      expect(problem.status).toBe(401);
    });

    it('/me missing X-Dev-User header → 401 problem+json', async () => {
      const app = setupApp();
      const res = await app.request('/me', {
        headers: {
          Authorization: `Bearer ${TOKEN}`,
        },
      });
      expect(res.status).toBe(401);
      expect(res.headers.get('Content-Type')).toBe('application/problem+json');
    });

    it('/me with wrong token (same length) → 401', async () => {
      const app = setupApp();
      const wrongToken = 'y'.repeat(40);
      const res = await app.request('/me', {
        headers: {
          Authorization: `Bearer ${wrongToken}`,
          'X-Dev-User': 'dev@example.test',
        },
      });
      expect(res.status).toBe(401);
    });

    it('/me with wrong token (different length) → 401', async () => {
      const app = setupApp();
      const wrongToken = 'short';
      const res = await app.request('/me', {
        headers: {
          Authorization: `Bearer ${wrongToken}`,
          'X-Dev-User': 'dev@example.test',
        },
      });
      expect(res.status).toBe(401);
    });

    it('/me with unknown user → 401', async () => {
      const app = setupApp();
      const res = await app.request('/me', {
        headers: {
          Authorization: `Bearer ${TOKEN}`,
          'X-Dev-User': 'unknown@example.test',
        },
      });
      expect(res.status).toBe(401);
    });
  });

  describe('successful authentication', () => {
    it('/me with correct credentials → 200 with user', async () => {
      const app = setupApp();
      const res = await app.request('/me', {
        headers: {
          Authorization: `Bearer ${TOKEN}`,
          'X-Dev-User': 'dev@example.test',
        },
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual(USER);
    });

    it('/me with uppercase X-Dev-User → 200 (normalized to lowercase)', async () => {
      const app = setupApp();
      const res = await app.request('/me', {
        headers: {
          Authorization: `Bearer ${TOKEN}`,
          'X-Dev-User': 'DEV@EXAMPLE.TEST',
        },
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual(USER);
    });
  });

  describe('without middleware', () => {
    it('app without middleware mounted → /me with user undefined → 200', async () => {
      const app = setupApp(false);
      const res = await app.request('/me');
      expect(res.status).toBe(200);
      // c.json(undefined) yields an empty body
      expect(await res.text()).toBe('');
    });
  });
});
