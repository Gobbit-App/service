/**
 * D296: the push services browsers hand out endpoints for. Anything else is refused on
 * registration and never contacted. Kept in one place so a new service is a one-line change.
 */
const EXACT_HOSTS = new Set(['fcm.googleapis.com', 'web.push.apple.com']);
const HOST_SUFFIXES = ['.push.services.mozilla.com', '.notify.windows.com', '.push.apple.com'];

/** True when `url` is https on the default port and its host is a known push service. */
export function isAllowedPushHost(url: URL): boolean {
  if (url.protocol !== 'https:') return false;
  if (url.port !== '' && url.port !== '443') return false;
  if (url.username || url.password) return false;
  const host = url.hostname.toLowerCase();
  return EXACT_HOSTS.has(host) || HOST_SUFFIXES.some((suffix) => host.endsWith(suffix));
}

/** String form for request validation; malformed URLs are not allowed. */
export function isAllowedPushEndpoint(endpoint: string): boolean {
  try {
    return isAllowedPushHost(new URL(endpoint));
  } catch {
    return false;
  }
}
