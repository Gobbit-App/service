import ipaddr from 'ipaddr.js';
import { promises as dns } from 'node:dns';

/** Thrown when a hostname resolves to an address that is not publicly routable. */
export class BlockedAddressError extends Error {
  constructor(public readonly address: string) {
    super(`Blocked address ${address}`);
    this.name = 'BlockedAddressError';
  }
}

/** Parsed IP address as returned by ipaddr.js. */
type ParsedAddress = ReturnType<typeof ipaddr.parse>;

/**
 * Returns true when the IP is not a unicast address (private, loopback, link-local, metadata,
 * reserved, etc.). Unparseable input is treated as blocked.
 */
export function isBlockedAddress(ip: string): boolean {
  let addr: ParsedAddress;
  try {
    addr = ipaddr.parse(ip);
  } catch {
    return true;
  }
  if (addr instanceof ipaddr.IPv6 && addr.isIPv4MappedAddress()) {
    addr = addr.toIPv4Address();
  }
  return addr.range() !== 'unicast';
}

/** Resolves a hostname to all of its addresses. */
export type LookupAll = (hostname: string) => Promise<{ address: string; family: number }[]>;

/** Default resolver backed by the system DNS, returning every address. */
export const systemLookupAll: LookupAll = (hostname) =>
  dns.lookup(hostname, { all: true, verbatim: true });

/**
 * Creates a `dns.lookup`-compatible function that refuses hostnames resolving to any blocked
 * address, so outbound fetches cannot be pointed at internal networks.
 */
export function createGuardedLookup(opts?: {
  lookupAll?: LookupAll;
  isBlocked?: (ip: string) => boolean;
}): (
  hostname: string,
  options: unknown,
  callback: (
    err: Error | null,
    address: string | { address: string; family: number }[],
    family?: number,
  ) => void,
) => void {
  const lookupAll = opts?.lookupAll ?? systemLookupAll;
  const isBlocked = opts?.isBlocked ?? isBlockedAddress;

  return (hostname, options, callback) => {
    void lookupAll(hostname)
      .then((list) => {
        const first = list[0];
        if (!first) {
          callback(new Error(`No address for ${hostname}`), '');
          return;
        }
        const blocked = list.find((entry) => isBlocked(entry.address));
        if (blocked) {
          callback(new BlockedAddressError(blocked.address), '');
          return;
        }
        const wantsAll =
          typeof options === 'object' &&
          options !== null &&
          (options as { all?: unknown }).all === true;
        if (wantsAll) {
          callback(null, list);
        } else {
          callback(null, first.address, first.family);
        }
      })
      .catch((err: unknown) => {
        callback(err as Error, '');
      });
  };
}
