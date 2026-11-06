# Contract: crawler identity and host lookups

## Identities (`apps/api/src/fetch/user-agents.ts`)

| Constant | Value | Used by |
|----------|-------|---------|
| `CRAWLER_USER_AGENT` | `Mozilla/5.0 (compatible; GobbitBot/1.0; +https://github.com/Gobbit-App/service/blob/main/docs/crawler.md)` | page fetches for ingest, `link-snapshot`, the editor "Fetch preview"; oEmbed lookups; `createSafeImageFetch` (preview and share image downloads) |
| `BROWSER_USER_AGENT` | today's browser-like string | link checks only (`link-check-sweep`, `POST /items/{id}/link-check`) |

- `createSafeFetch({ identity?: 'crawler' | 'browser' })`: the default is `crawler`. The worker builds the link-check fetcher with `identity: 'browser'`.
- Requests send no cookies, no auth and no Referer, and never run scripts (unchanged).

## `docs/crawler.md` (public)

It must say:

- what GobbitBot is;
- that it fetches only links a member shared or saved, one page at a time;
- that it never logs in, keeps no cookies and runs no scripts;
- that it downloads only the preview picture;
- how to contact the project (repository issues).

## oEmbed lookups (`apps/api/src/fetch/lookup-hosts.ts`)

```ts
interface LookupHost { label: string; hosts: readonly string[]; endpoint(url: string): string }
export const LOOKUP_HOSTS: readonly LookupHost[];
export function lookupHostOf(url: string): LookupHost | null; // exact or dot-boundary subdomain, http(s) only
export async function lookupPreview(deps: { fetchJson: SafeJsonFetch; log }, url: string, ctx): Promise<LookupResult>;

type LookupResult =
  | { outcome: 'ok'; title?: string; image?: string }
  | { outcome: 'empty' }
  | { outcome: 'failed'; reason: 'timeout' | 'http_error' | 'invalid' | 'blocked' };
```

| Host match | Endpoint (url is `encodeURIComponent`ed) |
|------------|-------------------------------------------|
| `youtube.com`, `youtu.be` | `https://www.youtube.com/oembed?format=json&url=` |
| `tiktok.com` | `https://www.tiktok.com/oembed?url=` |
| `vimeo.com` | `https://vimeo.com/api/oembed.json?url=` |

- The answer schema is zod `{ title?: string, thumbnail_url?: string }`, and other keys are ignored.
- `thumbnail_url` must be absolute http(s) and ≤ `LINK_PREVIEW_IMAGE_URL_MAX`, otherwise it is ignored.
- `title` is trimmed and clipped to `LINK_PREVIEW_TITLE_MAX`.
- Neither present → `empty`.
- `instagram.com` and `facebook.com` must not match (unit test).

## `createSafeJsonFetch` (`safe-fetch.ts`)

```ts
type SafeJsonFetch = (url: string) => Promise<{ status: number | null; json: unknown | null; ms: number; error: string | null }>;
export function createSafeJsonFetch(opts?: { timeoutMs?: number; maxBytes?: number; client?: GuardedClient }): SafeJsonFetch;
```

- It uses the same guarded client as `createSafeFetch`: scheme, port and address checks on every hop, and the redirect limit.
- Request `Accept: application/json`, crawler identity.
- Response: a JSON content type is required (`application/json` or `+json`, or `text/javascript` for older endpoints).
- Defaults: `LINK_LOOKUP_TIMEOUT_MS`, `LINK_LOOKUP_MAX_BYTES`.
- Invalid JSON → `json: null`, `error: 'invalid_json'`.
