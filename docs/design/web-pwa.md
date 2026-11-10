# Reader PWA

_Overview: [architecture.md](../architecture.md). Decisions: [adr.md](../adr.md)._

Request routing and CI/deploy notes: [deployment.md](deployment.md).

## App structure (`apps/web/src`)

| Folder                | Holds                                                                                                                                                                                                                                                                                                                                                                                    |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `routes/`             | File routes (D65): `/`, `/sign-in?next=`, `/auth/error?reason=`, `/d/$slug`, `/d/$slug/c/$category`, `/d/$slug/favorites`, `/d/$slug/archived`, `/d/$slug/new?type=` (card editor, Phase 3B, all types from Phase 6), `/d/$slug/search?q=&mode=` (Phase 4), `/i/$itemId`, `/i/$itemId/edit` (Phase 6)                                                                                    |
| `api/`                | Typed client, query keys and queries, session and 401 redirect, favorites with optimistic cache updates, network state and offline detection, persistence, card creation and update (`create-item.ts`, `update-item.ts`), inline category create (`create-category.ts`), form error messages (`problem-messages.ts`) and the optimistic lifecycle actions (`item-lifecycle.ts`, Phase 6) |
| `cards/`              | One renderer per card type (also the editor preview, D136). `CalcCard` is a `React.lazy` chunk because the evaluator pulls `mathjs` (D57). Phase 6: `EntityChips`, `EditLink` and `canEditItem`                                                                                                                                                                                          |
| `editor/`             | Phase 6 card editor (`CardEditor`, preview, tabs, type picker, save bar), the draft model (`draft.ts`), zod-free validation (`validate.ts`), drafts store and autosave, and `fields/` (the per-type registry and shared fields)                                                                                                                                                          |
| `items/`              | The item list for a deck/category/favorites/archived view and its empty-state copy; the role-gated `AddCardLink` (the Phase 3B editor moved to `editor/` in Phase 6); Phase 6 `CardActions` (archive/restore/delete/undelete) and `DeletedSection` (Recently deleted)                                                                                                                    |
| `deck-admin/`         | Phase 8 deck settings at `/d/$slug/settings` (D184): `DeckSection` (name, public switch with `PublicSwitchDialog`, public address), `CategoriesSection` (rename, visibility), `MembersSection` + `InviteForm` (invite, role, remove), mutations in `deck-admin-queries.ts`, refusal copy in `admin-errors.ts`; `DeckSettingsLink` in the deck header for `deck.update` roles             |
| `search/`             | Phase 4: `SearchResults`, `ModeToggle`, the lazy `AskView`, URL params and recent searches                                                                                                                                                                                                                                                                                               |
| `ui/`, `lib/`, `app/` | Shared components (chips, status views, `NavLink`, the app-wide Undo toast), `deckHref(slug, path)` (D143), copy tables, header and the service-worker update prompt                                                                                                                                                                                                                     |

- Session (D66): the app calls `GET /api/me` on boot; any 401 sends the user to `/sign-in?next=<path>`. The magic-link request carries `next`; the API callback redirects to `APP_URL + next` only for same-origin paths (`//host` and absolute URLs are dropped). Sign-out navigates to `/sign-in` first, then calls `POST /api/auth/logout`, clears the persisted cache and the local editor drafts, so no route re-fetches with a dead cookie.
- Runtime config (D55): `GET /api/config` → `{ cloudinaryCloudName, commit }`, cached for the session in the persisted query cache. One web image works in every environment.
- Styling: plain CSS with custom properties (`styles.css`); every colour is `light-dark(light, dark)`, so the theme follows `color-scheme` (D383); no UI kit. Initial JS is asserted ≤ 150 KB gzip in CI (`pnpm budget`, reads the Vite manifest).
- Phone fit: every page fits a 360px viewport with no sideways scroll. Grid forms declare `grid-template-columns: minmax(0, 1fr)` (an implicit `auto` column grows to the longest `<select>` option), form controls carry `min-width: 0; max-width: 100%`, and screens rendered inside `main.page` add no gutter of their own. Guarded by `e2e/tests/full/mobile-fit.spec.ts` (`@full`).

## App palette and themes (D383)

A 60 / 30 / 10 palette per theme, with fresh mint `#22e3a2` as the shared 10%:

| Theme | 60% (page)              | 30% (text, solids)                                          | 10% (accent)         |
| ----- | ----------------------- | ----------------------------------------------------------- | -------------------- |
| Light | ice blue `#dde9f2`      | midnight carbon `#161b21` text, ivory cream `#f7f2e4` cards | fresh mint `#22e3a2` |
| Dark  | midnight navy `#0e1b2e` | oat milk `#eadfcd` text, midnight carbon `#171c23` cards    | fresh mint `#22e3a2` |

- **Tokens**: one `:root` block in `styles.css` (and `cards/rich-text.css`), each colour `light-dark(#light, #dark)`; no `prefers-color-scheme` anywhere in the app CSS. Mint is split into `--color-accent-fill` (always `#22e3a2`: primary buttons, the + action, current/pressed state, native controls via `accent-color`) and `--color-accent` as ink (mint on navy, deep mint `#07664a` on ice, so links and focus rings keep ≥ 4.5:1). `styles.test.ts` parses both sides and asserts the AA pairs.
- **Theme choice**: Settings → Appearance (`settings/AppearanceSection.tsx`): Match device / Light / Dark, saved per device in `localStorage` `gobbit:theme` (`theme/theme.ts`; Match device removes the key, unknown values read as Match device). A choice sets `data-theme` on `<html>`, which pins `color-scheme`, and repaints both `theme-color` metas. `public/theme-init.js` applies a stored choice before first paint (a same-origin file because the CSP allows no inline script); `theme.test.ts` runs it against `applyTheme`.
- **Surfaces**: two tiers. Brushed glass (`--glass-bg` + `--brush`, a fine horizontal SVG-noise grain, `backdrop-filter: blur(22px) saturate(1.5)`, lit top edge) for the panels and overlays: header, bottom bar, menus, sheets, consent prompt, toasts and the Browse chrome. Solid cards (`--card-*` tokens: ivory cream in light, midnight carbon in dark, no blur) for cards and every other repeating item — deck rows, the Browse card, deleted cards, activity rows, notifications, type tiles, import rows; one rule swaps the card tokens in for the page ones, so inputs, chips and dividers inside follow. Inverting the cards to the 30% text colour was tried and rejected (it flips the theme). A fixed ambient mint/navy light (`body::before`) gives the glass something to blur.
- **Glow**: `--glow-panel` for major panels only (sheets, menus, the Browse card, toasts) and `--glow-accent` for the primary action on hover/focus; ordinary cards and rows get none.
- **Lines**: mint at 30% (`--accent-hair`) on structural edges only — under the header, above the bottom bar, the divider over a card's action bar; card chips outline in `--accent-line`. Repeating items never get a border: fill and spacing separate them (a selected type tile is marked by fill and a ring).
- **Shape and rhythm**: no rounded corners (`--radius*` are 0, every literal radius uses the token); 20 px gutter (28 px from 600 px); one 4/8 px spacing scale (`--space-1`…`--space-7`).
- **Type**: Schibsted Grotesk (variable, self-hosted via `@fontsource-variable/schibsted-grotesk`, Latin subsets only; system fonts cover Hebrew), headings tighten as they grow.
- E2E tier: full (`e2e/tests/full/appearance.spec.ts`: a picked theme applies, persists across reload and wins over the device; Match device hands back; an unknown stored value is ignored). The restyle adds no journeys.
- **Not yet moved** (follow-ups): the PWA manifest `theme_color`/`background_color` and the icon tiles (`pnpm og:static`), and the API-rendered public pages, landing and share previews still use the D272 palette with `prefers-color-scheme`.

## Palette (D272)

_From D383 the app uses the palette above; D272 still drives the public pages, landing, OG images, icons and the manifest._

Green brand palette from four owner-supplied colours: mint `#d7f0db`, slate `#49535e`, light green `#b2e29b`, deep teal `#195b5c`. The same values drive the app tokens (`styles.css`), the public pages and landing (`apps/api/src/public/styles.ts`, shared by `landing-styles.ts`), the OG images and icons (`OG_COLORS`, re-rendered with `pnpm og:static`), `theme-color` and the manifest.

| Token                      | Light                        | Dark                    |
| -------------------------- | ---------------------------- | ----------------------- |
| `--color-bg`               | `#f3faf4` (mint tint)        | `#121a1c`               |
| `--color-surface`          | `#ffffff`                    | `#1a2629`               |
| `--color-text`             | `#232b31` (dark slate)       | `#e8f3ea`               |
| `--color-muted`            | `#49535e` (slate)            | `#a3b5b0`               |
| `--color-border`           | `#cfe3d4`                    | `#2c3e41`               |
| `--color-accent`           | `#195b5c` (teal)             | `#b2e29b` (light green) |
| `--color-accent-text`      | `#ffffff`                    | `#121a1c`               |
| `--color-accent-soft`      | `#d7f0db` (mint)             | `#1f4243`               |
| `--color-highlight`        | `#b2e29b` (search hit marks) | `#195b5c`               |
| `--color-danger`           | `#a12b2b`                    | `#f08a8a`               |
| `--color-banner` / `-text` | `#195b5c` / `#ffffff`        | `#d7f0db` / `#121a1c`   |

- Contrast (WCAG 2.x): every text pair is ≥ 4.5:1 in both themes — lowest are muted on accent-soft (light 6.48:1, dark 5.10:1) and danger on surface (dark 6.43:1); accent-text on accent is 7.80:1 (light) and 11.97:1 (dark). `styles.test.ts` asserts the pairs from the tokens. No brand colour needed adjusting.
- Focus rings stay `--color-accent` (light green on a light background would be under 3:1). The public pages gained `--on-accent` (button text) and `--danger` (the landing form's errors, formerly a fixed red that failed in dark mode).
- Logo-only colours (D321): mid teal `#2a7a7b` (the main mark's body card) and bit yellow `#f4b942` (the chimney bits and the G's bar). They are never UI tokens.

## Logo (D321)

The "house of know-how" mark: two leaning roof cards on an upright card carrying the brand G (one rounded stroke traced around a card, with a yellow bit as its bar), and bits rising from a chimney. `apps/api/src/brand/` draws it as pure SVG (`logo.ts`, `brand-g.ts`; no fonts) and `BRAND_ASSETS` (`app-icons.ts`) lists every file `pnpm og:static` writes to `apps/web/public`. It also refreshes `docs/brand/logo.svg` and `logo-app-icon.svg`.

| File                                 | Variant                                                                                      | Used by                                                                                                                                                                                                                 |
| ------------------------------------ | -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `favicon.svg`                        | Rounded teal tile, no chimney (bits blur below ~64 px)                                       | Favicon (SPA, public pages), public-page header, app header on the deck list (D322)                                                                                                                                     |
| `icons/logo.svg`                     | Rounded teal tile                                                                            | Sign-in heading; embedded in the OG images                                                                                                                                                                              |
| `icons/icon-192.png`, `icon-512.png` | Rounded tile, transparent corners                                                            | Manifest `purpose: any`, push notification icon; `icon-192.png` is also the SPA's PNG favicon, because Chrome on Android skips SVG favicons and otherwise draws a letter tile in its install sheet and shortcuts (D323) |
| `icons/icon-maskable-512.png`        | Full bleed, the mark's bounding box inside the 40 % safe-zone circle                         | Manifest `purpose: maskable`                                                                                                                                                                                            |
| `icons/apple-touch-icon.png`         | 180 px, opaque, full bleed (iOS fills transparency with black and rounds the corners itself) | `index.html`                                                                                                                                                                                                            |

- The tile is `#195b5c`, the manifest `theme_color`, so the splash screen, status bar and icon agree. An installed app picks up icon and colour changes only when Chrome refreshes its WebAPK: it checks the manifest on launch at most once a day, and `chrome://webapks` → Update forces the refresh.
- **App header lead (D322)**: the header's leading control starts on the page gutter, in line with the content below.
  - On the deck list, which has no level above it, the lead is the 32 px logo tile, 12 px before the title.
  - Elsewhere it is Back: a 32 px box around the chevron, pulled out so the chevron's tip sits on the gutter, about 12 px from the title. A `::before` keeps the 44 px hit area.
  - The lead's spacing is set on the lead itself, not by the header gap, so it holds at ≤ 400 px, where the actions have no gap (D198, D211). It also frees 20 px there.
- The OG images put the tile before the bold "Gobbit" wordmark (`brandLockup`, an SVG data URI; the chimney-less tile below 64 px). The footer change bumped `OG_TEMPLATE_VERSION` to 2, so public card previews re-render on their next request.

## Offline model (D56)

- The service worker (`src/sw.ts`, vite-plugin-pwa `injectManifest`, typechecked with `tsconfig.sw.json`) precaches the app shell and caches Cloudinary images `CacheFirst` (30 days, 600 entries: the blurred placeholders share it, D162). It never caches API responses, and `og/**` is not precached.
- Share target (D108, Phase 5): the manifest's `share_target` posts `multipart/form-data` to `/share`. The SW stores `{title, text, url, images}` in IndexedDB (`gobbit-share` store, one pending record, 1 h TTL) and answers `303 /share?pending=<id>`. The confirm screen reads it, picks a deck (`item.create` roles; requested → last opened → personal) and sends `POST /api/ingest` (`channel: pwa`). Without a SW, Caddy answers a `POST /share` with `303 /share?failed=1`. The deck's "Paste" button opens the same screen as a paste box (`channel: paste`).
- API data persists through TanStack Query's persister to IndexedDB (`idb-keyval`, `maxAge` 7 days, `buster` = commit).
- After the restore, every query is invalidated (`revalidateRestored`): restored data renders at once and offline, but active queries refetch. IndexedDB writes are throttled (1 s), so without this a reload right after a save could show the pre-save copy as fresh.
- The offline banner shows when a query fails with a network error while cached data is on screen, and clears on the next successful fetch.
- Sign-out removes the persisted cache.

## Share previews (D58–D61)

- The share button builds `${origin}/s/<itemId>` (Web Share API, clipboard fallback). Caddy forwards `/s/*` to the API unchanged.
- `GET /s/:itemId` always answers 200 with a small HTML page: Open Graph tags plus `<meta http-equiv="refresh">` to `/i/<itemId>`. `Cache-Control: public, max-age=300`, `X-Robots-Tag: noindex`.
- **Public** = item published, not deleted, deck `is_public`, and at least one category with visibility `public`. Anything else, including a missing or malformed id, gets the same private page: "A card was shared with you" and `${APP_URL ?? API_URL}/og/private.png`.
- Public image: the item's own Cloudinary image (`c_fill,w_1200,h_630,f_jpg`), otherwise a generated card. Generation is lazy on the first request whose content hash has no `og_images` row: Satori → SVG, resvg → PNG, uploaded as `og/<itemId>-<hash12>`. A failure falls back to the private image for that response and is logged.
- `pnpm og:static` renders `apps/web/public/og/private.png`, `og/landing.png` and the logo files (D321) with the same renderer; the outputs are committed, so the web image build has no API dependencies.

## Deviations from the Phase 3 plan

- **Satori template without JSX**: the OG card is built from plain vnode objects (`share/og-template.ts`), so the API needs no JSX/React toolchain.
- **Fonts from `@fontsource`** (Inter, Noto Sans Hebrew) instead of font files committed under `apps/api/assets/fonts/`; Inter covers Greek.
- **Cloudinary SDK** (`cloudinary`) for the upload instead of hand-signed requests.
- **Subpath exports from `@gobbit/shared`** (`./enums`, `./authz`, `./calc`, `./text-script`) so the web bundle doesn't pull Zod schemas or `mathjs` into the initial chunk.
- **One private image** (`/og/private.png`) instead of one per deck kind: the deck kind of a private item is not disclosed either.
- **Share origin** is `APP_URL`, falling back to `API_URL`.
- **`X-Robots-Tag: noindex`** on share pages.
- **Placeholder icon**: a "G" monogram rendered by `pnpm og:static` until there is a designed logo (replaced by the logo, D321).
- **`NavigateContext`** (`ui/NavLink.tsx`) lets components navigate without importing the router, so they render in unit tests without one.
- **Local Compose runs `NODE_ENV=development`** for the API, so it boots without `CLOUDINARY_URL` (production requires it).
- **`WEB_BASE_URL`** for e2e defaults to `BASE_URL` without its `/api` suffix.

## Deck settings (Phase 8, D184–D185)

`/d/$slug/settings` is a lazy route. Owners and maintainers (`deck.update`) get **Deck** (name; the public switch, enabled for owners only, asks first and lists the categories that will be public; the `/p/<slug>` address with Copy), **Categories** (rename, "Who sees": Admins only / Members / Everyone) and **Members**. Editors and readers see the member list only; the personal deck shows its name only. Owners also invite (role select with the labels from `@gobbit/shared/authz` `ROLE_LABELS`), change roles and remove or cancel invites, with an inline confirmation. Offline, every control is disabled. Writes refresh the deck, deck list, categories and members queries under both the slug and id keys.

## Deviations from the 019 plan

- **Header link instead of a deck menu**: the PWA has no deck menu, so admins get a "Deck" link (accessible name "Deck settings") next to Activity; `NavLink` gained an optional `label` (`aria-label`).
- **`@gobbit/shared/authz` points at `authz/index.ts`** (re-exports `can` and the new `labels.ts`).
- **No `countOwners`**: the last-owner guard lives inside `memberships.repo.updateRole` (`{ guardLastOwner }`), which locks the deck's owner rows `FOR UPDATE` and counts them in the same transaction.
- **Refusal copy** in `deck-admin/admin-errors.ts` + `AdminError`, on top of `problemMessages`.
- **"Everyone" hint** under Categories shows while the deck is not public.
- **Inline confirmation** for remove / cancel invite instead of a modal dialog.
- **Integration test file** is `apps/api/test/member-role.int.test.ts`; two co-owners demoting each other at once may see `403` (the first change already removed the second caller's permission) or `409`.
- **E2E (T023)**: a second admin can't sign in from e2e, so the owner sets a category public, makes the deck public and invites a co-owner; role changes of accepted members are covered by the integration and component tests.

## App analytics (033, D252–D258, ADR-066)

- **Off by default**: `GET /config` carries `analytics: null` unless `ANALYTICS_SITE_ID` is set; then nothing is loaded and nothing is sent.
- **Loading** (`analytics/analytics.ts`, in the main chunk): `startAnalytics` (from `main.tsx`) waits for the first resolved route and a member in the `me` cache, then on idle imports `analytics/tracker.ts` (own chunk), which installs `window.__gobbitAnalyticsBeforeSend` and appends `/stats/script.js` with `data-auto-track="false"`, `data-domains`, `data-exclude-search`, `data-exclude-hash` and `data-before-send`.
- **Screens** (`analytics/catalogue.ts`): `Record<RouteId, Screen | null>` over the router's generated ids. `null` = untracked (`/sign-in`, `/auth/error`, layouts); an unknown id sends `/other`. One page view per change of real pathname.
- **Sanitiser**: the hook runs `sanitizePayload` (`@gobbit/shared/analytics`) with the current screen, member id and online state. Rules: [contract](../../specs/033-app-analytics/contracts/analytics.md).
- **Identity**: the member id is read from the `me` cache at send time; a member change calls `identify` (new Umami session).
- **Content events**: `trackContent(name, props)` from mutation success paths: create/update item, archive/restore/undelete/delete, review publish, bulk publish, notes import, share button (sheet or copied link), share target. A no-op before load, offline or without consent (035); never throws into the caller.
- **Privacy note**: Settings → Privacy and the landing page say what is measured.

## Deviations from the 033 plan

- `useReviewAction` gained an optional `onSent` callback so publish can send its event with the server's answer (create vs update).
- `ShareButton` takes optional `deckId` and `type` (passed by `CardBar`) to fill the `card-shared` event.
- `analytics.config` carries `surfaces` as a comma-joined string (`landing,app,public,share`), like the other log fields, not an array.
- `/analytics/page.js` is unit-tested by importing its source with Vite's `?raw` and running it with a stubbed `document.currentScript`.
- The web image precaches `/analytics/page.js` with the rest of `public/` (harmless: only API-rendered pages load it).
- The `@smoke` "no `/stats/` request" check runs only when `/config` says analytics is off (PR CI); post-deploy with analytics on it is skipped, and the payload check lives in `@full` (`app-analytics.spec.ts`) with a stubbed tracker.
- The integration test checks the share preview tag on an unknown card id: a public card's `/s/` redirects to `/p/` (D181) and is counted there.
- The tracker staying out of the initial chunks is checked by `pnpm budget` (initial 120 KB gzip); `initial-chunks.test.ts` needed no change.

## Family quick start (D267–D269)

- **D267 back targets**: every page inside a deck (settings, review, favorites, archived, a category, the log…) goes back to the deck's main page; only the main page goes to the deck list. Pages outside a deck (`/settings`, `/share`) go back to the deck opened last (`lib/last-deck`), else the deck list. All through `backTarget()` (`app/back-target.ts`, kinds `deck-page` and `top`).
- **D268 Browse first for non-admins**: entry points (deck list links, the landing redirect) send roles without `deck.update` (editors, readers) to `/d/$slug/browse?c=all`; owners and maintainers land on the list. Only entry points use `deckEntryHref()` (`app/deck-entry.ts`), so closing Browse still returns to the list without bouncing.
- **D269 New deck**: the deck list's "New deck" form (`decks/NewDeckForm.tsx`, opened by the bottom bar's +, D279) always creates a `shared` deck (`POST /decks` defaults to `personal`) and opens its settings, where members are invited.

## Bottom bar and one Settings page (036, D274–D280, ADR-067)

- **Bar** (`app/BottomBar.tsx`): one fixed `<nav>` at the bottom of the deck pages, the deck list and `/settings`: ⋯ menu at the start, Browse and Review (`item.publish`, not on the personal deck) in the middle, the + at the end. It never hides on scroll; a spacer keeps the last content clear. Browse (full screen) and the new-card editor have none; the editor pages outside the deck layout (`/i/$id/edit`) have none either.
- **+** (D275): the existing `MoreMenu` (D213) with an `onLongPress` from `ui/use-long-press.ts` (pointer events, 500 ms, 10 px slop, no library, ADR-065). A short press opens New card, Paste or share, Import (`item.publish`) and Shares (`createActions`, `app/create-actions.ts`); holding it opens the new card. Readers get no +. On the deck list the + is a plain "New deck" button (D279).
- **⋯** (D276, `app/deck-menu-actions.ts`): Settings, Activity (`event.list`), Waitlist (platform admins), About (D354) and Sign out, with the signed-in email as its description (`MenuAction.detail`, `aria-describedby`). Sign-out runs through `app/use-sign-out.ts` (keeps the 022 leave guard). The header keeps only back, title and page actions.
- **Settings** (D278): one entry. Inside a deck, `/d/$slug/settings` renders `deck-admin/UnifiedSettings.tsx`: "This deck" (`DeckAdminScreen`), then "Your account" (`SettingsScreen`). `/settings` shows the account half only.
- **Toasts** (D280): `--bottom-bar-h` on `:root`; `.toast` and `.update-prompt` sit above it.

## Deviations from the 036 plan

- Bar actions are icon-only with tooltips (`BrowseButton`, `ReviewPill`, `MoreMenu` triggers), so there is no label collapse below 360 px to test.
- D279: the deck list's + opens the form through component state, not `?new=1`; the form's own collapsed "New deck" button is gone, so there is one "New deck" control.
- D280: `--bottom-bar-h` is always set, not only while a bar is mounted; pages without a bar (editor, Browse) show toasts slightly higher.
- The old `AddCardLink`, `PasteLink`, `ImportLink`, `SharesLink`, `DeckSettingsLink` and `ActivityLink` components were deleted rather than restyled; their routes are unchanged.
- The `@smoke` sign-out journey now leaves the editor before signing out from ⋯ (the editor has no bar); the leave guard on sign-out stays covered by `use-sign-out.test.tsx`. The long press runs in `@full` (`bottom-bar.spec.ts`); `@smoke` covers the short press → New card.

## Deck header (043, D380–D382)

- **Header** (`deck-header/DeckHeader.tsx`, rendered by `routes/d.$slug.tsx`): one row: Back, a breadcrumb `nav` (deck name as the `h1`, linking to the deck; on the card lists a `/` and the current view), then Search on the card lists. Names truncate; it stays one row at 360 px.
- **Switchers** (D381): carets open `MoreMenu`s aligned to their start edge. Deck: the member's decks (`decksQuery`, current checked) and "All decks". View: `ui/deck-views.ts` (All, Favorites, categories, then Archived `item.archive` and Links to check `item.update`), current checked, none on search. Checked items are `menuitemradio`.
- **Search** (D382): a sheet (`SearchSheet`) with the box (prefilled on results) and recent searches; `/` opens it outside text fields and dialogs.
- Replaces `ChipRow`, `SearchBox` and `useDebounced`. Deviations and limits (iOS keyboard over the sheet): `specs/043-deck-header/implementation-notes.md`.
- E2E tier: smoke (`web.spec.ts`, `editor.spec.ts` via `smoke/helpers/deck-header.ts`); edge cases in `full/deck-chrome.spec.ts`.

## About (D354)

- **Sheet** (`about/AboutSheet.tsx`, opened from ⋯ → About): logo and tagline; the version (short `__APP_COMMIT__` linked to its GitHub commit, "Development build" locally); **Released**, the build time `__APP_BUILT_AT__` (a Vite define; CI builds the image right before it deploys, so it stands in for the deploy time); a **Server** row only when `/config.commit` differs from the app (a deploy the open app hasn't loaded yet); the outside services this server uses; MPL-2.0, source, open-source notices, issues and security policy links; the copyright line.
- **Credits** (`about/about-info.ts` `serviceCredits`): read from `/config`, so a deployment never names a provider it doesn't use: Cloudinary (cloud name set), AI language models (semantic search, Ask or ingest on; `/config` doesn't say which provider, so none is named), YouTube/TikTok/Vimeo (always, 041 video lookups), the browser push service (push on), Umami (analytics on). Hidden until `/config` loads; the build facts still show offline.
- **Notices**: `rollup-plugin-license` writes `dist/licenses.txt` (every bundled third-party package, its license and notice text) at build time; Caddy serves it as a static file, and the service worker's navigation denylist keeps it from being answered with the app shell.
- Opening a tall sheet no longer scrolls it to its focused action: `Sheet` focuses `initialFocus` with `preventScroll`.
- E2E tier: full (`full/about.spec.ts`), a secondary path.

## Analytics consent (035, D259–D266, ADR-068)

- **Rule** (opt-in since D281): `analyticsAllowed(member, device)` (`@gobbit/shared/analytics`): a member counts only with an account `allowed`; anonymous pages only with a device `allowed`; a device Allow never covers a member. Do Not Track and GPC are not consulted. `umami.disabled` (operator, smoke) still wins.
- **Member choice**: `GET /me` → `analyticsConsent { value: unanswered | allowed | declined, at, source }`; `PUT /me/analytics-consent` (`api/analytics-consent.ts`) writes the answer into the `me` cache. Server side: `analytics-consent.service` → `users.repo.setAnalyticsConsent` (row locked, audit row in the same transaction, same value = no write, `analytics.consent` event).
- **Facade** (`analytics/analytics.ts`): nothing loads until `me` is known and the rule allows; the before-send hook gets `consented` and cancels every payload while it is false; a cache change to allowed loads the tracker and sends the current view, without a reload.
- **Device choice** (`analytics/device-consent.ts`): `localStorage['gobbit.analytics.consent']` `{ value, at }`, read through the shared parser; storage errors = not answered. Only `page.js` writes it.
- **Prompt** (`analytics/ConsentPrompt.tsx`, in `__root.tsx`; a wall since D281): native modal `<dialog>` "Help improve Gobbit?" with Allow / No thanks in the same style, no close; Escape is cancelled. Shown only when configured, online, unanswered and on a route `prompt-routes.ts` allows (never sign-in, auth error, editor, new card or Browse). A failed save keeps it open with an alert.
- **Settings → Privacy** (`settings/PrivacySection.tsx`): "Usage analytics" switch with "Since {date}" or "Not answered yet (off)" (off until allowed), disabled offline ("Changing this needs a connection"); unconfigured shows only "This server doesn’t measure usage." Copy for all surfaces lives in `@gobbit/shared/analytics` `privacy.ts`.
- **Anonymous pages**: see [public](public.md#analytics-on-public-pages-033-d257) and [waitlist](waitlist.md#landing-analytics-031-d231d233-d243-adr-062).

## Deviations from the 035 plan

- e2e member flows stub `/me` and the consent PUT in the page (the smoke owner is shared by parallel specs); the real write is covered by `analytics-consent.int.test.ts`.
- The visitor decline is checked on a `/welcome` reload; `/p` is covered by `page-script.test.ts`. DNT-on, two-device decline and no-cookie checks were added at convergence (`full/analytics-consent.spec.ts`).
- Two latent 033 e2e bugs fixed: `app-analytics.spec.ts` keeps its record in `sessionStorage` across loads; `smoke/public.spec.ts` allows the `page.js` loader.
- D281 (after merge): opt-in with a modal question for members and visitors, replacing "on unless declined" and the in-flow prompt/banner; see the ADR-068 amendment.
- Down migration named `0020_analytics_consent.down.sql` (repo convention). Detail: `specs/035-analytics-consent/implementation-notes.md`.
