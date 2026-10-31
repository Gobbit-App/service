# Research: App analytics (033)

Decisions continue the project D series (D244–D250). Builds on 031 (D231–D233, D243, ADR-062). Umami behaviour below is from the v3 tracker source (`src/tracker/index.js`) at the pinned image `ghcr.io/umami-software/umami:3.4.1`.

## Umami tracker facts this plan relies on

- `data-auto-track="false"` stops the automatic page view and the `history.pushState`/`replaceState` hooks from tracking; `umami.track()` (no argument) sends a page view, `umami.track(name, data)` an event, `umami.track(fn)` sends what `fn(defaultPayload)` returns (nothing when falsy).
- `data-before-send="<global fn name>"`: every request (page view, event, identify) passes through `fn(type, payload)`; a falsy return cancels it. This is the one choke point for every payload, including ones the tracker builds itself.
- `getPayload()` = `website, screen, language, title, hostname, url, referrer, tag, id`; `id` is the distinct id, set by `umami.identify(string)`.
- `send()` returns early when tracking is disabled: no website id, `localStorage['umami.disabled']`, host not in `data-domains`, or Do Not Track with `data-do-not-track="true"`. Requests use `fetch(…, { keepalive: true, credentials: 'omit' })`; errors are swallowed.
- The server returns a `cache` token that the tracker echoes as `x-umami-cache` on later requests (it pins the session). `identify()` clears it. A member change without `identify()` would keep the previous member's session token.

## D244 — Route pattern catalogue keyed by router route id

- **Decision**: the SPA sends `url` = the route pattern and `title` = a fixed screen name looked up from a catalogue typed as `Record<RouteId, Screen | null>` over TanStack Router's generated route ids (`FileRouteTypes['id']`). `null` marks untracked screens (`/sign-in`, `/auth/error`). Adding a route without a catalogue entry fails `tsc`. Unknown ids at runtime (should not happen) send `/other` / "Other". Public pages and share previews get their pattern and screen name from the API renderer, which knows which page it renders (`/p/:deck`, `/p/:deck/c/:category`, `/p/:deck/i/:item`, `/p/:deck/search`, `/s/:item`). Patterns use the app's real routes (cards live at `/i/:item`, not under the deck).
- **Rationale**: the router already resolved which screen is showing; deriving the pattern from the real URL with regexes would duplicate the route table and leak when it drifts. Typing the catalogue against the generated ids makes drift a compile error (FR-003, FR-004).
- **Alternatives**: regex rewrite of `location.pathname` (drifts, misses new params); Umami's `data-exclude-search` only (still sends slugs and ids in the path).

## D245 — The SPA loads the tracker late, only for a signed-in member

- **Decision**: `GET /config` gains `analytics: { siteId, host } | null` (from `ANALYTICS_SITE_ID`, `APP_URL`/`API_URL`). A small facade in the main chunk (`apps/web/src/analytics/analytics.ts`) starts after the first route resolves and `me` is loaded: on idle (`requestIdleCallback`, `setTimeout` fallback) it dynamically imports the `analytics/tracker` chunk, which installs the before-send hook and appends Umami's tag (`/stats/script.js`, `data-auto-track="false"`, `data-do-not-track="true"`, `data-domains`, `data-exclude-search`, `data-exclude-hash`, `data-before-send`). Page views come from `router.subscribe('onResolved')`, one per change of real pathname (search-only changes such as Browse's `i` are the same screen). `index.html` stays tracker-free (031's shell check keeps passing).
- **Rationale**: FR-011 (budget unchanged, loads after interactive), FR-002 (sign-in never loads it: no member, no tracker), FR-010 (no config → nothing loaded). Runtime config means one image for every deployment (self-hosters too).
- **Alternatives**: build-time `VITE_` site id (bakes one deployment's id into the public image); tag in `index.html` (in every page, before sign-in, and against 031's shell check); our own `fetch` to `/api/send` (re-implements DNT, opt-out and domain checks the tracker already has, and couples to the collect API).

## D246 — One sanitising before-send hook per surface

- **Decision**: every payload passes `sanitizePayload(type, payload, context)` (`@gobbit/shared/analytics`, pure, unit-tested): `url` = current pattern, `title` = current screen name, `referrer` = origin only (empty for same-origin and invalid), `hostname` kept, `tag` dropped, `id` = current member id or removed, event `data` filtered to the allow-list (`deckId`, `itemId`, `count`, `type`, `channel`; ids must be UUIDs, `type`/`channel` from fixed enums, `count` a positive integer); unknown event names, `navigator.onLine === false`, and `identify` without a member return `null` (cancelled). Public pages and share previews use a ~20-line first-party script (`apps/web/public/analytics/page.js`) that applies the same rules with its pattern/screen from `data-` attributes (no member id, no events). It loads before the tracker (both `defer`, document order).
- **Rationale**: FR-003/004/007/009 hold even for payloads the tracker builds itself (e.g. its own referrer); one function to test (SC-003). No inline script, so the CSP stays unchanged (FR-008).
- **Alternatives**: rely on callers passing clean data (one forgotten call leaks); inline script on public pages (needs `'unsafe-inline'` or a hash in the CSP).

## D247 — Member identity = Gobbit user id, reset on every change

- **Decision**: the hook sets `id` from the `me` query in the query cache at send time (no copy kept elsewhere). Before each page view or event, the facade compares the current member id with the last one it sent; on any change (sign-in, sign-out, another member) it calls `umami.identify(newId)` — or `umami.identify({})` with no member, which the hook cancels — so Umami's `cache` session token is cleared and the next request starts a new session. Sign-out also clears the query cache (`queryClient.clear()`), so nothing afterwards carries the old id. Only the id: no email, name or role (FR-005).
- **Rationale**: owner decision (spec clarifications) to join analytics with Gobbit data; the `cache` token behaviour would otherwise carry the previous member's session across a sign-out without reload (US2.2).
- **Alternatives**: hashed id (owner wants a direct join); calling `identify` only at sign-in (session token survives sign-out).

## D248 — Four content events from the app's success paths

- **Decision**: `trackContent(name, props)` in the facade, called from mutation success paths only (after the server accepted):

  | Event | Where | Props |
  |-------|-------|-------|
  | `card-created` | editor create (`useCreateItem`) | deckId, itemId, type, channel `editor` |
  | `card-created` | review publish as new | deckId, itemId, type, channel `review` |
  | `card-created` | bulk publish | deckId, count, channel `bulk-publish` |
  | `card-created` | notes import (proposals) | deckId, count, channel `import` |
  | `card-edited` | editor save (`useUpdateItem`) | deckId, itemId, type, channel `editor` |
  | `card-edited` | review apply as update | deckId, itemId, type, channel `review` |
  | `card-edited` | archive / restore / undelete | deckId, itemId, type, channel `archive` / `restore` / `undelete` |
  | `card-deleted` | delete | deckId, itemId, type, channel `card-menu` |
  | `card-shared` | share button (system sheet or copied link) | deckId, itemId, type, channel `share-sheet` / `copy-link` |
  | `card-shared` | share target / paste box (`POST /ingest` accepted) | deckId (when chosen), channel `share-target` |

  Not queued: before the tracker is loaded, offline, or with DNT, the call is a no-op. A failing tracker never throws into the caller (wrapped).
- **Rationale**: FR-006, FR-009; spec edge cases (bulk = one event with a count; undelete = edited).
- **Alternatives**: server-side events from the API (covers Shortcut/email too, but needs the API to call Umami and identifies by request, out of scope per spec assumptions).

## D249 — Public pages and share previews carry the tag when configured

- **Decision**: `layout()` keeps its opt-in `PageHead.analytics`; 031's `AnalyticsHead` gains an optional `page: { pattern, screen }`. With `page`, the tag is rendered with `data-auto-track="true"` and `data-before-send`, preceded by `/analytics/page.js` carrying the pattern and screen; without it (landing) the tag is unchanged. Public deck, category, item and search pages set it; error pages, sitemap and robots never do. Share previews (`renderSharePage`) render the same two tags for `/s/:item` when configured; because the page redirects at once (`meta refresh 0`), the view is best effort (the tracker sends with `keepalive` after parsing; a refresh that wins the race loses the view). Public cards' share links already redirect to `/p/…` and are counted there.
- **Rationale**: FR-001, US3.4; same opt-in-per-head rule as 031 (D232), now with patterns.
- **Alternatives**: delay the share redirect until the tracker has sent (slows every human share open); count `/s` in the destination (double counting, extra query flag).

## D250 — Records and privacy notice

- **Decision**: `analytics.config` (D243) gains `surfaces: ['landing', 'app', 'public', 'share']` when enabled (FR-012). The operator's weekly check compares Umami's `card-created` (channel `editor` + `review`) with `item_events` `created` rows made by members for the same week; alert when analytics > activity log or < 50% of it for two weeks (SC-004), and when analytics shows zero app page views for 24 h while `analytics.config` is enabled and sessions were created. The landing's privacy line and the Settings screen state that in-app use is measured with the member id (no content, Do Not Track turns it off) (FR-013).
- **Rationale**: constitution VIII (Umami is never the record; the activity log is); FR-013 must ship before the next invite batch.
- **Alternatives**: a separate `/privacy` page (worth doing in Phase 11's privacy review; one line in each place a member sees is enough for the invite-only phase).
