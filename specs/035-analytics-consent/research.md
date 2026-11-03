# Research: Analytics consent (035)

Decisions continue the project D series in the range reserved for this feature (D259–D266). Builds on 031 (D231–D233, D243, ADR-062) and 033 (D252–D258, ADR-066). The durable part becomes ADR-068.

## Facts this plan relies on

- The CSP is `default-src 'self'` with no `script-src` override (`apps/web/Caddyfile`), so inline scripts are blocked. Anything that runs on an API-rendered page must be a first-party file served by the web image, as 033's `/analytics/page.js` already is. Inline `<style>` is allowed (`style-src 'self' 'unsafe-inline'`).
- Umami's tracker (v3, pinned `umami:3.4.1`) skips sending when `data-do-not-track="true"` and the browser sends DNT; it also skips when `localStorage['umami.disabled']` is set. Every payload passes the global `data-before-send` hook first; a falsy return cancels it. Removing its `<script>` element does not undo `window.umami` or its history hooks, so the only reliable "stop" after load is the hook.
- A dynamically inserted external script sees itself as `document.currentScript` while it runs, so attributes on an injected tracker tag work (033's SPA loader already relies on this).
- The SPA keeps `me` in the persisted query cache (033 reads the member id from it at send time). Sign-out clears the cache.
- `localStorage` is per origin, survives reloads, is never sent with requests, and is cleared by "clear site data".

## D259 — The member's choice lives on `users`, with a same-transaction audit row

- **Decision**: three nullable columns on `users`: `analytics_consent` (enum `allowed | declined`; null = not answered), `analytics_consent_at` and `analytics_consent_source` (enum `prompt | settings`); a CHECK keeps the three all-null or all-set. Every change inserts one `analytics_consent_events` row (`user_id`, `from_value` (null = not answered), `to_value`, `source`, `request_id`, `created_at`) in the same transaction, with the user row locked (`SELECT … FOR UPDATE`) so the recorded `from` is the real previous value. Saving the same value changes nothing and writes no row (FR-006).
- **Rationale**: FR-002, FR-006; one value per account, so it follows the member across devices (spec clarification). The audit row is the durable record (constitution VIII, the `waitlist_events` pattern, D240). Existing members get null, which is "not answered" (FR-002) — no backfill.
- **Alternatives**: a key/value `user_settings` table (a general mechanism for one value; nothing else needs it yet); the decision log only (not durable, not queryable for FR-007); storing "not answered" as a third enum value (needs a backfill and a default for every insert; null already means it).

## D260 — `GET /me` carries the choice; `PUT /me/analytics-consent` changes it

- **Decision**: `meSchema` gains `analyticsConsent: { value: 'unanswered' | 'allowed' | 'declined', at: string | null, source: 'prompt' | 'settings' | null }`. A new authenticated route `PUT /me/analytics-consent` takes `{ value: 'allowed' | 'declined', source: 'prompt' | 'settings' }` and answers `200` with the new `analyticsConsent`. It acts only on the session's own user (FR-006's forged-request edge case; there is no user id in the path). `ing_` tokens are refused as on every route but `/ingest`. The rule lives in `analytics-consent.service.ts` (route parses, service decides, `users.repo` writes). Every call records `analytics.consent` (`changed` / `unchanged`).
- **Rationale**: the app already loads `/me` on start and keeps it in the persisted cache, so every device learns the choice with no extra request (FR-003, FR-005). PUT is idempotent, matching "saving the same value records nothing".
- **Alternatives**: a separate `GET /me/analytics-consent` (one more request before analytics may start); `PATCH /me` (no other field of `/me` is writable; a narrow route is easier to audit).

## D261 — One rule decides whether anything is sent

- **Decision**: a pure `analyticsAllowed(member, device)` in `@gobbit/shared/analytics`:

  | Member choice (account) | Device choice (browser) | Send? |
  |---|---|---|
  | `allowed` | any | yes |
  | `declined` | any | no |
  | `unanswered` | `declined` | no (FR-010) |
  | `unanswered` | `unanswered` / `allowed` | yes (on unless declined) |
  | no member (anonymous page) | `declined` | no |
  | no member | otherwise | yes |

  Do Not Track and Global Privacy Control are not consulted (FR-001). `data-do-not-track` is removed from every tag. The member choice never writes the device choice and vice versa (spec edge case). Umami's `umami.disabled` switch is untouched and still wins (operator, smoke tests).
- **Rationale**: one testable function shared by the SPA, with the anonymous half mirrored in `page.js` (plain JS, unit-tested against the same table).
- **Alternatives**: setting `umami.disabled` on decline (mixes the visitor's choice with the operator's switch, and the member's "Allow" would have to clear the operator's setting).

## D262 — The SPA facade gates on consent and reacts without a reload

- **Decision**: `startAnalytics` reads the member's choice from the `me` cache with the member id, and the device choice from `localStorage` (key `gobbit.analytics.consent`, D264), on every page view and event. While the rule says no: the tracker is not loaded; if it is already loaded, the facade sends nothing and the before-send hook cancels every payload (`SanitizeContext.consented = false`). When the `me` cache changes to "allowed" (settings or prompt answer updates the cache), the facade loads the tracker at once if needed and sends the current screen's view. A device that has never seen `me` has no member id, so nothing loads until `/me` answers (FR-003). Another device sees a decline on its next `/me` refetch (focus/interval as today); until then it may send the current screen's view (spec edge case).
- **Rationale**: FR-003, FR-005, US2.2/2.6. The hook check is the single choke point that still holds if something outside the facade calls the tracker.
- **Alternatives**: page reload on change (spec forbids); removing the script tag (does not stop Umami's history hooks, see facts).

## D263 — The member prompt is an in-flow notice in the app shell

- **Decision**: `ConsentPrompt` renders in `RootLayout` above the outlet, in the document flow (never fixed or overlaid), as a labelled region with the explanation, "Allow" and "No thanks" (both `ui/buttons`) and a close icon button. It shows only when: `config.analytics` is set, `me.analyticsConsent.value === 'unanswered'`, it was not closed in this app start (in-memory, so it reappears on the next start, US2.5), and the current route allows it. Routes that never show it: everything untracked in the catalogue (`/sign-in`, `/auth/error`), the editor and new-card screens (unsaved input, 034's save action) and Browse (full-page paging and the dock). An answer calls `PUT /me/analytics-consent` with `source: 'prompt'` and writes the result into the `me` cache. A failed save keeps the prompt and says so. Focus is not moved to it on appear (non-blocking); it is reachable in tab order and announced as a region.
- **Rationale**: FR-004, FR-011, edge cases on editor/Browse/sign-in. In-flow at the top of the page can never cover a bottom dock or a save action.
- **Alternatives**: a fixed bottom sheet (covers Browse's dock and the editor's save on 360 px); a modal (blocks); tracking "unsaved input" per editor (fragile; hiding on the editor routes is simpler and stricter).

## D264 — Anonymous pages: `page.js` becomes the consent-aware loader

- **Decision**: API-rendered pages no longer render Umami's tag. When analytics is configured, the head renders only `<script defer src="/analytics/page.js" data-website-id data-domains [data-pattern data-screen]>`, and the body renders a hidden banner (`<section … hidden>` with the copy and "OK" / "No thanks" buttons) right after the site header, plus a hidden "Analytics" button in the landing privacy note and the public page footer. `page.js` (first-party, CSP unchanged):
  1. reads the device choice from `localStorage['gobbit.analytics.consent']` (`{ "value": "allowed" | "declined", "at": "<ISO date>" }`; anything else = not answered; storage errors = not answered);
  2. defines the before-send hook: `null` when declined, else the 033 pattern rewrite (public pages, share previews) or the payload unchanged (landing, as in 031);
  3. if not declined, injects Umami's tag with the same attributes as before minus `data-do-not-track`;
  4. shows the banner when not answered, reveals the "Analytics" button, and on a choice stores it, hides the banner, and either injects the tracker (allow, if not yet) or leaves the hook cancelling (decline). Reopening via "Analytics" shows the banner with the current choice and its date.

  With scripts off nothing appears (banner and button stay `hidden`, US3.4). Bots run no scripts. The choice is never sent: it only lives in `localStorage` and the hook never adds it to a payload (FR-009, SC-006). The share preview (`/s/…`, `meta refresh 0`) gets the same head; its banner is effectively never seen because the page redirects at once, but a stored decline is honoured there. Its markup is minimal (no layout).
- **Rationale**: FR-008, FR-009, US3; inline script is blocked by the CSP; server-rendered copy keeps the text in one place (API, escaped) and the script under the 2 KB gzip budget (SC-007). In-flow placement never covers the join form or a public page's content.
- **Alternatives**: a cookie (spec forbids); rendering the banner from JS strings (copy duplicated in a static file); keeping the server-rendered tracker tag and cancelling in the hook (the tracker script would still load from Umami for a visitor who said no).

## D265 — Records: audit rows, `analytics.consent`, counts by query

- **Decision**: `analytics.consent` decision event on every `PUT` (`changed` with `from`, `value`, `source`; `unchanged` with `value`, `source`; `to` is a forbidden decision-event key; always `userId`, `requestId`). `analytics.config` (D243/D258) gains `consent: 'opt_out'` when enabled, so each start announces that analytics is consent-based with "on unless declined" (FR-015). Counts by choice (FR-007) are one SQL query in `infra/README.md` § Analytics, next to 033's weekly cross-check; the cross-check now subtracts members who declined, and the alert reads the declined count first (FR-015).
- **Rationale**: constitution VIII; the audit table is the durable record and answers "who changed what when" (US2.7); a count query is enough for tens of members (SC-004 < 1 min).
- **Alternatives**: an admin screen with the counts (Phase 11 privacy review); a periodic `analytics.consent_summary` worker job (no consumer yet).

## D266 — Copy and privacy notes

- **Decision**: `@gobbit/shared/analytics` holds every string: the member prompt, the visitor banner, the landing privacy note and the Settings → Privacy text (with "on unless you decline", what is measured, what never is, and where to change it; no mention of Do Not Track as an off switch, FR-012). With analytics unconfigured, Settings → Privacy says "This server doesn't measure usage." and nothing else appears (FR-013). Settings shows the choice as a switch (`<input type="checkbox" role="switch">`) with "Since {date}" or "Not answered yet (on)"; offline, the switch is disabled with "Changing this needs a connection" (edge case: nothing queued).
- **Rationale**: FR-012, FR-013, US4; one source for the copy keeps landing and app consistent.
- **Alternatives**: a `/privacy` page (Phase 11).
