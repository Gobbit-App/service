import createFetchClient, { type Client, type ClientOptions } from 'openapi-fetch';
import createQueryClient from 'openapi-react-query';
import type { paths } from './schema';

export type { paths, components, operations } from './schema';

/** D52: the web app talks to the API same-origin under `/api` (Caddy and the Vite proxy strip it). */
export const API_BASE_URL = '/api';

export type ApiClient = Client<paths>;

/** Typed fetch client; the session cookie rides along same-origin. */
export function createApiClient(options: ClientOptions = {}): ApiClient {
  return createFetchClient<paths>({
    baseUrl: API_BASE_URL,
    credentials: 'same-origin',
    ...options,
  });
}

/** Typed TanStack Query hooks (`$api.useQuery`, `$api.useMutation`, `$api.queryOptions`). */
export function createQueryHooks(client: ApiClient) {
  return createQueryClient(client);
}
