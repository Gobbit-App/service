import { createApiClient } from '@pb/api-client';
import { ApiError, type Problem } from './api-error';

/** The app's single typed client (same-origin `/api`, D52). */
export const api = createApiClient();

type FetchResult<T> = { data?: T; error?: unknown; response: Response };

function asProblem(error: unknown): Problem | null {
  return typeof error === 'object' && error !== null ? (error as Problem) : null;
}

/**
 * Turns an openapi-fetch result into data or a thrown `ApiError`, so TanStack Query sees
 * failures. Network failures are already thrown by fetch (`TypeError`) and pass through.
 */
export async function unwrap<T>(request: Promise<FetchResult<T>>): Promise<T> {
  const { data, error, response } = await request;
  if (!response.ok || error !== undefined) {
    throw new ApiError(response.status, asProblem(error));
  }
  return data as T;
}
