import type { MiddlewareHandler } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { API_BODY_MAX_BYTES, INGEST_BODY_MAX_BYTES } from '@gobbit/shared';
import { problemResponse } from '../errors/http-errors';

/** Paths that accept image uploads (D101); everything else gets the 1 MB default. */
export const LARGE_BODY_PATHS: ReadonlySet<string> = new Set(['/ingest']);

const tooLarge = (maxBytes: number): MiddlewareHandler =>
  bodyLimit({
    maxSize: maxBytes,
    onError: (c) =>
      problemResponse(c, {
        type: '/problems/payload-too-large',
        title: 'Payload Too Large',
        status: 413,
        detail: `The request body exceeds ${maxBytes} bytes`,
      }),
  });

/** D101: 25 MB on the ingest endpoint, 1 MB on the rest of the API. */
export function bodyLimits(): MiddlewareHandler {
  const large = tooLarge(INGEST_BODY_MAX_BYTES);
  const small = tooLarge(API_BODY_MAX_BYTES);
  return (c, next) => (LARGE_BODY_PATHS.has(c.req.path) ? large : small)(c, next);
}
