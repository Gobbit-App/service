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

/** What `GET /config` answers with; tests that render images or need sharing set it and reset it. */
export const mockConfig: { cloudinaryCloudName: string | null; ingestEnabled: boolean } = {
  cloudinaryCloudName: null,
  ingestEnabled: false,
};

export const clientModule = {
  api: { GET: tag('GET'), POST: tag('POST'), PATCH: tag('PATCH'), DELETE: tag('DELETE') },
  unwrap: (request: unknown) => {
    if (request === 'GET /config') {
      return Promise.resolve({
        cloudinaryCloudName: mockConfig.cloudinaryCloudName,
        commit: 'test',
        search: { semantic: false, ask: false },
        ingest: { enabled: mockConfig.ingestEnabled, emailDomain: null, shortcutUrl: null },
        analytics: null,
      });
    }
    return respond(String(request));
  },
};
