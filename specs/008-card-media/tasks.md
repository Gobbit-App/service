---

description: "Task list for 008-card-media"
---

# Tasks: Card media — image uploads and link previews

**Input**: Design documents from `/specs/008-card-media/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/ (media-sign.md, link-preview.md); `007-card-editor` merged

**Tests**: REQUIRED (constitution V). Every row of the plan's traceability table maps to a test task below.

**Organization**: Tasks are grouped by user story.

## Format: `[ID] [P?] [Story] [Tier?] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: US1 photo card, US2 link preview, US3 no image storage
- **[Tier]**: `[unit]` `*.test.ts(x)` next to code, `[int]` `apps/api/test/*.int.test.ts` (Docker), `[e2e]` `e2e/tests/smoke/`

---

## Phase 1: Foundational (Blocking Prerequisites)

**Purpose**: Shared DTOs/limits, rate keys, CSP. No migration.

- [X] T001 [P] Limits + `mediaSignResponseSchema`, `linkPreviewRequestSchema`, `linkPreviewResponseSchema` (preview reuses `linkPayloadSchema.shape.preview`) in packages/shared/src/media/index.ts; add `"./media"` to packages/shared/package.json `exports`
- [X] T002 [P] [unit] Schema/limit tests (strict response, no secret field, title/description caps, `MEDIA_IMAGE_MAX_BYTES === INGEST_IMAGE_MAX_BYTES`) in packages/shared/src/media/index.test.ts
- [X] T003 [P] `rateKeys.mediaSignUser`, `rateKeys.linkPreviewUser` in apps/api/src/lib/rate-window.ts
- [X] T004 [P] CSP `connect-src` + `https://api.cloudinary.com` in apps/web/Caddyfile
- [X] T005 Route file skeleton `registerMediaRoutes` in apps/api/src/routes/media.ts, registered in apps/api/src/app.ts

**Checkpoint**: Foundation ready

---

## Phase 2: User Story 1 — Photo card from the phone (Priority: P1) 🎯 MVP

**Goal**: A member picks or takes a photo, sees progress, adds alt text and saves an image card.

**Independent Test**: With `CLOUDINARY_URL` set, create an image card on a phone; it renders in the list and the preview like an ingested image.

### Tests for User Story 1

> Write these first and make sure they FAIL before implementation.

- [X] T010 [P] [US1] [unit] Signed params (folder `gobbit/items/<deckId>`, tags `editor,deck:<deckId>`, formats, timestamp, `expiresAt` = +50 min; signature equals `cloudinary.utils.api_sign_request`) in apps/api/src/media/sign-upload.test.ts
- [X] T011 [P] [US1] [unit] `signUpload` access (`can('item.create')`), rate-limit call, direct call without HTTP (FR-016) in apps/api/src/services/media.service.test.ts
- [X] T012 [P] [US1] [int] `POST /decks/{id}/media/sign`: 200 for editor/owner, 403 reader, 404 invisible deck, 401 no session, 401 `ing_` token, 429 + `Retry-After` past 60/hour, response has no secret, `no-store` in apps/api/test/media.int.test.ts
- [X] T013 [P] [US1] [unit] XHR upload: progress events, `abort()` leaves no photo, non-200 → retryable error, stale-timestamp 401 → one re-sign, `public_id` → `publicId` in apps/web/src/editor/upload.test.ts
- [X] T014 [P] [US1] [unit] `ImageFields`: type/size check before upload (HEIC by extension when `file.type` is empty), Save blocked without photo or alt, replace/remove in apps/web/src/editor/fields/ImageFields.test.tsx
- [X] T015 [P] [US1] [e2e] Create image card (happy path) and Save blocked without alt (negative) in e2e/tests/smoke/editor.spec.ts; skipped when `/config` reports no cloud name

### Implementation for User Story 1

- [X] T016 [P] [US1] Pure signed-params builder in apps/api/src/media/sign-upload.ts (reuses `parseCloudinaryUrl`/`cloudNameFrom` from lib/cloudinary-url.ts)
- [X] T017 [US1] `media.service.signUpload({ user, deckId })` with `authorize()` + `can`, `rateLimits.enforce(rateKeys.mediaSignUser(userId), MEDIA_SIGN_RATE_PER_HOUR)` in apps/api/src/services/media.service.ts; wire in apps/api/src/services/index.ts
- [X] T018 [US1] Route + OpenAPI for `POST /decks/{id}/media/sign` per contracts/media-sign.md in apps/api/src/routes/media.ts
- [X] T019 [US1] `pnpm api:openapi` (regenerate @pb/api-client)
- [X] T020 [P] [US1] Client call in apps/web/src/api/media.ts; XHR helper in apps/web/src/editor/upload.ts
- [X] T021 [US1] Sign + upload state machine (idle → signing → uploading(pct) → done/failed/cancelled) in apps/web/src/editor/use-image-upload.ts
- [X] T022 [US1] `ImageFields.tsx` (camera/gallery `<input type=file accept capture>`, blob thumbnail, progress, cancel, alt, replace/remove); register in apps/web/src/editor/fields/registry.ts in place of `ReadOnlyImage`; enable image in the create-type choice of apps/web/src/editor/CardEditor.tsx

**Checkpoint**: Image cards can be created and edited end to end

---

## Phase 3: User Story 2 — Fetch a link preview (Priority: P2)

**Goal**: "Fetch preview" fills title/description/image for a link card; failure never blocks saving.

**Independent Test**: Paste a public URL, fetch, edit the title, save; a private-address URL shows "No preview available" and still saves.

### Tests for User Story 2

- [X] T030 [P] [US2] [unit] Mapping (og.title → page title fallback, trim to 200/500, og.image absolute http(s) only, `siteName` dropped), any `safe-fetch` error → `null` with reason logged only, cache hit skips fetch (spy), rate limit counted on hits, in apps/api/src/services/link-preview.service.test.ts
- [X] T031 [P] [US2] [int] `POST /decks/{id}/link-preview` against a local fixture HTML server (test wiring sets `allowedPorts: null`): 200 preview; private-address URL in the default wiring → `{ preview: null }` and no hit on the fixture; 400 bad URL; 403 reader; 404 invisible deck; 429 past 30/hour, in apps/api/test/link-preview.int.test.ts
- [X] T032 [P] [US2] [unit] `FetchPreview`: fills draft preview + empty title, keeps member edits on refetch, `null`/429/network error → "No preview available" with Save enabled in apps/web/src/editor/fields/FetchPreview.test.tsx
- [X] T033 [P] [US2] [e2e] Link card with fetched preview (fixture page served by the test) and the no-preview path in e2e/tests/smoke/editor.spec.ts

### Implementation for User Story 2

- [X] T034 [US2] `linkPreview.service.lookup({ user, deckId, url })` using `createSafeFetch()` + `extractPage()` + `LRUCache` (`LINK_PREVIEW_CACHE_MAX`, `LINK_PREVIEW_CACHE_TTL_MS`) in apps/api/src/services/link-preview.service.ts; wire in apps/api/src/services/index.ts
- [X] T035 [US2] Route + OpenAPI for `POST /decks/{id}/link-preview` per contracts/link-preview.md in apps/api/src/routes/media.ts
- [X] T036 [US2] `pnpm api:openapi`
- [X] T037 [US2] Mutation hook in apps/web/src/editor/use-link-preview.ts; `FetchPreview.tsx` rendered through `LinkFields`' `previewSlot`

**Checkpoint**: Link previews work; failures degrade silently

---

## Phase 4: User Story 3 — Instance without image storage (Priority: P3)

**Goal**: Without `CLOUDINARY_URL` the API answers 503 and the editor shows image as unavailable; all other types work.

**Independent Test**: Start without `CLOUDINARY_URL`; image is disabled with an explanation; sign answers 503.

### Tests for User Story 3

- [X] T040 [P] [US3] [int] Sign → 503 `/problems/unavailable` when `CLOUDINARY_URL` is unset; link preview still works, in apps/api/test/media.int.test.ts
- [X] T041 [P] [US3] [unit] Create-type choice disables image with an explanation when `useCloudName()` is `null` (test next to apps/web/src/editor/CardEditor.tsx)
- [X] T042 [P] [US3] [e2e] Image option disabled when `/config` reports no cloud name, in e2e/tests/smoke/editor.spec.ts

### Implementation for User Story 3

- [X] T043 [US3] `serviceUnavailable('Image uploads are not configured')` in apps/api/src/services/media.service.ts when no Cloudinary config (same message as ingest)
- [X] T044 [US3] Disabled state + explanation in the create-type choice (apps/web/src/editor/CardEditor.tsx); `?type=image` without a cloud name falls back to `text`

**Checkpoint**: All three stories work independently

---

## Phase 5: Close-out

- [X] T050 `pnpm lint && pnpm format:check && pnpm typecheck && pnpm test:unit && pnpm test:int && pnpm budget`
- [X] T051 [P] docs/architecture.md: "Media" section (D129 boundary with Phase 7, D133, D134), **ADR-051** signed direct uploads, storage tag conventions, "Deviations from the plan" (8 MB not 10 MB; no width/height; no `siteName`; failure reason not returned)
- [X] T052 [P] README.md: `CLOUDINARY_URL` now also enables editor uploads; new routes; optional signed preset
- [X] T053 [P] CLAUDE.md ground rules: editor uploads are signed per deck (`gobbit/items/<deckId>`, tags `editor`,`deck:`); link preview only via `safe-fetch`
- [X] T054 PLAN.md: link this spec under Phase 6; tick demo 1 only after it has been run on the deployed instance with 007 (spec linked and 008 bundle noted; demo 1 left unticked: not yet run on the deployed instance)
- [ ] T055 Run quickstart.md validation (including the iPhone HEIC step) — not done: section 3 needs the deployed instance, real Cloudinary credentials and an iPhone; local coverage in implementation-notes.md
- [ ] T056 `/speckit-converge` until it reports Converged

---

## Dependencies & Execution Order

- **Foundational (Phase 1)**: blocks all stories; T005 before T018/T035
- **US1 → US3**: US3 reuses the sign service and editor type choice from US1
- **US2**: independent of US1 after Phase 1 (shares only `routes/media.ts`, so T018 and T035 are sequential)
- **External**: `007-card-editor` merged (registry, `previewSlot`, `?type=` create route)
- **Close-out**: after all stories

### Within Each User Story

- Tests written and FAILING before implementation
- shared → helper → service → route → `api:openapi` → web

---

## Notes

- [P] tasks = different files, no dependencies
- Log decisions the plan did not make, and deviations, in implementation-notes.md as you go
- Commit after each task or logical group (e.g. `feat(api): signed media uploads`)
- Never route the preview fetch around `safe-fetch`; never return the Cloudinary secret or the fetch failure reason
