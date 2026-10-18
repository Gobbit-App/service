import { INGEST_TOKEN_DISPLAY_PREFIX, INGEST_TOKEN_PREFIX } from '@pb/shared';
import {
  bearerWithPrefix,
  createPrefixedToken,
  hasPrefix,
  type NewPrefixedToken,
} from '../lib/prefixed-token';

/** A freshly minted ingest token with its storage hash and display prefix. */
export type NewIngestToken = NewPrefixedToken;

/** Create a new ingest token, its SHA-256 hash, and a short display prefix. */
export function createIngestToken(): NewIngestToken {
  return createPrefixedToken(INGEST_TOKEN_PREFIX, INGEST_TOKEN_DISPLAY_PREFIX);
}

/** Return true when the value is a well-formed ingest token (prefix + 43-char body). */
export function isIngestToken(value: string): boolean {
  return hasPrefix(value, INGEST_TOKEN_PREFIX);
}

/** Extract an ingest token from an `Authorization: Bearer ...` header, or null if absent/invalid. */
export function bearerIngestToken(authorization: string | undefined | null): string | null {
  return bearerWithPrefix(authorization, INGEST_TOKEN_PREFIX);
}

/** Build an ingest token from an email local part (without prefix), or null when invalid. */
export function ingestTokenFromLocalPart(local: string): string | null {
  const candidate = INGEST_TOKEN_PREFIX + local;
  return isIngestToken(candidate) ? candidate : null;
}

/** Strip the ingest prefix from a token, yielding the email local part. */
export function localPartFromToken(token: string): string {
  return token.slice(INGEST_TOKEN_PREFIX.length);
}
