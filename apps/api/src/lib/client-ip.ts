import type { Context } from 'hono';
import { getConnInfo } from '@hono/node-server/conninfo';

export type ConnInfoFn = (c: Context) => { remote: { address?: string } };

/** Returns the client IP, or 'unknown' when nothing is available. */
export function clientIp(
  c: Context,
  headerName?: string,
  connInfo: ConnInfoFn = getConnInfo,
): string {
  // Check configured header first
  if (headerName && headerName.trim()) {
    const headerValue = c.req.header(headerName);
    if (headerValue) {
      const firstPart = headerValue.split(',')[0].trim();
      if (firstPart) {
        return firstPart;
      }
    }
  }

  // Fall back to connInfo
  try {
    const info = connInfo(c);
    if (info?.remote?.address) {
      return info.remote.address;
    }
  } catch {
    // connInfo may throw outside node-server
  }

  return 'unknown';
}
