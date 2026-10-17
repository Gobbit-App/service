import { generateToken, hashToken } from './tokens';

/** A freshly minted prefixed token with its storage hash and display prefix. */
export interface NewPrefixedToken {
  token: string;
  hash: string;
  prefix: string;
}

/** Token body: 32 random bytes encoded as 43 base64url characters. */
const TOKEN_BODY = /^[A-Za-z0-9_-]{43}$/;

/** Bearer header: scheme is case-insensitive, single token with no whitespace. */
const BEARER = /^Bearer\s+(\S+)\s*$/i;

/** Mint `<prefix><43-char body>`, its SHA-256 hash and its first `displayChars` characters. */
export function createPrefixedToken(prefix: string, displayChars: number): NewPrefixedToken {
  const token = prefix + generateToken(32);
  return { token, hash: hashToken(token), prefix: token.slice(0, displayChars) };
}

/** True when the value is `prefix` followed by a well-formed 43-char body. */
export function hasPrefix(value: string, prefix: string): boolean {
  return value.startsWith(prefix) && TOKEN_BODY.test(value.slice(prefix.length));
}

/** The well-formed `prefix` token of an `Authorization: Bearer …` header, else null. */
export function bearerWithPrefix(
  authorization: string | undefined | null,
  prefix: string,
): string | null {
  if (typeof authorization !== 'string') return null;
  const token = BEARER.exec(authorization.trim())?.[1];
  return token !== undefined && hasPrefix(token, prefix) ? token : null;
}
