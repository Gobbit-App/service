# Implementation Plan: Media cards (photo, PDF, audio, video)

**Branch**: `feat/045-media-cards` (spec + plan); implementation in stacked PRs (below) | **Date**: 2026-11-11 | **Spec**: [spec.md](spec.md) | **Roadmap**: `PLAN.md` § Phase 7 (Media and links) follow-up

**Input**: Feature specification from `/specs/045-media-cards/spec.md`

## Summary

The `image` card type becomes `media`, and a payload `kind` (`image | pdf | audio | video`) names the
file it holds. A photo card becomes a gallery of 1–8 photos (`images[]`, first = cover); PDF, audio and
video cards hold one file (D398). The enum value is renamed in place, existing rows are reshaped to a
one-photo gallery without touching `updated_at`, and the old name is accepted as a logged alias for one release (D386,
D387).

Files stay on Cloudinary:
- PDFs are `image` resources, rendered page by page by the provider.
- Audio and video are `video` resources, converted to `mp4`/`mp3`, with stills and waveforms.
- Uploads are signed per kind with disjoint format lists and eager renditions (D388, D389, D392).
- Assets record their resource type, kind, duration, pages and content fingerprint. Confirm stays
  offline (D157 model) and the daily sweep verifies against the provider (D390).

The reader gets lazy-loaded card bodies on native `<video>`/`<audio>`, a gallery card (cover + count),
and one lazy full-screen page viewer shared by galleries and PDFs, which shows PDF pages as
provider-rendered images (D391, D399). There's no PDF or lightbox library, and nothing PDF runs in our
origin.

Elsewhere:
- **Public pages** render all kinds without JS.
- **Share previews** use the video still or the PDF's first page (D397).
- **Ingestion** turns a shared PDF, audio or video file into a direct media proposal, with no model
  call (D395), deduped by fingerprint (D396). Shares with several photos propose a gallery.

## Starting point

- `main` @ `d3c2844` (D385 `ASK_ENABLED`), deployed. Latest migration `0024_card_body_2000`.
- Builds on:
  - `008-card-media`: signed browser uploads, D133.
  - `012-media-assets`: the `assets` registry, D156–D160, ADR-054.
  - `013-cloud-image`: `CloudImage`, D161.
  - `014-link-snapshots`: D163.
  - `017-public-pages`, `041-share-visuals` and `039-editor-experience`; PR #138 added pasting an image.
- Current constraints found in code:
  - `resource_type: 'image'` and `/image/upload/` are hard-coded in signing (`media/sign-upload.ts`),
    the store (`media/media-store.ts`), `media/ingest-uploads.ts`, `share/og-store.ts`, both URL
    builders (`apps/web/src/cards/cloudinary.ts`, `apps/api/src/lib/cloudinary-url.ts`) and
    `scripts/media-reconcile.ts`.
  - `mediaAssetConfirmRequestSchema` requires `width`/`height`.
  - The CSP has no `media-src`.
  - The service worker caches every `res.cloudinary.com` response.
- `044-card-avatar` (spec only) references image assets. When it is implemented after this feature, its
  avatar check must require `kind = 'image'`.

## Technical Context

**Language/Version**: TypeScript (strict, ESM, no build step) on Node ≥ 22

**Primary Dependencies**: Hono + `@hono/zod-openapi`, Drizzle, pg-boss, React + Vite + TanStack Router/Query, `cloudinary` Node SDK (existing). **No new dependency** (D391 rejects `pdfjs-dist`; D392 rejects a video player library).

**Storage**: PostgreSQL 17. Migration `0025_media_cards`: renames an enum value, adds two enums,
`assets` columns and CHECKs, a payload backfill and redefines `item_search_text()`
(`data-model.md`). Files go to Cloudinary `image` and `video` resources.

**Testing**: Vitest (unit, integration with Testcontainers), Playwright `@smoke` / `@full`. No search-eval change: ranking is untouched. Only the media search text changes (it drops payload digits and adds the file name).

**E2E tier**: **smoke + full**.
- Smoke: creating a card with an upload is a critical journey, and the CSP (`media-src`) and
  service-worker changes cross a deployment boundary. Smoke covers one PDF journey (upload → card →
  viewer page 2) and extends the existing photo journey to a two-photo gallery (upload both → card shows
  "2 photos" → viewer shows photo 2), since creating a photo card is a critical journey whose payload
  shape changes.
- Full: gallery editing (reorder, remove, 8-photo cap, failed photo retry), video and audio playback, one-at-a-time playback, offline messages, negative uploads, public
  pages per kind, share previews per kind, and file ingestion. These are secondary paths, variants and
  async work.
- Cloudinary is replaced at the network edge with the existing `routeFakeCloudinary` fixture, extended
  per kind.

**Target Platform**: Docker Compose on Dokploy; PWA on Android Chrome and iOS Safari (iOS matters here: `playsinline`, `m4a`/`mov` sources)

**Project Type**: pnpm monorepo: API + worker, PWA, shared packages

**Performance Goals**:
- PDF viewer shows page 1 in < 2 s on a mobile connection (SC-004).
- Facade first (D400): a list of media cards costs one picture per card. There's no media element and no
  player code before intent, and no video or audio bytes before a tap. At most one media element is alive.
- Tapping play or open feels instant: the chunk is prefetched on `pointerdown`/focus/hover or idle, and
  the first video frame comes from an eager rendition (no conversion wait).
- Initial bundle grows by ≤ 5 KB gzip (SC-005); the new card bodies and the viewer are lazy chunks.

**Constraints**:
- Card body ≤ 2000 code points and payload ≤ 8192 bytes. A single-file media payload is about 300
  bytes; an 8-photo gallery stays under 8192 because per-photo `alt` is capped at 200 code points (D398).
- Web initial bundle ≤ 150 KB gzip. AI keys optional (no model call for media, D395). Same origin.
- Single-request uploads; the starting limits (video 25 MB, audio 15 MB) are far below the provider's
  100 MB single-request ceiling (D393).

**Scale/Scope**: family and community decks. Tens of media files per deck, short clips (minutes), documents up to tens of pages.

## Constitution Check

*GATE: passed before Phase 0; re-checked after Phase 1 design. No violations.*

| Principle | How this plan complies |
|-----------|------------------------|
| I. Layered API | `media.service` holds kind and limit rules, and `mediaReference()` (successor of `imageReference()`) holds D160. Routes only parse; `assets.repo`/`items.repo` hold SQL. Upload permission is still `item.create` via `authorize()`/`can()`; a foreign deck answers 404. The type alias normalization lives in the items service, so MCP and other clients get it too. |
| II. One source of truth | `mediaKinds`, `mediaPayloadSchema`, format lists, limits and `MEDIA_DELIVERY` live in `@gobbit/shared` (`/media` subpath). Web and API URL builders and the signed eager list read the same table (contracts/delivery-urls.md). Run `pnpm api:openapi` after the route changes. |
| III. Invariants in the DB | The enum rename, `items_media_kind_check`, `items_media_files_check` (gallery 1–8), `assets_kind_resource_check` and duration/pages CHECKs are in migration `0025` with a hand-written down file that refuses unsafe rollback. Round trip in `migrations.int.test.ts`. D160 stays in the service, as today (ADR-054). |
| IV. Private by default | Every read path is unchanged (cards are filtered by deck, status and `visibleCategoriesWhere()`). `toPublicItem` gains a media allow-list without `fileName`/`bytes`/`format` (D397). No new outbound HTTP path: the verify pass uses the provider SDK as the sweep already does, and ingestion receives files from members, not from URLs. PDFs never render in the app's origin (D391). |
| V. Tests at the right tier | Unit, integration and e2e tiers as above; traceability table below. Every Accountability event is asserted in a test. |
| VI. Lean, offline-first web | No new dependency. Media bodies and the viewer are `React.lazy` chunks; the initial bundle grows ≤ 5 KB, checked by `pnpm budget`. API data offline via the query cache (unchanged). The SW still caches only images, now explicitly (D394). Value imports from `@gobbit/shared/media`. |
| VII. Simple, optional, deployable | No AI dependency (D395). Without `CLOUDINARY_URL`, media is off as photos are today. New env vars only tune limits and have defaults. One Cloudinary account setting (PDF delivery) is documented as **Action required** in `CHANGELOG.md`. |
| VIII. Accountable by default | Accountability table below. Existing unnamed media logs (sweep, upload failure) become named events as they are touched. All limits are env-tunable with defaults in `@gobbit/shared`. |

## Decisions this plan pins down

D386–D400 are used (recorded in the ledger in `specs/README.md`). Full reasoning is in [research.md](research.md).

| ID | Decision | ADR? |
|----|----------|------|
| D386 | `image` card type renamed `media`; `kind` in the payload; reshape without moving `updated_at` | yes → ADR-077 (with D388, D391, D398) |
| D387 | `image` accepted as an input alias for one release, logged `item.type_alias` | no |
| D388 | PDFs as Cloudinary `image` resources, audio/video as `video`; resource type stored on the asset | yes → ADR-077 |
| D389 | One signature per kind, disjoint format allow-lists, eager renditions signed | no |
| D390 | Confirm stays offline (D157); the server derives the kind from the format and checks limits; the daily sweep verifies against the provider | no |
| D391 | PDF viewer from provider page images; no PDF library, no iframe | yes → ADR-077 |
| D392 | Native `<video>`/`<audio>`, one rendition each (`mp4` `vc_auto`, `mp3`), waveform as a CSS mask, eager generation | no |
| D393 | Per-kind limits for the editor and ingest, env-tunable; single-request uploads | no |
| D394 | SW caches only `destination === 'image'` Cloudinary requests; CSP `media-src` | no |
| D395 | Ingestion: first supported file decides; direct proposal with no model call; deterministic title | no |
| D396 | Media dedup by content fingerprint (`etag`), `possible_duplicate` via `file` | no |
| D397 | Public allow-list and share-preview image order per kind | no |
| D398 | A photo card is a gallery of 1–8 images (`images[]`, cover first); one GIN index for file lookups; per-photo alt ≤ 200 | yes → ADR-077 |
| D399 | One lazy page viewer for galleries and PDFs | no |
| D400 | Facade first: payload-only facade in lists, chunk prefetch on intent or idle, one live media element | no |

## Project Structure

### Documentation (this feature)

```text
specs/045-media-cards/
├── spec.md · plan.md · research.md · data-model.md · quickstart.md
├── contracts/api.md            # route and DTO changes
├── contracts/delivery-urls.md  # transformations, eager list, web components
├── checklists/requirements.md
├── tasks.md                    # /speckit-tasks
└── implementation-notes.md     # /speckit-implement
```

### Source Code

```text
packages/shared/src/
├── enums.ts                     # itemTypes: image→media; mediaKinds; assetResourceTypes
├── media/constants.ts           # formats per kind, limits per kind (+ env names), MEDIA_GALLERY_MAX, MEDIA_ALT_MAX, MEDIA_DELIVERY, eager list
├── schemas/payloads.ts          # mediaPayloadSchema, union on kind (replaces imagePayloadSchema), alias normalizer
├── schemas/item.ts, public.ts, share.ts   # type enum + 'image' input alias
├── schemas/media.ts             # sign request {kind}, sign response (+eager, kind), confirm request, MediaAsset
└── ingest/constants.ts          # INGEST_MEDIA_MIMES per kind, dedupVias + 'file', per-kind ingest limits

packages/db/
├── src/schema/assets.ts, common.ts, items.ts
├── migrations/0025_media_cards.sql   (custom: `pnpm db:generate --custom`, enum rename + backfill)
└── migrations/down/0025_media_cards.sql

apps/api/src/
├── services/media-reference.ts  # was image-reference.ts (D160 for every kind and every gallery photo, facts from asset, rejected assets)
├── services/media.service.ts    # sign per kind, confirm rules (D390), events
├── services/media-sweep.ts      # delete per resource type + verify pass
├── services/items.service.ts    # type alias normalization (D387), mediaReference call sites
├── media/sign-upload.ts, media-store.ts, ingest-uploads.ts, asset-dto.ts
├── lib/cloudinary-url.ts        # resource type + ext aware, reads MEDIA_DELIVERY
├── repositories/assets.repo.ts  # new columns, orphan predicate via payload @> (D398), liveMediaByEtag, verify helpers
├── public/render-item.ts        # no-JS video/audio/pdf
├── services/public-dtos.ts      # media allow-list
├── share/share.service.ts, share/content-hash.ts   # preview image per kind
├── services/ingest.service.ts, jobs/ingest.ts, ingest/run-dedup.ts, ingest/dedup-verdict.ts
├── ai/extract-validate.ts, ai/extract-prompt.ts, ai/payload-text.ts   # 'image'→'media' kind image
├── routes/media.ts, routes/config.ts
└── scripts/media-reconcile.ts

apps/web/src/
├── cards/CardBody.tsx           # case 'media' → by kind (image/gallery eager; pdf/audio/video lazy)
├── cards/cloudinary.ts          # resource-type aware builders from MEDIA_DELIVERY
├── cards/CloudImage.tsx         # `source` prop (stills, PDF pages)
├── cards/payload-guards.ts      # asMediaPayload (+ legacy 'image')
├── cards/ImageCard.tsx          # reads images[0]
├── cards/media/{MediaFacade,GalleryCard,PdfCard,PageViewer,VideoCard,AudioCard,MediaUnavailable}.tsx
│   + use-active-media.ts + load-media-module.ts + media.css   # D400 tiers
├── editor/fields/MediaFields.tsx (was ImageFields) + GalleryFields.tsx (photo list: add many, describe, move, remove), editor/media-file.ts (was image-file.ts),
│   editor/upload.ts, editor/use-media-upload.ts, editor/draft.ts, editor/validate.ts, editor/media-payload.ts
├── editor/composer/type-tiles.ts, TypeTiles.tsx, pick-start-type.ts
├── browse/BrowsePage.tsx        # pause off-screen players
├── share/share-target.ts        # accept pdf/audio/video
├── sw.ts                        # image-only Cloudinary cache (D394)
├── analytics/*                  # content events send type 'media'
└── vite.config.ts               # share_target accept list
apps/web/Caddyfile               # CSP media-src
apps/web/scripts/initial-chunks.ts   # LAZY_ONLY_MARKERS for PageViewer and the players (D400)

e2e/fixtures/cloudinary.ts       # fake per resource type (pdf page, video/audio upload responses)
e2e/tests/smoke/editor.spec.ts   # photo journey → two-photo gallery; new PDF journey
e2e/tests/full/media.spec.ts     # video/audio, negatives, offline, public, share, ingest
```

**Structure Decision**: no new package or service. The work is split into four stacked PRs (memory:
small PRs per stream). Each PR passes the gates on its own and leaves `main` deployable.

| PR | Stream | Contents | User stories |
|----|--------|----------|--------------|
| 1 | Foundation | migration (incl. gallery reshape and GIN index), shared enums/schemas/constants, alias, `mediaReference`, assets columns, sign/confirm per kind, store and sweep per resource type + verify pass, URL builders, search text, `/config` limits, `api:openapi`, mechanical web rename (`image` → `media` kind image; `ImageCard` reads `images[0]`) with no new UI | US1 |
| 2 | Reader + editor | CSP, SW, cloudinary builders, `CloudImage` source, Gallery/Pdf/Video/Audio cards, PageViewer, exclusive playback, Browse pause, MediaFields + GalleryFields, composer, drafts, smoke gallery + PDF journeys, full specs | US2, US3, US4, US7 |
| 3 | Public + share | `toPublicItem` allow-list, `render-item` per kind, share preview image per kind, content hash, full specs | US6 |
| 4 | Ingestion | share target accept, `/ingest` + email-in MIME families, per-kind ingest limits, direct media proposal, multi-photo gallery proposals, etag dedup, share status reasons, full spec | US5 |

## Invariant → test traceability

| Invariant / rule | Enforced in | Test (file, tier) |
|------------------|-------------|-------------------|
| FR-001/D386/D398 media row has a valid `kind`; gallery 1–8 photos each with a `publicId`, else one `publicId` | DB CHECKs | `packages/db/test/media-cards.int.test.ts`, int |
| FR-002 existing image rows → one-photo galleries, `updated_at` unchanged | migration reshape | `packages/db/test/migrations.int.test.ts` (round trip + backfill), int |
| Down migration refuses with non-image media | down file | `migrations.int.test.ts`, int |
| FR-003/D387 `image` input alias → `media`, logged | items service | `items.service.test.ts` (unit) + `items.int.test.ts`, int |
| FR-004/D390 kind derived from format, not the request | media service | `media.service.test.ts`, unit |
| FR-005/D160 asset of own deck; facts from asset; rejected asset refused | `mediaReference` | `media-reference.test.ts` unit + `items.int.test.ts`, int |
| D398 gallery: ≤ 8, no repeats, all image assets, alt ≤ 200; kind mismatch refused | schema + `mediaReference` | `payloads.test.ts`, `media-reference.test.ts`, unit |
| D398 a photo in any gallery position is never swept | orphan predicate | `media-sweep.int.test.ts`, int |
| FR-012/US7 gallery cover + count; viewer order, "k of N", arrows; no inner swipe in Browse | web | `GalleryCard.test.tsx`, `PageViewer.test.tsx` unit; `smoke/editor.spec.ts` gallery journey, smoke |
| FR-020/US7 add many, reorder, remove, cap 8, save waits for uploads | web | `GalleryFields.test.tsx`, unit; `full/media.spec.ts`, full |
| FR-008/D393 over-limit refused + file deleted | media service | `media.service.test.ts`, unit; `media.int.test.ts`, int |
| FR-008/D390 verify pass rejects false facts | sweep | `media-sweep.int.test.ts`, int |
| FR-009 unreadable PDF/no duration refused | media service | `media.service.test.ts`, unit |
| FR-010 only `item.create` may sign/confirm any kind | media service | `media.int.test.ts`, int |
| FR-011 sweep keeps referenced files of every kind; deletes per resource type | assets repo + sweep | `media-sweep.int.test.ts`, int |
| D389 signature covers formats + eager per kind | sign-upload | `sign-upload.test.ts`, unit |
| D392 builders use only eager transformations for audio/video | shared/web/api builders | `cloudinary.test.ts` (web), `cloudinary-url.test.ts` (api), unit |
| FR-013 viewer pages lazily, indicator, zoom, open original | web | `PageViewer.test.tsx` unit; `smoke/editor.spec.ts` PDF journey, smoke |
| FR-014/FR-016 no preload, one plays at a time, Browse pauses | web | `VideoCard.test.tsx`, `use-active-media.test.ts` unit; `full/media.spec.ts`, full |
| D400 facade only in lists (20 video cards → 0 media elements); prefetch on intent/idle, none on `saveData`; one live element; chunk failure → retry | web | `MediaFacade.test.tsx`, `load-media-module.test.ts`, `use-active-media.test.ts` unit; `full/media.spec.ts` request counting, full |
| D400 viewer and players never in the initial bundle | build | `initial-chunks.test.ts` markers + `pnpm budget`, CI |
| FR-017 reserved box, unavailable placeholder | web | `CardBody.test.tsx`, unit |
| FR-019 offline messages | web | `full/media.spec.ts` (offline), full |
| FR-020/021 composer accepts all kinds; legacy drafts restore | web | `MediaFields.test.tsx`, `draft.test.ts`, unit |
| FR-022/D397 public allow-list, no-JS players | API | `public-dtos.test.ts`, `render-item.test.ts` unit; `full/media.spec.ts`, full |
| FR-023 share preview image per kind | share service | `share.service.test.ts`, unit |
| FR-024/025/D395 file share → direct media proposal, deterministic title; several photos → gallery | ingest service/job | `ingest.service.test.ts` unit, `ingest.int.test.ts` int, `full/media.spec.ts` full |
| FR-026/D396 identical file → `possible_duplicate` via `file` | dedup | `dedup-verdict.test.ts` unit, `run-dedup.int.test.ts` int |
| FR-027 over-limit/unsupported/extra files reported unused | ingest service | `ingest.service.test.ts`, unit |
| FR-029 search text = title, body, every photo's alt, file name | `item_search_text()` | `search.int.test.ts`, int |
| D394 SW caches only images | sw | `sw.test.ts` (route matcher), unit |
| SC-005 bundle growth ≤ 5 KB | build | `pnpm budget` in CI |

## Accountability

| Decision | Event / audit row | Outcomes · reasons | Fields (ids/hashes only) | Level | Watched | Alert threshold (default) | Test |
|----------|-------------------|--------------------|--------------------------|-------|---------|---------------------------|------|
| Sign an upload | `media.sign` log | accepted · refused (`unknown_kind`, `unavailable`) | requestId, actorId, deckId, kind | info | aggregate by kind; refusal rate | `unavailable` ≥ 1 in 10 min (storage misconfigured) | `media.service.test.ts` |
| Record (confirm) an upload | `media.confirm` log (+ `assets` row on accept) | accepted · refused (`format`, `kind_mismatch`, `too_large`, `unreadable`, `bad_signature`, `wrong_folder`) | requestId, actorId, deckId, assetId, kind, bytes | info (refused `kind_mismatch`/`bad_signature`: warn) | instance for warn; aggregate by reason | `kind_mismatch` or `bad_signature` ≥ 1 (tampering) | `media.service.test.ts` |
| Delete a refused file | `media.refused_delete` log | deleted · failed | requestId, deckId, publicId hash | info / error on failed | instance on failed | failed ≥ 1 | `media.service.test.ts` |
| Verify pass | `media.verify` log | verified · refused (`too_large`, `format`, `resource_type`) · missing | jobId, assetId, deckId, kind | info (refused: warn) | aggregate per run; instance on refused | refused ≥ 1 per day | `media-sweep.int.test.ts` |
| Clean up orphans | `media.sweep` log (renames today's unnamed summary) | deleted · failed, per kind | jobId, counts per kind | info / error on failed | aggregate per run | failed ≥ 1 per run | `media-sweep.int.test.ts` |
| Old type name used | `item.type_alias` log | accepted · reason `image` | requestId, actorId, deckId, route | info | aggregate per day | none; retire the alias after 30 silent days | `items.service.test.ts` |
| Shared file used or not | `ingest.media_file` log | used · unused (`unsupported`, `too_large`, `extra_file`) | jobId, deckId, kind, bytes | info | aggregate by reason | `too_large` rate > 20 % of media shares per day (limit too low) | `ingest.service.test.ts` |
| Media proposal built | `ingest.media_proposal` log | proposed · body (`kept`, `dropped_too_long`) · title source (`title`, `subject`, `text`, `filename`) | jobId, deckId, itemId, kind | info | aggregate by title source | none | `ingest.service.test.ts` |
| Duplicate by fingerprint | existing dedup verdict on `ingest_jobs` + `ingest.dedup` log, `via: 'file'` | possible_duplicate | jobId, itemId, matchItemId | info | aggregate by via | none | `dedup-verdict.test.ts`, `run-dedup.int.test.ts` |
| Card edits (media) | `item_events` (ADR-057), unchanged | created/updated · fields | itemId, actorId | – | existing | existing | existing |

Playback and viewer errors are client-side experiences with no server decision. They aren't logged
server-side, because the provider's delivery logs cover failed renditions. Share-preview image choice is
a pure function of the payload (D397), so it isn't a decision about a person.

**Operator controls** (defaults in `@gobbit/shared/media`, runbook in `docs/design/card-media.md`):
`MEDIA_MAX_BYTES_PDF` (10 MB), `MEDIA_MAX_BYTES_AUDIO` (15 MB), `MEDIA_MAX_BYTES_VIDEO` (25 MB; ≤ 100 MB
without chunked upload), `INGEST_MAX_BYTES_PDF` (10 MB), `INGEST_MAX_BYTES_AUDIO` (15 MB),
`INGEST_MAX_BYTES_VIDEO` (24 MB, ≤ `INGEST_BODY_MAX_BYTES`), `MEDIA_VERIFY_BATCH` (200 assets per sweep).
The gallery size (8) and per-photo alt cap (200) are constants, not env vars: the DB CHECK and the payload
byte limit depend on them.

## Rollout

- **Migrations**: `0025_media_cards`, reversible while no non-image media exists (the down file
  refuses otherwise). The backfill touches every image row once, with the `updated_at` trigger disabled.
  Drizzle-kit can't express `RENAME VALUE`, so it is a custom migration (`pnpm db:generate --custom`)
  with the Drizzle snapshot updated.
- **Env / config**:
  - The seven variables above are optional with defaults. Add them to the README env table, the
    Compose `x-api-env` list and a `CHANGELOG.md` entry.
  - **Action required** (Cloudinary console, before PR 2 deploys): enable "Allow delivery of PDF and
    ZIP files", or "Open original" answers 401.
- **API client**: yes, `pnpm api:openapi` in PR 1 (the type enum, sign and confirm DTOs, `/config`).
- **Deploy order**:
  - PR 1 ships the rename with the alias, so installed PWAs on the old bundle keep working. The old web
    renders `type: 'media'` as an unknown type until it updates, so PR 1 also ships the web rename. The
    persisted query cache normalizer covers cached `image` items.
  - PR 2 needs the CSP change in the same deploy (it is in the web image).
  - PR 4 enlarges the share-target `accept` list. Android picks that up when the PWA manifest refreshes.
- **Docs**:
  - `docs/design/card-media.md`: kinds, delivery table, viewer, runbook, deviations.
  - `docs/design/ingestion.md`: file shares, dedup via `file`.
  - `docs/design/public.md`: allow-list.
  - ADR-077 in `docs/adr.md`, plus one index row and one line in `docs/architecture.md`.
  - `CLAUDE.md` Media bullet; `specs/README.md` D-ledger; `PLAN.md` link.
  - Remove the alias task in `PLAN.md` (retire D387).

## Risks

| Risk | Likelihood / impact | Mitigation |
|------|---------------------|------------|
| Provider facts differ from the plan (`pages`/`duration`/`etag` missing, `pg_N`+`f_auto`, eager matching) | M / M | Quickstart § 0 is the first task of PR 1; deviations logged before building on them |
| Video transformations consume the provider's monthly transformation/bandwidth quota quickly | M / M | One rendition per video, eager (counted once), `preload="none"`, no autoplay; operator can lower `MEDIA_MAX_BYTES_VIDEO` |
| iOS Safari playback quirks (`playsinline`, `mp3` on old iOS, HEVC sources) | M / H | `mp4` + `vc_auto`, `playsinline`; manual iPhone check in quickstart § 4; full e2e on WebKit |
| Stale PWAs send `type: 'image'` or read `media` before updating | H / M | Input alias (D387), persisted-cache and draft normalizers, PR 1 ships API and web together |
| Enum rename breaks raw SQL or functions that name `'image'` | M / H | Grep all migrations/functions for `'image'` in PR 1; `item_search_text()` redefined in the same migration; int tests over search |
| Eager processing not finished when a member presses play | M / L | "Still processing" message plus retry (D392); stills come first |
| Large uploads on mobile networks fail midway | M / M | Progress, retry per file, card text and other photos preserved (spec edge cases); small starting limits (D393) |
| Gallery payload near the 8192-byte limit (long alts in multi-byte scripts) | L / M | Per-photo alt cap (D398); the editor counts; the DB CHECK stays the backstop with a field-level 422 |
| Gallery swipe fights Browse's card swipe | M / M | The card never scrolls horizontally; only the full-screen viewer does (D398, ADR-065) |
| Lying client understates `bytes` | L / L | Format/kind enforced by the signature; verify pass within a day (D390) |

## Settle before starting

- [ ] Enable "Allow delivery of PDF and ZIP files" on the production and test Cloudinary clouds (owner action).
- [ ] Run quickstart § 0 against the test cloud and record the answers in `implementation-notes.md`.
- [ ] Confirm the default limits (PDF 10 MB, audio 15 MB, video 25 MB; ingest 10/15/24 MB) fit the Cloudinary plan in use.
- [ ] Optional `/speckit-clarify`: content search (PDF text and transcripts) and ingesting file links are out of scope by assumption.

## Complexity Tracking

No constitution violations.
