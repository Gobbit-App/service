/**
 * D166: social hosts that answer server fetches with a login wall, consent page, 403 or 429.
 * Their links get the member's shared caption and image, a host label, and no link checks.
 */
export const LOCKED_HOSTS = {
  'instagram.com': 'Instagram',
  'facebook.com': 'Facebook',
  'fb.watch': 'Facebook',
  'threads.net': 'Threads',
  'tiktok.com': 'TikTok',
  'x.com': 'X',
  'twitter.com': 'X',
  'linkedin.com': 'LinkedIn',
} as const;

export type LockedHost = keyof typeof LOCKED_HOSTS;

export interface LockedHostMatch {
  host: LockedHost;
  label: (typeof LOCKED_HOSTS)[LockedHost];
}

const HOSTS = Object.keys(LOCKED_HOSTS) as LockedHost[];

function hostnameOf(url: string): string | null {
  if (!URL.canParse(url)) return null;
  const parsed = new URL(url);
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
  return parsed.hostname.toLowerCase().replace(/\.$/, '');
}

/** The locked host for a URL (exact host or a subdomain on a dot boundary), or null. */
export function lockedHostOf(url: string): LockedHostMatch | null {
  const hostname = hostnameOf(url);
  if (!hostname) return null;
  const host = HOSTS.find((h) => hostname === h || hostname.endsWith(`.${h}`));
  return host ? { host, label: LOCKED_HOSTS[host] } : null;
}
