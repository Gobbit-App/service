# Implementation Plan: Card media — image uploads and link previews

**Branch**: `008-card-media` | **Date**: 2026-10-20 | **Spec**: [spec.md](./spec.md) | **Roadmap**: `PLAN.md` § Phase 6 (demo 1)

**Input**: Feature specification from `/specs/008-card-media/spec.md`

Project override of the core template. Written for outside readers: the repository is public.

## Summary

Image cards become authorable on the phone and link cards get a fetched preview. Both are API services that Phase 7 (assets table, orphan sweep, remote-URL upload, preview snapshot, link checks) and Phase 13 (MCP) extend instead of replacing (D129):

- **Images**: `media.service.signUpload` signs a direct browser → Cloudinary upload, scoped to a per-deck folder and tagged `editor` and `deck:<id>` (D133). The editor uploads with XHR, shows progress and lets the member cancel.
- **Link previews**: `linkPreview.service.lookup` reuses the Phase 5 SSRF-guarded fetcher and page extractor, and returns a preview that fits the existing link payload (D134).

The web work fills the image fields and adds the link-preview button in the editor from `007-card-editor`.

## Starting point

- `main @ 10b0e2a` (spec-kit adoption, ADR-049). Latest migration: `0010_mcp_readiness`. Phase 5 is deployed.
- Depends on [`007-card-editor`](../007-card-editor/plan.md):
  - the field registry `apps/web/src/editor/fields/registry.ts` (type → component), with `ReadOnlyImage.tsx` as the image placeholder;
  - the `Draft` model in `editor/draft.ts`;
  - drafts in IndexedDB;
  - the preview through `cards/*`;
  - create at `/d/$slug/new?type=` (D135), where the type choice in `CardEditor` offers only the types 007 enables;
  - the `previewSlot` seam in `LinkFields.tsx` (D138).
  This feature registers `ImageFields` in place of `ReadOnlyImage`, adds image to the create-type choice, and fills `previewSlot` with "Fetch preview".
- Existing pieces reused:
  - `apps/api/src/fetch/safe-fetch.ts` (`createSafeFetch`, never throws, `error` codes), `ip-guard.ts` and `extract-page.ts` (`extractPage(html, url)` → `{ title, text, og: { title, description, image, siteName }, lang }`), ADR-048;
  - `apps/api/src/lib/cloudinary-url.ts` (`parseCloudinaryUrl`, `cloudNameFrom`);
  - the `cloudinary` SDK (used by `media/ingest-uploads.ts`, folder `gobbit/ingest/<deckId>`, tags `ingest` and `job:<id>`);
  - `services/rate-limit.service.ts` (`enforce(key, limit)`, hourly fixed window, `rateKeys` in `lib/rate-window.ts`);
  - `lru-cache` (in `ai/query-embedder.ts`);
  - `GET /config` (`cloudinaryCloudName`, `null` when unset), and on the web `cards/ImageCard.tsx` (`cloudinary.ts`, `use-cloud-name.ts`) and `cards/LinkCard.tsx`, which already renders `payload.preview`.
- `CLOUDINARY_URL` is required in production (`env.ts`) and optional elsewhere. Ingest answers 503 `/problems/unavailable` for image uploads without it.
- `imagePayloadSchema` is `{ publicId, alt }` (strict). `linkPayloadSchema.preview` is `{ title?, description?, image? }` (strict, no `siteName`).
- CSP (`apps/web/Caddyfile`): `connect-src 'self' https://res.cloudinary.com`. Direct uploads need `https://api.cloudinary.com` as well.

## Technical Context

**Language/Version**: TypeScript (strict, ESM, no build step) on Node ≥ 22

**Primary Dependencies**: Hono + `@hono/zod-openapi`, `cloudinary` (existing, signing only), `lru-cache` (existing), `undici`/`linkedom`/`@mozilla/readability` via the existing fetch modules; React + TanStack Query on the web. No new dependencies.

**Storage**: none new (Cloudinary for images; no tables, see [data-model.md](./data-model.md))

**Testing**: Vitest unit; integration with Testcontainers (`apps/api/test/`); Playwright `@smoke`

**Target Platform**: Docker Compose on Dokploy; PWA on Android Chrome and iOS Safari (camera/gallery pick, HEIC)

**Project Type**: pnpm monorepo — API + worker, PWA, shared packages

**Performance Goals**: link preview ≤ 10 s (the fetcher's timeout) and instant on a cache hit; upload progress updates at least once per second

**Constraints**: image ≤ 8 MB; payload ≤ 8192 bytes; outbound fetch only via `safe-fetch`; works without Cloudinary (image type off); initial bundle untouched (fields live in the lazy editor chunk)

**Scale/Scope**: family/community decks; tens of uploads per day at most

## Constitution Check

| Principle | How this plan complies |
|-----------|------------------------|
| I. Layered API | `routes/media.ts` parses; `services/media.service.ts` and `services/link-preview.service.ts` hold access (`authorize()` + `can('item.create')`), rate limits and mapping; no SQL beyond the existing rate-limit repo. Invisible deck → 404. MCP (Phase 13) calls the same services |
| II. One source of truth | DTOs and limits in `packages/shared/src/media/` (subpath `@pb/shared/media`); `pnpm api:openapi` after the routes; the preview DTO reuses `linkPayloadSchema.preview` |
| III. Invariants in the DB | No schema change; the payload size CHECK still applies, and preview caps keep within it |
| IV. Private by default | Outbound only via `createSafeFetch()`; failure reasons not returned; the Cloudinary secret stays server-side; ingest tokens can't call these routes (D99) |
| V. Tests at the right tier | Unit (signing params, preview mapping/trim, upload helper, fields), int (access, 429, 503, safe-fetch path against a local fixture server), e2e (`editor.spec.ts`); traceability below |
| VI. Lean web | Fields are in the lazy editor chunk; values imported from `@pb/shared/media`, not the root; the upload goes direct to Cloudinary and needs a CSP `connect-src` update |
| VII. Simple, optional | No new dependencies; works with no `CLOUDINARY_URL` (503 + image type disabled); no AI key involved |

No violations.

## Decisions this plan pins down

Full reasoning in [research.md](./research.md).

| ID | Decision | ADR? |
|----|----------|------|
| D129 | Phase 6 ships signed client uploads and a synchronous link preview as services. The assets table, orphan sweep, remote-URL upload, preview snapshot, link checks and `CloudImage` stay in Phase 7 | no (recorded in architecture "Media" section) |
| D133 | `POST /decks/{id}/media/sign`: `item.create`, folder `gobbit/items/<deckId>`, tags `editor` + `deck:<deckId>`, formats jpg/png/webp/heic/heif, 8 MB checked by the client, 60/user/hour, 503 without Cloudinary. XHR upload with progress and abort; the card stores `{ publicId, alt }` | yes → **ADR-051** |
| D134 | `POST /decks/{id}/link-preview`: `item.create`, safe-fetch + extract-page, OG title (falling back to the page title, ≤ 200), description ≤ 500, image; `{ preview: null }` on any failure without a reason; 30/user/hour; `lru-cache` 200 entries / 1 h | no |

## Project Structure

### Documentation (this feature)

```text
specs/008-card-media/
├── spec.md
├── checklists/requirements.md
├── plan.md
├── research.md
├── data-model.md
├── contracts/
│   ├── media-sign.md
│   └── link-preview.md
├── quickstart.md
├── tasks.md
└── implementation-notes.md   # created during /speckit-implement
```

### Source Code (repository root)

```text
packages/shared/src/
├── media/index.ts                 # NEW: limits + mediaSignResponseSchema, linkPreviewRequest/ResponseSchema
├── media/index.test.ts            # NEW
└── package.json "exports"         # + "./media"

apps/api/src/
├── media/sign-upload.ts           # NEW: pure signed-params builder (folder, tags, formats, timestamp, signature)
├── media/sign-upload.test.ts      # NEW
├── services/media.service.ts      # NEW: signUpload({ user, deckId })
├── services/media.service.test.ts # NEW
├── services/link-preview.service.ts       # NEW: lookup({ user, deckId, url }) → safe-fetch + extractPage + LRU
├── services/link-preview.service.test.ts  # NEW
├── services/index.ts              # wire both services (rateLimits, decks, memberships, env.CLOUDINARY_URL)
├── lib/rate-window.ts             # + rateKeys.mediaSignUser, rateKeys.linkPreviewUser
├── routes/media.ts                # NEW: registerMediaRoutes (both endpoints)
└── app.ts                         # register routes
apps/api/test/
├── media.int.test.ts              # NEW
└── link-preview.int.test.ts       # NEW (local fixture HTTP server; allowedPorts null in the test wiring)

packages/api-client/               # regenerated (pnpm api:openapi)

apps/web/src/
├── editor/upload.ts               # NEW: XHR upload with progress/abort/re-sign
├── editor/upload.test.ts          # NEW
├── editor/use-image-upload.ts     # NEW: sign (TanStack mutation) + upload state machine
├── editor/use-link-preview.ts     # NEW: mutation → draft.payload.preview / title
├── editor/fields/ImageFields.tsx  # NEW: pick/take photo, local blob thumbnail, progress, alt, replace/remove
├── editor/fields/ImageFields.test.tsx
├── editor/fields/FetchPreview.tsx # NEW: rendered in LinkFields' previewSlot (from 007)
├── editor/fields/FetchPreview.test.tsx
├── editor/fields/registry.ts      # image → ImageFields (replaces ReadOnlyImage, from 007)
├── editor/CardEditor.tsx          # create-type choice: image enabled only when cloudName != null (from 007)
└── api/media.ts                   # NEW: client calls via @pb/api-client
apps/web/Caddyfile                 # CSP connect-src + https://api.cloudinary.com

e2e/tests/smoke/editor.spec.ts     # + image card, link preview, image-disabled path
```

**Structure Decision**: API services in `services/` with a pure helper in `media/`, next to `ingest-uploads.ts`. A single route file covers both deck-scoped endpoints. Web code lives in 007's `editor/` folder so it stays in the lazy chunk.

## Invariant → test traceability

| Invariant / rule | Enforced in | Test (file, tier) |
|------------------|-------------|-------------------|
| FR-001 only `item.create` callers get upload permission; invisible deck → 404 | `media.service` (`authorize` + `can`) | `media.int.test.ts` (int) |
| FR-002 folder, tags, formats are signed per deck | `media/sign-upload.ts` | `sign-upload.test.ts` (unit); `media.int.test.ts` (int; signature verifies with `api_sign_request`) |
| FR-003 secret never returned | `media.service` response schema | `media.int.test.ts` (int: response has no secret; schema strict) |
| FR-004 type/size checked before upload | `ImageFields` + `MEDIA_IMAGE_*` | `ImageFields.test.tsx` (unit) |
| FR-005 progress, cancel, failure leaves no photo | `editor/upload.ts`, `use-image-upload.ts` | `upload.test.ts` (unit, fake XHR) |
| FR-006/FR-007 no save without photo + alt; replace/remove | `ImageFields` + 007 `validateDraft` | `ImageFields.test.tsx` (unit); `editor.spec.ts` (e2e) |
| FR-008 stored `{ publicId, alt }`, renders like the list | `imagePayloadSchema`; shared renderer | `editor.spec.ts` (e2e) |
| FR-009 preview only for `item.create` | `link-preview.service` | `link-preview.int.test.ts` (int) |
| FR-010 guarded fetch only (private IPs refused) | `createSafeFetch()` | `link-preview.int.test.ts` (int: `127.0.0.1`/`10.x` URL → `null`, no request reaches the fixture) + existing `safe-fetch.test.ts`, `ip-guard.test.ts` |
| FR-011 OG mapping, title fallback, trimming | `link-preview.service` | `link-preview.service.test.ts` (unit) |
| FR-012 failure → `{ preview: null }`, no reason; save not blocked | service + `FetchPreview` | `link-preview.service.test.ts` (unit); `FetchPreview.test.tsx` (unit) |
| FR-013 hourly limits → 429 + `Retry-After` | `rate-limit.service.enforce` | `media.int.test.ts`, `link-preview.int.test.ts` (int) |
| FR-014 cache hit doesn't refetch | LRU in service | `link-preview.service.test.ts` (unit, fetch spy) |
| FR-015 no Cloudinary → 503 + image type disabled | `media.service`; `CardEditor` type choice | `media.int.test.ts` (int); `CardEditor` type-choice test (unit); `editor.spec.ts` skips the image step when config says off |
| FR-016 services callable without the web | service API shape | `media.service.test.ts`, `link-preview.service.test.ts` (unit, called directly) |

## Rollout

- **Migrations**: none.
- **Env / config**: no new variables. `CLOUDINARY_URL` (existing) now also enables editor image uploads. README env table: note the new use. Optional signed upload preset (see below).
- **CSP**: `apps/web/Caddyfile` `connect-src` gains `https://api.cloudinary.com`. The web image redeploys with the API (normal CI → Dokploy).
- **API client**: `pnpm api:openapi` needed (two new routes).
- **Deploy order / flags**: none; the web hides the image type until `/config` reports a cloud name.

## Risks

| Risk | Likelihood / impact | Mitigation |
|------|---------------------|------------|
| No server-side size cap without a preset; a client could bypass the 8 MB check | M / L | Cloudinary account limit as a backstop; optional signed preset with a cap (Settle) |
| iOS Safari gives HEIC with an empty `file.type` | M / M | Fall back to the file extension; HEIC/HEIF are in `allowed_formats`; manual test on an iPhone |
| Orphaned uploads (never saved, or purged by 006) accumulate before Phase 7 | H / L | `deck:` + `editor` tags make the Phase 7 sweep exact; accepted gap (spec Assumptions) |
| Preview endpoint used as a fetch proxy | L / M | `item.create` only, 30/hour/user, safe-fetch guards, no body returned beyond trimmed OG fields |
| CSP change forgotten → uploads fail only in the deployed web image | M / H | Task in Phase 1; smoke runs against the deployed web |
| Remote preview image is slow or dead | M / L | Rendered lazily by `LinkCard`; Phase 7 snapshots and checks links |

## Settle before starting

- [ ] Decide whether signed params alone are enough, or create a **signed** upload preset (images only, file-size cap, incoming `c_limit,w_2048`) and add its name to the signed params. Default: signed params only, with the client-side 8 MB check.
- [ ] `007-card-editor` merged (field registry, `previewSlot`, draft model, `?type=` create route).
- [ ] Cloudinary credentials available to the smoke run on the deployed instance, or the image smoke step runs only when `/config` reports a cloud name.

## Complexity Tracking

None.
