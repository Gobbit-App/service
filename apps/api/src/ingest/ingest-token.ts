import { INGEST_TOKEN_DISPLAY_PREFIX, INGEST_TOKEN_PREFIX } from '@pb/shared';
import { generateToken, hashToken } from '../lib/tokens';

/** A freshly minted ingest token with its storage hash and display prefix. */
export interface NewIngestToken {
  token: string;
  hash: string;
  prefix: string;
}

/** Token body: 32 random bytes encoded as 43 base64url characters. */
const TOKEN_BODY = /^[A-Za-z0-9_-]{43}$/;

/** Bearer header: scheme is case-insensitive, single token with no whitespace. */
const BEARER = /^Bearer\s+(\S+)\s*$/i;

/** Create a new ingest token, its SHA-256 hash, and a short display prefix. */
export function createIngestToken(): NewIngestToken {
  const token = INGEST_TOKEN_PREFIX + generateToken(32);
  return {
    token,
    hash: hashToken(token),
    prefix: token.slice(0, INGEST_TOKEN_DISPLAY_PREFIX),
  };
}

/** Return true when the value is a well-formed ingest token (prefix + 43-char body). */
export function isIngestToken(value: string): boolean {
  if (!value.startsWith(INGEST_TOKEN_PREFIX)) {
    return false;
  }
  return TOKEN_BODY.test(value.slice(INGEST_TOKEN_PREFIX.length));
}

/** Extract an ingest token from an `Authorization: Bearer ...` header, or null if absent/invalid. */
export function bearerIngestToken(authorization: string | undefined | null): string | null {
  if (typeof authorization !== 'string') {
    return null;
  }
  const match = BEARER.exec(authorization.trim());
  if (!match) {
    return null;
  }
  const token = match[1];
  if (token === undefined || !isIngestToken(token)) {
    return null;
  }
  return token;
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
