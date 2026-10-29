import { createHmac } from 'node:crypto';

export type LogHashKind = 'email' | 'ip';

/** `(kind, value)` → 16 hex characters; the same value always gives the same hash for one key. */
export type LogHash = (kind: LogHashKind, value: string) => string;

const LOG_HASH_LENGTH = 16;

/**
 * D239: keyed hash for `emailHash` / `ipHash` in decision events. HMAC-SHA256 with
 * `LOG_HASH_KEY`, so nobody without the key can reverse it with a list of likely addresses.
 * Emails are trimmed and lower-cased first, so every spelling of one address matches.
 */
export function createLogHash(key: string): LogHash {
  if (!key) throw new Error('createLogHash: key is required');
  return (kind, value) => {
    const input = kind === 'email' ? value.trim().toLowerCase() : value.trim();
    return createHmac('sha256', key).update(input, 'utf8').digest('hex').slice(0, LOG_HASH_LENGTH);
  };
}
