# Reader PWA

_Overview: [architecture.md](../architecture.md). Decisions: [adr.md](../adr.md)._

Request routing and CI/deploy notes: [deployment.md](deployment.md).

## App structure (`apps/web/src`)

| Folder | Holds |
| --- | --- |
| `routes/` | File routes (D65): `/`, `/sign-in?next=`, `/auth/error?reason=`, `/d/$slug`, `/d/$slug/c/$category`, `/d/$slug/favorites`, `/d/$slug/archived`, `/d/$slug/new?type=` (card editor, Phase 3B, all types from Phase 6), `/d/$slug/search?q=&mode=` (Phase 4), `/i/$itemId`, `/i/$itemId/edit` (Phase 6) |
| `api/` | Typed client, query keys and queries, session and 401 redirect, favorites with optimistic cache updates, network state and offline detection, persistence, card creation and update (`create-item.ts`, `update-item.ts`), inline category create (`create-category.ts`), form error messages (`problem-messages.ts`) and the optimistic lifecycle actions (`item-lifecycle.ts`, Phase 6) |
| `cards/` | One renderer per card type (also the editor preview, D136). `CalcCard` is a `React.lazy` chunk because the evaluator pulls `mathjs` (D57). Phase 6: `EntityChips`, `EditLink` and `canEditItem` |
| `editor/` | Phase 6 card editor (`CardEditor`, preview, tabs, type picker, save bar), the draft model (`draft.ts`), zod-free validation (`validate.ts`), drafts store and autosave, and `fields/` (the per-type registry and shared fields) |
| `items/` | The item list for a deck/category/favorites/archived view and its empty-state copy; the role-gated `AddCardLink` (the Phase 3B editor moved to `editor/` in Phase 6); Phase 6 `CardActions` (archive/restore/delete/undelete) and `DeletedSection` (Recently deleted) |
| `deck-admin/` | Phase 8 deck settings at `/d/$slug/settings` (D184): `DeckSection` (name, public switch with `PublicSwitchDialog`, public address), `CategoriesSection` (rename, visibility), `MembersSection` + `InviteForm` (invite, role, remove), mutations in `deck-admin-queries.ts`, refusal copy in `admin-errors.ts`; `DeckSettingsLink` in the deck header for `deck.update` roles |
| `search/` | Phase 4: `SearchBox`, `SearchResults`, `ModeToggle`, the lazy `AskView`, URL params, recent searches and the debounce hook |
| `ui/`, `lib/`, `app/` | Shared components (chips, status views, `NavLink`, the app-wide Undo toast), `deckHref(slug, path)` (D143), copy tables, header and the service-worker update prompt |

- Session (D66): the app calls `GET /api/me` on boot; any 401 sends the user to `/sign-in?next=<path>`. The magic-link request carries `next`; the API callback redirects to `APP_URL + next` only for same-origin paths (`//host` and absolute URLs are dropped). Sign-out navigates to `/sign-in` first, then calls `POST /api/auth/logout`, clears the persisted cache and the local editor drafts, so no route re-fetches with a dead cookie.
- Runtime config (D55): `GET /api/config` → `{ cloudinaryCloudName, commit }`, cached for the session in the persisted query cache. One web image works in every environment.
- Styling: plain CSS with custom properties and `prefers-color-scheme` (`styles.css`); no UI kit. Initial JS is asserted ≤ 150 KB gzip in CI (`pnpm budget`, reads the Vite manifest).

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
- `pnpm og:static` renders `apps/web/public/og/private.png`, the PWA icons and `favicon.svg` with the same renderer; the outputs are committed, so the web image build has no API dependencies.

## Deviations from the Phase 3 plan

- **Satori template without JSX**: the OG card is built from plain vnode objects (`share/og-template.ts`), so the API needs no JSX/React toolchain.
- **Fonts from `@fontsource`** (Inter, Noto Sans Hebrew) instead of font files committed under `apps/api/assets/fonts/`; Inter covers Greek.
- **Cloudinary SDK** (`cloudinary`) for the upload instead of hand-signed requests.
- **Subpath exports from `@pb/shared`** (`./enums`, `./authz`, `./calc`, `./text-script`) so the web bundle doesn't pull Zod schemas or `mathjs` into the initial chunk.
- **One private image** (`/og/private.png`) instead of one per deck kind: the deck kind of a private item is not disclosed either.
- **Share origin** is `APP_URL`, falling back to `API_URL`.
- **`X-Robots-Tag: noindex`** on share pages.
- **Placeholder icon**: a "G" monogram rendered by `pnpm og:static` until there is a designed logo.
- **`NavigateContext`** (`ui/NavLink.tsx`) lets components navigate without importing the router, so they render in unit tests without one.
- **Local Compose runs `NODE_ENV=development`** for the API, so it boots without `CLOUDINARY_URL` (production requires it).
- **`WEB_BASE_URL`** for e2e defaults to `BASE_URL` without its `/api` suffix.

## Deck settings (Phase 8, D184–D185)

`/d/$slug/settings` is a lazy route. Owners and maintainers (`deck.update`) get **Deck** (name; the public switch, enabled for owners only, asks first and lists the categories that will be public; the `/p/<slug>` address with Copy), **Categories** (rename, "Who sees": Admins only / Members / Everyone) and **Members**. Editors and readers see the member list only; the personal deck shows its name only. Owners also invite (role select with the labels from `@pb/shared/authz` `ROLE_LABELS`), change roles and remove or cancel invites, with an inline confirmation. Offline, every control is disabled. Writes refresh the deck, deck list, categories and members queries under both the slug and id keys.

## Deviations from the 019 plan

- **Header link instead of a deck menu**: the PWA has no deck menu, so admins get a "Deck" link (accessible name "Deck settings") next to Activity; `NavLink` gained an optional `label` (`aria-label`).
- **`@pb/shared/authz` points at `authz/index.ts`** (re-exports `can` and the new `labels.ts`).
- **No `countOwners`**: the last-owner guard lives inside `memberships.repo.updateRole` (`{ guardLastOwner }`), which locks the deck's owner rows `FOR UPDATE` and counts them in the same transaction.
- **Refusal copy** in `deck-admin/admin-errors.ts` + `AdminError`, on top of `problemMessages`.
- **"Everyone" hint** under Categories shows while the deck is not public.
- **Inline confirmation** for remove / cancel invite instead of a modal dialog.
- **Integration test file** is `apps/api/test/member-role.int.test.ts`; two co-owners demoting each other at once may see `403` (the first change already removed the second caller's permission) or `409`.
- **E2E (T023)**: a second admin can't sign in from e2e, so the owner sets a category public, makes the deck public and invites a co-owner; role changes of accepted members are covered by the integration and component tests.
