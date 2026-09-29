import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { TOKEN_BYTES } from '@pb/shared';

/** Generate a random token as base64url-encoded string. */
export function generateToken(bytes = TOKEN_BYTES): string {
  return randomBytes(bytes).toString('base64url');
}

/** Hash a token using SHA-256, returning a lowercase hex string. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

/** Compare two hash strings in constant time, returning false for different lengths. */
export function hashesEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  try {
    return timingSafeEqual(Buffer.from(a), Buffer.from(b));
  } catch {
    return false;
  }
}
