---

description: "Tasks for 044 card cover image"
---

# Tasks: Card cover image (044)

**Input**: `specs/044-card-avatar/`: spec.md, plan.md, research.md, data-model.md, contracts/items-cover.md, quickstart.md

**Prerequisites**: plan.md, spec.md (US1 add/replace/remove, US2 lists, US3 Browse)

**Tests**: REQUIRED (constitution V). Every row of plan.md's traceability table maps to a test task below.

**Drift since the plan (main @ `040d260`)**: 045 media cards shipped. These tasks already account for it:

- The `image` card type is now `media` (the legacy `image` input alias still exists). Covers are refused on `link` and `media`.
- The D160 check lives in `apps/api/src/services/media-reference.ts` (`createMediaReferenceCheck`); there is no `image-reference.ts`. Assets have `kind` and `rejectedAt`.
- Migration `0025` is `0025_media_cards`, so this feature's migration is **`0026_card_cover`**.
- 045 used D386–D400 and claims ADR-077, so this feature's decisions are **D406–D415** (old D386→D406 … D395→D415) and its ADR is **ADR-078** (T001).
- `ImageFields.tsx` is gone; uploads go through `use-image-upload.ts`, which signs per kind. Covers sign as `image`.
- Constitution IX (reuse before writing): `item.cover` decisions go in the existing `media.events.ts` instead of a new `item-cover.events.ts`. There is no drag-and-drop helper in `apps/web/src/editor/`, so `use-drop-image.ts` is new.

## Format: `[ID] [P?] [Story] [Tier?] Description`

---

## Phase 1: Setup

- [X] T001 Renumber this feature's decisions in `specs/044-card-avatar/{plan,research,data-model,quickstart,spec}.md`, `contracts/items-cover.md` and `PLAN.md` (line "Card cover image"): D386→D406, D387→D407, D388→D408, D389→D409, D390→D410, D391→D411, D392→D412, D393→D413, D394→D414, D395→D415, ADR-077→ADR-078. In plan.md also: migration `0025_card_cover`→`0026_card_cover` (everywhere, incl. data-model.md); `image-reference.ts`/`createCoverReference` → `media-reference.ts`; `item-cover.events.ts` → `media.events.ts`; "photo"/`image` card type → `media`; add a Constitution Check row "IX. Reuse before writing" listing those reuses. In data-model.md pin `changes ∋ 'cover'` (not `'cover image'`). Create `specs/044-card-avatar/implementation-notes.md` recording this drift list. Docs only, no code

---

## Phase 2: Foundational (blocks all stories)

**Purpose**: column, shared shapes, DTO and the read-only `CoverBar` every story uses

- [X] T002 [P] `packages/shared/src/card-cover/index.ts` (NEW, zod-free): `coverItemTypes = ['text', 'reminder', 'event', 'table', 'calc'] as const`, `supportsCover(type: ItemType): boolean`, `type CardCover = { publicId: string; width?: number; height?: number }`; export `"./card-cover"` in `packages/shared/package.json`; re-export from the root index. [unit] `packages/shared/src/card-cover/index.test.ts`: true for the five, false for `link` and `media`
- [X] T003 `packages/shared/src/schemas/item.ts`: `cardCoverSchema` (output `{ publicId, width?, height? }`); `coverInputSchema = z.object({ publicId: z.string().min(1).max(255) }).strict()` (dimensions refused on input, D408); `itemSchema.cover: cardCoverSchema.nullable()`; every create variant gains `cover: coverInputSchema.optional()` (type support is checked in the service, D407); `itemPatchSchema.cover: coverInputSchema.nullable().optional()`. `packages/shared/src/events/constants.ts`: `itemEventFields` + `'cover'` (D410). [unit] `packages/shared/src/schemas/item.test.ts`: strict (width/height/extra keys refused), empty and 256-char `publicId` refused, patch accepts `null`
- [X] T004 `packages/db/src/schema/items.ts`: `cover: jsonb().$type<CardCover | null>()` (nullable); CHECK `items_cover_chk` exactly: `cover IS NULL OR (type::text IN ('text','reminder','event','table','calc') AND jsonb_typeof(cover) = 'object' AND jsonb_typeof(cover->'publicId') = 'string' AND char_length(cover->>'publicId') BETWEEN 1 AND 255 AND (NOT cover ? 'width' OR jsonb_typeof(cover->'width') = 'number') AND (NOT cover ? 'height' OR jsonb_typeof(cover->'height') = 'number'))`; partial btree index `items_cover_public_id_idx` on `((cover->>'publicId')) WHERE cover IS NOT NULL`. `pnpm db:generate` → `packages/db/migrations/0026_card_cover.sql` (+ snapshot/journal) and hand-written `packages/db/migrations/down/0026_card_cover.down.sql` (drop index, CHECK, column). No backfill; `search_text`, payload CHECKs and embeddings unchanged
- [ ] T005 [P] [int] `packages/db/test/migrations.int.test.ts` (round trip incl. 0026) and `packages/db/test/invariants.int.test.ts` (or a new `card-cover.int.test.ts`): CHECK refuses a cover on `link`/`media`, a non-object, a missing/empty/256-char `publicId`, non-number width; accepts the five types and NULL
- [ ] T006 `apps/api/src/lib/mappers.ts` `toItemDto` returns `cover` (null when unset); `apps/api/src/repositories/items.repo.ts` writes `cover` on insert/update (it rides on `itemColumns` for reads); `apps/api/src/events/diff-fields.ts` `ItemFields` includes `cover`, compared by `publicId` (null vs set, A vs B). [unit] `apps/api/src/events/diff-fields.test.ts`: add, replace, remove → `cover`; same `publicId` → nothing. Confirm `apps/api/src/services/public-dtos.ts` `toPublicItem` doesn't copy `cover` (allow-list, D414)
- [X] T007 [P] `apps/web/src/cards/CoverBar.tsx` (NEW): renders nothing when `cover` is null; else `CloudImage` in a 16:9 bar sharing the link snapshot's CSS (`.link-card__image--stored`; add `.card__cover` in `apps/web/src/styles.css`), `alt=""`, box reserved from the payload dimensions, removed on load error (D411); `loading` prop (lazy default, eager allowed). [unit] `apps/web/src/cards/CoverBar.test.tsx`: renders only when set, `alt=""`, nothing after an `error` event
- [ ] T008 `pnpm api:openapi` (item DTO, create and patch gained `cover`); commit the regenerated `packages/api-client`

**Checkpoint**: the column exists, DTOs carry `cover`, `CoverBar` renders it

---

## Phase 3: User Story 1 — Add, replace or remove a cover image (P1) 🎯 MVP

**Goal**: editors set, replace and remove a cover on text, reminder, event, table and calc cards; the API checks and logs it

**Independent Test**: create a text card, add a cover, save; reopen, replace, save; reopen, remove, save; each save shows the expected state on the card page

### Tests for User Story 1

- [ ] T009 [P] [US1] [unit] `apps/api/src/services/media-reference.test.ts`: `createCoverReference` returns `{ publicId, width?, height? }` from the asset row (client dimensions never used); refuses with 422 `cover.publicId` "Unknown image" for an unknown id, another deck's asset, a rejected asset (`rejectedAt` set) and a non-`image` kind (pdf/audio/video)
- [ ] T010 [P] [US1] [int] `apps/api/test/items-cover.int.test.ts` (NEW): create with cover; PATCH set/replace/remove/absent; 422 `cover` on `link`, `media` and the legacy `image` alias, and on a PATCH that changes the type to link/media while a cover remains; 422 `cover.publicId` for unknown, other deck and a PDF asset; 422 for `width` in the input; dimensions copied from the asset; `item_events` `updated` row with `changes ∋ 'cover'` on add, replace and remove, none for a same-`publicId` PATCH; a reader can't set it (existing 403/404); a publisher sets one on a proposal; ingestion proposals and imports have `cover = null` (D414); `GET /public/{slug}` items and public search results have no `cover` key; refusals log `item.cover` with the reason
- [ ] T011 [P] [US1] [int] `apps/api/test/media-sweep.int.test.ts`: an image referenced only by a cover is kept while the card is live, archived or soft-deleted; freed after the cover is removed or the card is purged (D409)
- [ ] T012 [P] [US1] [unit] `apps/web/src/editor/draft.test.ts`: `Draft.cover` round trip through `toCreateBody`/`toPatch` (unchanged → absent, set → `{ publicId }` only, removed → `null`); a pre-044 draft (`cover` undefined) means unchanged; `withType` to `link` or `media` clears it; `payloadHasContent` counts a cover

### Implementation for User Story 1

- [ ] T013 [US1] `apps/api/src/services/media-reference.ts`: `createCoverReference(assets)` beside `createMediaReferenceCheck`, reusing its `recorded()` (own deck, not rejected) plus `asset.kind === 'image'`; error path `cover.publicId`, message "Unknown image" for every case (D408). `apps/api/src/services/media.events.ts`: add `'item.cover': { outcome: 'refused'; reason: 'unsupported_type' | 'unknown_image' | 'other_deck' }` and level `warn` for `other_deck` in `MEDIA_DECISION_LEVELS`
- [ ] T014 [US1] `apps/api/src/services/items.service.ts` create/update: resolve the final type and cover; non-null cover on a type where `!supportsCover(type)` → 422 `cover` "This card type has no cover image" (never silently dropped, FR-009); a given `publicId` goes through `createCoverReference` (skip the lookup when it equals the stored one); refusals emit `item.cover` (requestId, deckId, itemId on PATCH, actorId); `cover` flows into `diffFields` so `insertItemEvents` logs it. Wire `createCoverReference` in `apps/api/src/services/media-wiring.ts` / `apps/api/src/index.ts` like the media check. Check `review.service.ts` publishes keep the cover
- [ ] T015 [US1] `apps/api/src/repositories/assets.repo.ts` `unreferenced`: add `OR i.cover->>'publicId' = ${assets.publicId}` (no status filter, so archived and soft-deleted cards keep it; uses `items_cover_public_id_idx`)
- [ ] T016 [US1] `apps/web/src/editor/draft.ts`: top-level `Draft.cover: CardCover | null | undefined`; `toCreateBody`/`toPatch` send `{ publicId }` only, `null` to remove, nothing when unchanged; `withType` clears it for `link`/`media` (D412). `apps/web/src/editor/drafts-store.ts` persists it. `apps/web/src/editor/composer/payload-content.ts`: a cover counts as content so `SwitchTypeConfirm.tsx` warns that the image will be dropped
- [ ] T017 [P] [US1] `apps/web/src/editor/use-drop-image.ts` (NEW): attaches `dragover`/`drop` to an element ref, hands the first `image/*` file to a callback and ignores everything else. [unit] `apps/web/src/editor/use-drop-image.test.ts`
- [ ] T018 [P] [US1] `apps/web/src/editor/use-paste-image.ts`: optional `scope` element; when set, only pastes while focus is inside it, handled in the capture phase so `LinkPhoto` keeps every other paste on an event card (D412). [unit] `apps/web/src/editor/use-paste-image.test.ts` (scoped vs unscoped; existing behaviour unchanged without `scope`)
- [ ] T019 [US1] `apps/web/src/editor/fields/CoverField.tsx` (NEW, lazy editor chunk): "Add image" (`ui/buttons` + `ui/icons` only), then "Replace"/"Remove"; pick (reuse `PickButton`), drop (`use-drop-image`), paste (`use-paste-image` scoped to the field); uploads through `useImageUpload` signing kind `image`, with the same progress and limits as photo uploads; preview through `CoverBar`; a failed upload shows the error and keeps the previous cover, and saving still works. [unit] `apps/web/src/editor/fields/CoverField.test.tsx`: add, replace, remove, failed keeps previous, pick/drop/paste paths
- [ ] T020 [US1] `apps/web/src/editor/CardEditor.tsx`: render `CoverField` above the type fields when `supportsCover(draft.type)` (import from `@gobbit/shared/card-cover`); the editor preview shows the bar through `Card` (T022). `apps/web/src/events/event-copy.ts`: `cover` → "image" in the activity log copy. [unit] extend `apps/web/src/editor/CardEditor.test.tsx`: field present for text, absent for link and media
- [ ] T021 [US1] [e2e:smoke] `e2e/tests/smoke/editor.spec.ts`: "add a cover image to a text card → bar in the deck list" with `routeFakeCloudinary` (`e2e/fixtures/cloudinary.ts`); the test creates and deletes its own `smoke-<id>` deck

**Checkpoint**: covers can be set and are stored, checked, logged and kept by the sweep

---

## Phase 4: User Story 2 — See cover images in card lists (P1)

**Goal**: the bar below the title in every list (All, Favorites, category, search, Archived, Review) and on the card page

**Independent Test**: a deck with one card with a cover and one without; the list shows the bar only on the first

- [ ] T022 [US2] `apps/web/src/cards/Card.tsx`: `<CoverBar>` between the header and the body when `item.cover` is set; markup unchanged without one (SC-004). `apps/web/src/cards/CardBody.tsx`, `EventCard.tsx`, `LinkCard.tsx`: an event with a cover passes `showImage={false}` so the link box renders without its preview image (D411). [unit] `apps/web/src/cards/Card.test.tsx` (snapshot of a card without a cover unchanged; bar present with one) and `apps/web/src/cards/EventCard.test.tsx` (link image hidden with a cover, shown without)
- [ ] T023 [P] [US2] `apps/web/src/review/ReviewCard.tsx`: `<CoverBar>` below its title. [unit] extend `ReviewCard` test if one exists, else cover it in T024

**Checkpoint**: lists, card page, review queue and editor preview show covers

---

## Phase 5: User Story 3 — See cover images in Browse (P1)

**Goal**: the cover below the title on the browse card and in the full view, without a jump

**Independent Test**: open Browse on the US2 deck and swipe between the two cards

- [ ] T024 [US3] `apps/web/src/browse/BrowsePage.tsx`, `FullView.tsx`: both render through `Card`, so the cover comes from T022; pass eager loading for the current card's `CoverBar` (lazy for the others). No other change unless the bar overflows the browse layout (`apps/web/src/browse/browse.css`)

**Checkpoint**: all three stories work

---

## Phase 6: Share preview (FR-010, D413)

**Goal**: a public card's share preview shows its content with the cover (or else the link/event snapshot); private previews stay generic

- [ ] T025 [unit] `apps/api/src/share/share.service.test.ts` and `content-hash.test.ts`: order = media photo → file preview → generated card with visual `cover ?? link/event snapshot` → visual alone (`c_fill,g_auto,w_1200,h_630,f_jpg/<publicId>`) when rendering fails → `/og/private.png`; a cover beats the snapshot; the hash changes with the visual's `publicId`; private mode has nothing from the card
- [ ] T026 `apps/api/src/share/share.service.ts` `imageFor` + `generatedImageUrl`, `apps/api/src/share/og-template.ts` (`ogCardTree` reserves one right-hand panel when there is a visual), `content-hash.ts` (visual `publicId` in the hash): the visual is composited at delivery by a Cloudinary layer into that panel (`store.deliveryUrl` with an overlay transformation); private mode untouched
- [ ] T027 [int] `apps/api/test/share.int.test.ts`: a public card with a cover answers an `og:image` that references the cover; a private card with a cover answers the generic image and text

---

## Phase 7: Full e2e

- [ ] T028 [e2e:full] `e2e/tests/full/cover.spec.ts` (NEW, `@full`): replace and remove; a failed upload keeps the old cover and Save works; draft restore keeps the cover; the type-switch warning drops it; no "Add image" on link and media; Browse and full view (bounding box unchanged after load); review queue: add to a proposal created through the API fixture → publish; drag and drop onto the field; paste on an event card with the cover field focused (and elsewhere goes to the link photo); an event with a link and a cover shows one image; a broken image leaves the card without the bar

---

## Phase 8: Close-out

- [ ] T029 `pnpm lint && pnpm format:check && pnpm typecheck && pnpm test:unit && pnpm test:int` and `pnpm build:web && pnpm budget` (main chunk ≤ 150 KB gzip; `CoverField` and `use-drop-image` only in the editor chunk)
- [ ] T030 e2e: `@smoke` editor journey passes; `pnpm test:e2e --grep @full cover` passes
- [ ] T031 [P] Docs: `docs/design/card-media.md` cover section (bar via `CloudImage`, supersedes the event link image, sweep reference, runbook thresholds `other_deck` > 5/h, `unsupported_type` > 20/h) + Deviations from implementation-notes.md; `docs/design/web-pwa.md` share preview (public visual, private rule); `card-editor.md` (CoverField, drag and drop, event paste rule); `activity-log.md` (`cover`); `data-model.md` (column)
- [ ] T032 [P] `docs/adr.md` ADR-078 (cover as its own column, D406/D407); `docs/architecture.md` one index row; `CLAUDE.md` "Media" bullet: covers are image references checked like media cards (D160) and counted by the sweep; `CHANGELOG.md` feature line (no env change); `PLAN.md` link stays, demo unticked
- [ ] T033 Run quickstart.md validation (automated part)
- [ ] T034 `/speckit-converge` until Converged, then `/ponytail:ponytail-review`

---

## Dependencies & Execution Order

- Setup (T001) → Foundational (T002–T008) → US1 → US2 → US3 → Share → Full e2e → Close-out
- T003 depends on T002; T004 on T002; T006 on T003+T004; T008 after T006
- US1: T013 → T014; T015 independent; T016 → T019 → T020; T017, T018 before T019; T021 after T020 and T022 (the smoke checks the list)
- US2 T022 depends on T007; US3 T024 on T022
- T026 after T025; T028 after all stories

### Parallel opportunities

- T002 ∥ T007 (different packages)
- T009 ∥ T010 ∥ T011 ∥ T012; T017 ∥ T018
- T031 ∥ T032

## Implementation strategy

MVP = Phases 1–4 (set a cover and see it in lists). US3 is a small follow-on through `Card`; the share preview is the largest independent piece and can land last.

## Notes

- Log decisions the plan didn't make, and deviations, in `implementation-notes.md`
- Commit after each task or logical group (conventional commits)
