import { INGEST_TOKEN_PREFIX } from '@gobbit/shared';

/**
 * ADR-046: prefixes of tokens that are never sessions. `session-auth` refuses a bearer with one of
 * them (outside the routes that accept it) without a database lookup. Phase 13 adds the MCP
 * prefixes (`mcp_`, `mcpa_`, `mcpr_`).
 */
export const NON_SESSION_TOKEN_PREFIXES: readonly string[] = [INGEST_TOKEN_PREFIX];

/** The registered prefix the value starts with, else null (the longest match wins). */
export function nonSessionPrefixOf(value: string): string | null {
  const matches = NON_SESSION_TOKEN_PREFIXES.filter((p) => value.startsWith(p));
  if (matches.length === 0) return null;
  return matches.reduce((a, b) => (b.length > a.length ? b : a));
}
