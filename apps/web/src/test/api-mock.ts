import { vi } from 'vitest';

/**
 * Stand-in for `api/client`: each `api.METHOD(path)` call yields `"METHOD path"` and `unwrap`
 * hands that to `respond`, so tests answer per endpoint. `/config` defaults to no Cloudinary.
 *
 *   vi.mock('../api/client', () => import('../test/api-mock').then((m) => m.clientModule));
 */
export const respond = vi.fn<(request: string) => Promise<unknown>>();

/** Every call's method, path and options (e.g. to inspect a request body). */
export const requests = vi.fn<(request: string, init?: unknown) => void>();

const tag = (method: string) => (path: string, init?: unknown) => {
  const request = `${method} ${path}`;
  requests(request, init);
  return request;
};

export const clientModule = {
  api: { GET: tag('GET'), POST: tag('POST'), PATCH: tag('PATCH'), DELETE: tag('DELETE') },
  unwrap: (request: unknown) => {
    if (request === 'GET /config') {
      return Promise.resolve({
        cloudinaryCloudName: null,
        commit: 'test',
        search: { semantic: false, ask: false },
        ingest: { enabled: false, emailDomain: null, shortcutUrl: null },
      });
    }
    return respond(String(request));
  },
};
