/**
 * D343 (ADR-075): who the server says it is on outbound requests.
 *
 * - `crawler`: page fetches for previews and shares, host lookups and image downloads. An honest
 *   link-preview crawler with a page that explains it (`docs/crawler.md`).
 * - `browser`: link checks only, so sites that refuse crawlers don't get their links flagged dead.
 */
export const CRAWLER_USER_AGENT =
  'Mozilla/5.0 (compatible; GobbitBot/1.0; +https://github.com/Gobbit-App/service/blob/main/docs/crawler.md)';

export const BROWSER_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36 Gobbit/1.0';

export type FetchIdentity = 'crawler' | 'browser';

export function userAgentFor(identity: FetchIdentity = 'crawler'): string {
  return identity === 'browser' ? BROWSER_USER_AGENT : CRAWLER_USER_AGENT;
}
