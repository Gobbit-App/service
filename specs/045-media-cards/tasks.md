---

description: "Tasks for 045 media cards"
---

# Tasks: Media cards (photo, PDF, audio, video) (045)

**Input**: `specs/045-media-cards/` — spec.md, plan.md, research.md (D386–D400), data-model.md, contracts/

**Tests**: REQUIRED (constitution V). Every traceability row in plan.md maps to a test task below.

**Organization**: phases follow the plan's four stacked PRs. Each PR passes the gates on its own and
leaves `main` deployable. Story labels map to spec.md (US1 compat, US7 gallery, US2 PDF, US3 video,
US4 audio, US5 ingestion, US6 public/share).

## Format: `[ID] [P?] [Story] [Tier?] Description`

---

## Phase 1: PR 1 — Foundation (US1, plus the shared shapes US2–US7 build on) 🎯 MVP

**Goal**: `image` → `media` everywhere with the gallery payload shape; existing photo cards look and
behave as before; the API can sign, record, reference, sweep and search every kind (no new UI).

**Independent test**: quickstart § 3 — existing photo cards unchanged after migrating; `type: "image"`
create answers 201 `type: "media"` and logs `item.type_alias`.

### Shared (`@gobbit/shared`)

- [x] T001 [P] [US1] `packages/shared/src/enums.ts`: `itemTypes` `image`→`media`; new `mediaKinds = ['image','pdf','audio','video']`, `assetResourceTypes = ['image','video']`
- [x] T002 [P] [US1] `packages/shared/src/media/constants.ts` (subpath `/media`): `MEDIA_FORMATS` per kind (disjoint, D389: image `jpg,png,webp,heic,heif`; pdf `pdf`; audio `mp3,m4a,aac,wav,ogg,opus,flac,amr`; video `mp4,mov,m4v,webm,3gp`), `kindForFormat()`, `resourceTypeForKind()`, `MEDIA_MAX_BYTES` defaults (image 8 MB, pdf 10 MB, audio 15 MB, video 25 MB) + env names `MEDIA_MAX_BYTES_{PDF,AUDIO,VIDEO}`, `MEDIA_GALLERY_MAX = 8`, `MEDIA_ALT_MAX = 200`, `MEDIA_DELIVERY` table and `MEDIA_EAGER` per kind (contracts/delivery-urls.md)
- [x] T003 [P] [US1] [unit] `packages/shared/src/media/constants.test.ts`: formats disjoint, `kindForFormat` total over the lists, eager list = video/audio delivery transformations
- [x] T004 [US1] `packages/shared/src/schemas/payloads.ts`: `mediaPayloadSchema` strict discriminated union on `kind` — image `{ kind:'image', images: 1..8 of { publicId ≥1, alt ≤ 200 code points (input), width?, height? } }` no repeated `publicId`; pdf/audio/video `{ kind, publicId, alt? ≤ 200, width?, height?, durationMs?, pages?, fileName? ≤ 200 }`; `normalizeLegacyImage()` (flat `{publicId,alt,width,height}` → one-photo gallery, D387); replaces `imagePayloadSchema`
- [x] T005 [US1] `packages/shared/src/schemas/item.ts`, `public.ts`, `share.ts`: type enum `media`; input schemas accept `image` alias (create, patch, `?type=`)
- [x] T006 [P] [US1] `packages/shared/src/schemas/media.ts`: sign request `{ kind? }` (default image), sign response (+`eager`, `eagerAsync`, `kind`), confirm request (`width`/`height` optional; + `kind`, `resourceType`, `durationMs`, `pages`, `etag`, `originalFilename`), `MediaAsset` (+`kind`, `resourceType`, `durationMs`, `pages`, `originalFilename`); `schemas/config.ts` `media.maxBytes` per kind
- [x] T007 [P] [US1] [unit] `packages/shared/src/schemas/payloads.test.ts`: gallery 1–8, no repeats, alt ≤ 200, kind union, legacy normalizer; `item.test.ts` alias

### Database

- [x] T008 [US1] `packages/db/src/schema/{common,items,assets}.ts`: `item_type` media, `media_kind`, `asset_resource_type` enums; assets columns `resource_type` NOT NULL DEFAULT 'image', `kind` NOT NULL DEFAULT 'image', `duration_ms` int NULL CHECK `> 0`, `pages` int NULL CHECK `> 0`, `etag` text NULL, `original_filename` text NULL ≤ 200 chars, `verified_at`/`rejected_at` timestamptz(3) NULL; CHECK `assets_kind_resource_check`; index `assets_deck_etag_idx (deck_id, etag) WHERE etag IS NOT NULL`; replace `items_image_public_id_idx` with GIN `items_media_payload_idx (payload jsonb_path_ops) WHERE type='media'`
- [x] T009 [US1] `packages/db/migrations/0025_media_cards.sql` (custom): `ALTER TYPE item_type RENAME VALUE 'image' TO 'media'`; new enums/columns/CHECKs/indexes; reshape backfill with `items_set_updated_at` disabled; `items_media_kind_check`, `items_media_files_check`; redefine every function naming `'image'` (`item_search_text()` → `alts`/`alt`/`fileName`); Drizzle snapshot + journal
- [x] T010 [US1] `packages/db/migrations/down/0025_media_cards.down.sql`: refuse when non-image media, multi-photo galleries, video or pdf assets exist; else flatten `images[0]`, restore index, enum value and function
- [x] T011 [P] [US1] [int] `packages/db/test/media-cards.int.test.ts` (CHECKs: kind, gallery 1–8, publicId) and `migrations.int.test.ts` (round trip, backfill keeps `updated_at`, down refuses with a PDF card)
- [x] T012 [P] [US1] Rename `'image'` in `packages/db/test/fixtures/*`, `factories.ts`, `search-normalize.int.test.ts`

### API

- [x] T013 [US1] `apps/api/src/services/media-reference.ts` (was `image-reference.ts`): D160 for every kind and every gallery photo — own deck, not rejected, kind matches payload kind, no repeats, facts (`width`,`height`,`durationMs`,`pages`,`fileName`) from the asset; `422 Unknown file` field `payload.publicId` / `payload.images.<n>.publicId`
- [x] T014 [P] [US1] [unit] `apps/api/src/services/media-reference.test.ts`
- [x] T015 [US1] `apps/api/src/services/items.service.ts` (+ `review.service.ts`, `review/publish-proposal.ts`): normalize `image` alias → `media` + legacy payload, log `item.type_alias` (requestId, actorId, deckId, route); call `mediaReference`
- [x] T016 [P] [US1] [unit] `items.service.test.ts` alias + log; [int] `apps/api/test/items.int.test.ts` create with `type:'image'` → 201 `media`, foreign/rejected asset 422
- [x] T017 [US1] `apps/api/src/media/sign-upload.ts`: sign per kind — upload URL per resource type, `allowed_formats`, `eager`+`eager_async` for audio/video; `media.service.ts` `sign({kind})` logs `media.sign`
- [x] T018 [US1] `apps/api/src/services/media.service.ts` confirm (D390): derive kind from format, refuse `format`/`kind_mismatch`/`too_large`/`unreadable` (delete stored file first, `media.refused_delete`), log `media.confirm`; per-kind limits from env (`MEDIA_MAX_BYTES_*`)
- [x] T019 [P] [US1] [unit] `sign-upload.test.ts` (formats + eager signed per kind), `media.service.test.ts` (kind derivation, refusals, delete, events)
- [x] T020 [US1] `apps/api/src/repositories/assets.repo.ts`: upsert new columns; orphan/`isReferenced` via `type='media'` + both `@>` forms; `orphans()` returns `resource_type`; `liveMediaByEtag(deckId, etags)`; `unverified(limit)`, `markVerified`, `markRejected`
- [x] T021 [US1] `apps/api/src/media/media-store.ts`, `ingest-uploads.ts`, `share/og-store.ts`, `asset-dto.ts`, `scripts/media-reconcile.ts`: resource type from the asset, never hard-coded `image`
- [x] T022 [US1] `apps/api/src/services/media-sweep.ts` + `jobs/media-sweep.ts`: delete per resource type, named `media.sweep` (counts per kind); verify pass (`MEDIA_VERIFY_BATCH`, default 200) logging `media.verify` verified/refused/missing
- [x] T023 [P] [US1] [int] `apps/api/test/media-sweep.int.test.ts` (gallery photo in any position never swept; video deleted as video; verify rejects false facts) and `media.int.test.ts`/`media-assets.int.test.ts` (sign/confirm per kind, only `item.create`, over-limit refused)
- [x] T024 [US1] `apps/api/src/lib/cloudinary-url.ts`: resource type + ext aware, reads `MEDIA_DELIVERY`; [unit] `cloudinary-url.test.ts`
- [x] T025 [US1] `routes/media.ts`, `routes/config.ts` (`media.maxBytes`); `pnpm api:openapi`
- [x] T026 [US1] Mechanical API rename `'image'`→`'media'` kind image (reading `images[0]` where a single image is needed): `ai/*`, `public/render-item.ts`, `share/share.service.ts`, `rich-text/plain-text.ts`, `ingest-wiring.ts`, `worker.ts`, `api.http` and their tests
- [x] T027 [P] [US1] [int] `apps/api/test/search.int.test.ts`: media search text = title, body, every photo's alt, file name (FR-029)

### Web (mechanical, no new UI)

- [x] T028 [US1] `apps/web/src/cards/payload-guards.ts` `asMediaPayload` (+ legacy `image` flat payload); `CardBody.tsx` case `media` → `ImageCard` reading `images[0]` (other kinds: unavailable placeholder until PR 2); tests
- [x] T029 [US1] `apps/web/src/editor/*`: `ImageFields` writes `{ kind:'image', images:[…] }`; `draft.ts` restores legacy `type:'image'` drafts as media; `validate.ts`, `image-payload.ts`, composer tiles/`pick-start-type`, `creatable-types`, `ShareThumbnails`, analytics send `media`; sign request sends `kind:'image'`; tests
- [x] T030 [P] [US1] [e2e:smoke] `e2e/tests/smoke/editor.spec.ts` photo journey still passes on the new shape; `e2e/fixtures/cloudinary.ts` confirm fields
- [x] T031 [US1] CHANGELOG (new env vars, Action required: PDF delivery before PR 2), README env table, Compose `x-api-env`, `implementation-notes.md` (quickstart § 0 pending owner run)

**Checkpoint**: PR 1 gates green (lint, typecheck, unit, int, smoke); deployable on its own.

---

## Phase 2: PR 2 — Reader + editor (US7 gallery, US2 PDF, US3 video, US4 audio)

**Goal**: members create, view and play every kind in the app.

**Independent test**: quickstart § 4.

- [ ] T032 [US2] (CSP `media-src` done in PR 3, T045) `apps/web/src/sw.ts` caches only `destination === 'image'` Cloudinary requests (D394); [unit] `sw.test.ts`
- [ ] T033 [US2] `apps/web/src/cards/cloudinary.ts` resource-type aware builders from `MEDIA_DELIVERY`; `CloudImage.tsx` `source` prop (no blur placeholder for stills/pages); [unit] `cloudinary.test.ts` (audio/video only eager transformations), `CloudImage.test.tsx`
- [ ] T034 [US7] `cards/media/use-active-media.ts` (one live element, release buffer) + `load-media-module.ts` (module cache, intent/idle prefetch, skip on `saveData`, retry) (D400); [unit] tests
- [ ] T035 [US7] `cards/media/GalleryCard.tsx` (cover + "N photos"; single photo = today's `ImageCard`) and lazy `PageViewer.tsx` (dialog, k of N, arrows, zoom, per-photo alt, focus restore, horizontal/vertical) (D398, D399); [unit] `GalleryCard.test.tsx`, `PageViewer.test.tsx`
- [ ] T036 [US2] `cards/media/MediaFacade.tsx` + `PdfCard.tsx` (page 1, "PDF · N pages", Read → PageViewer, Open original); `MediaUnavailable.tsx`; [unit] `MediaFacade.test.tsx` (20 video cards → 0 media elements)
- [ ] T037 [US3] `cards/media/VideoCard.tsx` (`preload="none"`, `playsinline`, poster still, `play()` in click, still processing message, offline message); [unit] `VideoCard.test.tsx`
- [ ] T038 [US4] `cards/media/AudioCard.tsx` (waveform mask, duration); [unit] test
- [ ] T039 [US3] `CardBody.tsx` dispatch by kind; `browse/BrowsePage.tsx` pause off-screen players; `scripts/initial-chunks.ts` `LAZY_ONLY_MARKERS`; [unit] `CardBody.test.tsx` (reserved box, unavailable placeholder)
- [ ] T040 [US7] `editor/fields/MediaFields.tsx` (was ImageFields) + `GalleryFields.tsx` (multi-pick, per-photo progress/alt/move/remove, cap 8, save waits); `editor/media-file.ts`, `use-media-upload.ts`, `upload.ts` per kind with size check before upload; paste/camera add to gallery; [unit] `GalleryFields.test.tsx`, `MediaFields.test.tsx`
- [ ] T041 [US2] Composer: one "Media" tile accepting all kinds; drafts keep kind + photos/file; [unit] `draft.test.ts`, composer tests
- [ ] T042 [P] [US7] [e2e:smoke] `e2e/tests/smoke/editor.spec.ts`: two-photo gallery journey and PDF journey (viewer page 2); fake Cloudinary per resource type
- [ ] T043 [P] [US3] [e2e:full] `e2e/tests/full/media.spec.ts`: gallery editing, video/audio playback, one-at-a-time, offline, negatives, request counting

---

## Phase 3: PR 3 — Public + share (US6)

- [x] T044 [US6] `apps/api/src/services/public-dtos.ts` media allow-list (no `fileName`/`bytes`/`format`); [unit] `public-dtos.test.ts`
- [x] T045 [US6] `apps/api/src/public/render-item.ts` no-JS per kind (every photo, video, audio, PDF page 1 + link); [unit] `render-item.test.ts`
- [x] T046 [US6] `apps/api/src/share/share.service.ts` preview image per kind, `content-hash.ts` includes `kind`; [unit] tests
- [x] T047 [P] [US6] [e2e:full] `e2e/tests/full/media.spec.ts` public pages per kind, share previews per kind

---

## Phase 4: PR 4 — Ingestion (US5)

- [x] T048 [US5] `packages/shared/src/ingest/constants.ts`: `INGEST_MEDIA_MIMES` per kind, `dedupVias` + `file`, per-kind ingest limits (`INGEST_MAX_BYTES_{PDF,AUDIO,VIDEO}` 10/15/24 MB)
- [x] T049 [US5] `/ingest` + email-in accept PDF/audio/video by magic bytes; `apps/web/vite.config.ts` share target accept, `share/share-target.ts`
- [x] T050 [US5] `services/ingest.service.ts`, `jobs/ingest.ts`: first supported file decides; direct media proposal (`extraction.model = 'direct'`, deterministic title); multi-photo gallery proposal; unused files with reasons; `ingest.media_file`, `ingest.media_proposal` events; [unit] `ingest.service.test.ts`
- [x] T051 [US5] `ingest/dedup-verdict.ts`, `run-dedup.ts`: `possible_duplicate` via `file` by etag; [unit] + [int] `dedup.int.test.ts`
- [x] T052 [P] [US5] [int] `apps/api/test/ingest.int.test.ts` PDF share → proposal; [e2e:full] ingest in `full/media.spec.ts`

---

## Phase 5: Close-out

- [ ] T053 Gates: `pnpm lint && pnpm format:check && pnpm typecheck && pnpm test:unit && pnpm test:int && pnpm build:web && pnpm budget`
- [ ] T054 [P] `docs/design/card-media.md`, `ingestion.md`, `public.md` (+ Deviations); ADR-077 in `docs/adr.md` + `docs/architecture.md` row; `CLAUDE.md` Media bullet; `specs/README.md` ledger; `PLAN.md` link + alias-retirement task
- [ ] T055 Quickstart validation (owner, against the test cloud) and `/speckit-converge`

---

## Dependencies & Execution Order

- PR 1 blocks everything. PR 2 and PR 3 both build on PR 1 and are independent of each other; PR 4
  builds on PR 1 (and reuses PR 3's nothing). Stacked in order 1 → 2 → 3 → 4 for review.
- Within PR 1: shared (T001–T007) → DB (T008–T012) → API (T013–T027) → web (T028–T030).
