import { createHash } from 'node:crypto';

/** sha256 hex of an opaque token — the only form in which session/link tokens are stored (D22). */
export function sha256Hex(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}
