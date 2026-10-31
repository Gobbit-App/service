# Research: Card media — image uploads and link previews

Decisions continue the project-wide D numbering; Phase 6 reserves D129–D147 (see [`specs/README.md`](../README.md)). This feature owns **D129, D133, D134**.

## D129 — Phase 6 vs Phase 7 boundary for media and links

- **Decision**: Phase 6 ships only what authoring needs: signed direct uploads from the browser and a synchronous link-preview lookup, each as an API service. Phase 7 keeps the `assets` table, the orphan sweep, uploads from a remote URL (`media.service.uploadFromUrl`), copying preview images into Cloudinary, dead-link checks (`link_checks`) and the responsive `CloudImage` component.
- **Rationale**: the master plan lists `/media/sign` and the fetched link preview under both Phase 6 (step 1) and Phase 7. Phase 6's exit criterion ("all five types authorable") needs image upload now. `PLAN.md` § Phase 7 asks for media and the link snapshot as services so the MCP server reuses them, so the Phase 6 pieces are written as the services Phase 7 extends rather than as UI code.
- **Alternatives considered**: (a) defer image cards to Phase 7, which fails the Phase 6 exit criterion; (b) pull the whole of Phase 7 forward, which doubles this phase and starts a schema (`assets`) before its sweep exists.

## D133 — Signed direct uploads

- **Decision**: `media.service.signUpload({ user, deckId })` resolves the deck, checks `item.create`, enforces a per-user hourly rate limit, and returns the parameters for one direct browser upload to Cloudinary's Upload API, signed server-side with `cloudinary.utils.api_sign_request` (the existing `cloudinary` dependency):
  - `folder: gobbit/items/<deckId>` (mirrors `ingestFolder()` = `gobbit/ingest/<deckId>`);
  - `tags: editor,deck:<deckId>` (mirrors the `ingest` + `job:<id>` tags; the deck tag is what Phase 7's sweep lists and reference-checks);
  - `allowed_formats: jpg,png,webp,heic,heif` (same set as `INGEST_IMAGE_MIMES`);
  - `timestamp` (Cloudinary rejects signatures older than one hour, so the editor re-signs when a permission is older than 50 minutes).
  The client uploads with `XMLHttpRequest` (upload progress events, `abort()`), and the item stores only `{ publicId, alt }`.
  The size limit is **8 MB**, the same as `INGEST_IMAGE_MAX_BYTES`, checked in the browser before upload. Cloudinary's account upload limit is the server-side backstop. A signed upload preset with a file-size cap is optional (plan, "Settle before starting").
  Rate limit: `MEDIA_SIGN_RATE_PER_HOUR = 60` via `rate-limit.service` (`rateKeys.mediaSignUser`).
  With no `CLOUDINARY_URL` the service throws `serviceUnavailable` (503 `/problems/unavailable`), the same as ingest image uploads, and the web disables the image type when `config.cloudinaryCloudName` is `null`.
- **Rationale**: direct uploads keep large files off the API (the JSON body limit is `API_BODY_MAX_BYTES` = 1 MB). Signing keeps the secret on the server (D55: only the cloud name is public). Using the same folder and tag conventions as ingest makes one sweep possible for both.
- **Alternatives considered**:
  - Proxy uploads through the API (as ingest does): needs a multipart route with a large body limit and doubles the bandwidth.
  - An unsigned preset: anyone with the cloud name could upload.
  - Store width/height in the payload: `imagePayloadSchema` is `strict` with only `publicId` and `alt`. Adding fields is a contract change, and nothing needs them until Phase 7's `CloudImage`.
  - Keep the plan's 10 MB: a second, different image limit for no gain. Phone photos are well under 8 MB, and HEIC is smaller.
- **ADR**: yes → **ADR-051** "Signed direct uploads, tagged per deck for the Phase 7 sweep" (ADR-049 records the spec-kit adoption; ADR-050 belongs to `006-card-lifecycle`).

## D134 — Link preview lookup

- **Decision**: `linkPreview.service.lookup({ user, deckId, url })` checks `item.create`, enforces `LINK_PREVIEW_RATE_PER_HOUR = 30` (`rateKeys.linkPreviewUser`), then runs `createSafeFetch()` (ADR-048: allowed ports 80/443, IP guard, `FETCH_TIMEOUT_MS` 10 s, `FETCH_MAX_BYTES` 3 MB, `FETCH_MAX_REDIRECTS` 3, never throws) and `extractPage(html, finalUrl)`.
  It maps the result to the existing `linkPayloadSchema.preview` shape:
  - `title`: `og.title`, falling back to `page.title`, trimmed to `LINK_PREVIEW_TITLE_MAX` = 200;
  - `description`: `og.description`, trimmed to `LINK_PREVIEW_DESCRIPTION_MAX` = 500;
  - `image`: `og.image`, already resolved to an absolute http(s) URL by `extract-page`.
  `siteName` is dropped because the payload schema is `strict` and has no such field. Any `SafeFetchResult.error`, or empty OG data with no page title, gives `200 { preview: null }`. The specific reason (`blocked`, `timeout`, `http_404`, …) is logged and never returned. Results, including `null`, are cached in an in-process `LRUCache` (existing `lru-cache` dependency, already used by `ai/query-embedder.ts`), keyed by the request URL, with 200 entries and a 1-hour TTL.
- **Rationale**: one fetcher for every outbound request (constitution IV). The lookup is synchronous because the member is waiting in the editor. Hiding the reason avoids turning the endpoint into a probe of which hosts resolve to private addresses. The caps keep a filled preview well inside `PAYLOAD_MAX_BYTES` (8192).
- **Alternatives considered**:
  - Run it as a pg-boss job: adds latency and polling for a user who is waiting.
  - Fetch from the browser: blocked by CORS and the CSP, and it bypasses the SSRF guard's purpose of a single audited fetch path.
  - A new cache dependency or a hand-rolled `Map`: `lru-cache` is already in `apps/api` and gives TTL and size bounds.
  - Return 422 for blocked URLs: that would block saving, and FR-012 forbids it.

## Other choices (no new D-number)

- **CSP**: the browser now POSTs to `https://api.cloudinary.com`, so `apps/web/Caddyfile` `connect-src` gains that origin. Today it lists only `'self' https://res.cloudinary.com`. `img-src` already allows `https:` and `blob:` (local thumbnail before the upload finishes).
- **Shared constants**: `MEDIA_IMAGE_MAX_BYTES`, `MEDIA_IMAGE_MIMES`, `LINK_PREVIEW_*_MAX` and the DTO schemas live in `packages/shared/src/media/` with a new subpath export `@gobbit/shared/media`, because the web may not import values from the root (constitution VI).
- **Route file**: `apps/api/src/routes/media.ts` (`registerMediaRoutes`) holds both endpoints, following the `/decks/{id}/…` pattern of `routes/categories.ts`. The services go in `apps/api/src/services/`; the pure signing helper goes in `apps/api/src/media/sign-upload.ts`, next to `ingest-uploads.ts`.
