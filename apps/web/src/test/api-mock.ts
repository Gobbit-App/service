import { vi } from 'vitest';

/**
 * Stand-in for `api/client`: each `api.METHOD(path)` call yields `"METHOD path"` and `unwrap`
 * hands that to `respond`, so tests answer per endpoint. `/config` defaults to no Cloudinary.
 *
 *   vi.mock('../api/client', () => import('../test/api-mock').then((m) => m.clientModule));
 */
export const respond = vi.fn<(request: string) => Promise<unknown>>();

const tag = (method: string) => (path: string) => `${method} ${path}`;

export const clientModule = {
  api: { GET: tag('GET'), POST: tag('POST'), DELETE: tag('DELETE') },
  unwrap: (request: unknown) => {
    if (request === 'GET /config') {
      return Promise.resolve({ cloudinaryCloudName: null, commit: 'test' });
    }
    return respond(String(request));
  },
};
