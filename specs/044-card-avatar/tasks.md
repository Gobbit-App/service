---

description: "Task list for 044 card cover image"
---

# Tasks: Card cover image

**Input**: Design documents from `/specs/044-card-avatar/`

**Prerequisites**: plan.md, spec.md, research.md (D386–D395), data-model.md, contracts/items-cover.md, quickstart.md

**Tests**: REQUIRED (constitution V). Every task that adds logic has a matching test task; every row of the
plan's traceability table maps to a test task below.

**Naming**: the code calls it `cover` everywhere (column, DTO, draft, components); the folder keeps `avatar`.
The activity-log field name is `cover` (plan D390), shown in the web as "image". Where data-model.md says
`changes ∋ 'cover image'`, the plan's `cover` wins. The index is `items_cover_public_id_idx`.

## Format: `[ID] [P?] [Story] [Tier?] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: US1 (add/replace/remove in the editor), US2 (lists), US3 (Browse)
- **[Tier]**: `[unit]`, `[int]`, `[e2e:smoke]`, `[e2e:full]`

---

## Phase 1: Foundational (Blocking Prerequisites)

**Purpose**: column, shared types and schemas, read path and the shared render primitive. After this phase
a cover set directly in the DB (factory) is returned by the API and rendered by `Card`.

### Database

- [ ] T001 Drizzle schema in packages/db/src/schema/items.ts: `cover: jsonb().$type<CardCover | null>()` (nullable, no default); CHECK `items_cover_chk` = `cover IS NULL OR (type::text IN ('text','reminder','event','table','calc') AND jsonb_typeof(cover) = 'object' AND jsonb_typeof(cover->'publicId') = 'string' AND char_length(cover->>'publicId') BETWEEN 1 AND 255 AND (NOT cover ? 'width' OR jsonb_typeof(cover->'width') = 'number') AND (NOT cover ? 'height' OR jsonb_typeof(cover->'height') = 'number'))` (use `type::text` like `items_reveal_at_chk`); partial btree index `items_cover_public_id_idx` on `((cover->>'publicId')) WHERE cover IS NOT NULL` (mirror `items_link_preview_public_id_idx`). Import `CardCover` from `@gobbit/shared/card-cover` (T004) — data-model.md § Migration
- [ ] T002 `pnpm db:generate` → packages/db/migrations/0025_card_cover.sql (rename the generated file/journal tag to `0025_card_cover`; no backfill) + hand-written packages/db/migrations/down/0025_card_cover.down.sql dropping the index, the CHECK and the column (in that order)
- [ ] T003 [P] [int] packages/db/test/invariants.int.test.ts (or the file holding the existing items CHECK cases): `items_cover_chk` accepts `null` and `{publicId}` / `{publicId,width,height}` on text, reminder, event, table, calc; rejects any cover on `link` and `image`, a non-object, a missing/non-string/empty/256-char `publicId`, a string `width`. packages/db/test/migrations.int.test.ts: 0025 up → down → up round trip leaves no `cover` column/CHECK/index after down

### Shared (`@gobbit/shared`)

- [ ] T004 [P] New zod-free subpath packages/shared/src/card-cover/index.ts: `export const coverItemTypes = ['text','reminder','event','table','calc'] as const satisfies readonly ItemType[]`, `supportsCover(type: ItemType): boolean`, `export type CardCover = { publicId: string; width?: number; height?: number }`; add `"./card-cover": "./src/card-cover/index.ts"` to packages/shared/package.json `exports` (no zod import — web bundle rule)
- [ ] T005 [P] [unit] packages/shared/src/card-cover/index.test.ts: `supportsCover` true for exactly text, reminder, event, table, calc and false for link, image; every `ItemType` is either in `coverItemTypes` or explicitly listed as excluded (so a new type must opt in or out, D387)
- [ ] T006 packages/shared/src/schemas/item.ts: `cardCoverSchema` (output) `{ publicId: string, width?: int, height?: int }`; `coverInputSchema = z.object({ publicId: z.string().min(1).max(255) }).strict()` (dimensions refused on input, D388); `itemSchema.cover: cardCoverSchema.nullable()`; create variants gain `cover: coverInputSchema.optional()` on the shared base (type support is checked in the service, not here); `itemPatchSchema.cover: coverInputSchema.nullable().optional()`. Type-check that `z.infer<typeof cardCoverSchema>` matches `CardCover`
- [ ] T007 [unit] packages/shared/src/schemas/item.test.ts: create/patch accept `{publicId}`; patch accepts `null` and absent; refuse `width`/`height`/unknown keys (strict), empty and 256-char `publicId`; `itemSchema` parses `cover: null` and `{publicId,width,height}`
- [ ] T008 [P] packages/shared/src/events/constants.ts: `itemEventFields` gains `'cover'` (D390)

### API read path

- [ ] T009 apps/api/src/lib/mappers.ts `toItemDto`: return `cover` (`null` when unset; omit `width`/`height` when the stored cover lacks them). Confirm `itemColumns` already selects the new column (no read-query change). Verify apps/api/src/services/public-dtos.ts `toPublicItem` is untouched (allow-list) — D394
- [ ] T010 [int] apps/api/test/items-cover.int.test.ts (NEW): a text card whose `cover` is set through the DB factory is returned with `cover` by `GET /items/{id}`, `GET /decks/{id}/items`, member search and the review queue; a card without one returns `cover: null`. apps/api/test/public-read.int.test.ts + public-search.int.test.ts: a public card with a cover has no `cover` key in `/public/{slug}` items or public search results (D394)
- [ ] T011 `pnpm api:openapi` (regenerate packages/api-client for the DTO, create and patch changes); commit the generated diff

### Web render primitive

- [ ] T012 [P] [unit] apps/web/src/cards/CoverBar.test.tsx (NEW): renders nothing when `cover` is null/undefined; renders a `CloudImage` with `alt=""`, the cover's `publicId`, `width`/`height` and class `card__cover`; renders nothing after the image fires `error`; forwards the loading hint (`loading="eager"` / priority) when given
- [ ] T013 apps/web/src/cards/CoverBar.tsx (NEW): `CoverBar({ cover, image? })` → `CloudImage` with `alt=""`, stored dimensions, class `card__cover`, the same loading-hint prop shape `Card` already passes to image cards; local `failed` state → `null` on `onError` (as `LinkCard` does for its preview). Import `CardCover` as a type from `@gobbit/shared/card-cover`. No new URL builder; stored images render only through `CloudImage` (D161, D391)
- [ ] T014 [P] apps/web/src/styles.css: `.card__cover` shares the `.link-card__image--stored` rule (16:9 `aspect-ratio`, `object-fit: cover`, full card width, `--radius` corners) — extend that selector list rather than copying values; the bar never widens the card (`max-width: 100%`)
- [ ] T015 [unit] apps/web/src/cards/Card.test.tsx: a card with `cover` renders the bar after `header.card__header` and before the body; a card without `cover` renders markup identical to before (snapshot taken on main before T016 — SC-004)
- [ ] T016 apps/web/src/cards/Card.tsx: render `<CoverBar cover={item.cover} image={…same hints as image cards…} />` between `header.card__header` and `CardBody` only when `item.cover` is set (no wrapper element when unset)

**Checkpoint**: covers set in the DB show as a bar in deck lists and on the card page; nothing else changed.

---

## Phase 2: User Story 1 — Add, replace or remove a card's cover image (P1) 🎯 MVP

**Goal**: editors set, replace and remove a cover from the card editor (pick, drop, paste); the API validates,
copies dimensions from the asset, logs it, and the sweep respects it.

**Independent Test**: create a text card, add a cover, save; reopen, replace, save; reopen, remove, save. The
card page shows the expected state each time; the deck Activity shows `updated` lines naming "image".

### Tests for User Story 1

> Write these first and make sure they FAIL before implementation.

- [ ] T017 [P] [US1] [unit] apps/api/src/services/image-reference.test.ts: `createCoverReference(assets)` returns `{ publicId, width, height }` from the asset row for an asset of the same deck; omits dims the asset lacks; fails with field `cover.publicId` "Unknown image" for an unknown id and for an asset of another deck (same message), exposing a distinguishable reason (`unknown_image` / `other_deck`) for the decision log
- [ ] T018 [P] [US1] [unit] apps/api/src/events/diff-fields.test.ts: `diffFields` reports `cover` for add (null → set), replace (publicId change), remove (set → null); nothing when the `publicId` is equal (even if width/height differ)
- [ ] T019 [P] [US1] [int] apps/api/test/items-cover.int.test.ts: create with `cover` → 201 with `width`/`height` copied from the asset; PATCH set / replace / `null` remove / absent unchanged; 422 `cover` "This card type has no cover image" for link and image (create and PATCH); 422 `cover.publicId` "Unknown image" for unknown id and other-deck asset; 422 `cover` for client `width`; reader/non-member → same 403/404 as other item edits (FR-002); `item_events` gets one `updated` row with `changes` ∋ `cover` on add, replace and remove and none on a no-op PATCH; refusals emit the `item.cover` decision log (`refused` · `unsupported_type` / `unknown_image` / `other_deck`, warn on `other_deck`) with requestId, deckId, itemId (PATCH), actorId; a publisher can PATCH a cover onto a proposal and publish it; an ingestion proposal (`jobs/ingest` path via existing fixture) and a bulk import item have `cover = null` (D394)
- [ ] T020 [P] [US1] [int] apps/api/test/media-sweep.int.test.ts: an asset referenced only by a cover is kept past the grace period for a live, archived and soft-deleted card; it becomes unreferenced (swept after grace) once the cover is removed and once the card is purged
- [ ] T021 [P] [US1] [unit] apps/web/src/editor/use-drop-image.test.ts: hook on an element calls `onImage` with the first `image/*` file of a drop, ignores drops without images, calls `preventDefault` on `dragover` carrying files, exposes `dragging` true between dragenter/dragover and drop/dragleave
- [ ] T022 [P] [US1] [unit] apps/web/src/editor/use-paste-image.test.ts: with `scope` set, a paste whose target is inside the scope element is taken (capture phase) and marked handled; a paste outside the scope is ignored by the scoped hook and still taken by an unscoped hook (event-card rule, D392); without `scope` behaviour is unchanged
- [ ] T023 [P] [US1] [unit] apps/web/src/editor/draft.test.ts: `Draft.cover` round-trips through the drafts store; a stored draft without `cover` reads as `undefined` (unchanged); `toCreateBody` sends `cover: {publicId}` only when set; `toPatch` sends `cover` only when the publicId differs from the item (`null` = remove); `withType` keeps `cover` between text/reminder/event/table/calc and clears it for link and image; `payloadHasContent` (payload-content.ts) treats a set cover as content
- [ ] T024 [P] [US1] [unit] apps/web/src/editor/fields/CoverField.test.tsx: "Add image" with no cover; "Replace" and "Remove" when set; preview via `CoverBar`; a successful upload sets `draft.cover` to the recorded `{publicId,width,height}`; a failed upload shows the photo-upload error copy and keeps the previous cover (or none); Remove sets `null`; drop and paste both call the same pick path; on an event card paste only applies while focus is inside the field
- [ ] T025 [P] [US1] [unit] apps/web/src/events/event-copy.test.ts (or existing copy test): `cover` field label is "image"
- [ ] T026 [P] [US1] [e2e:smoke] e2e/tests/smoke/editor.spec.ts: "add a cover image to a text card → bar in the deck list" — create card in the test's `smoke-<id>` deck, Edit → Add image (pick a fixture file, Cloudinary faked only via `routeFakeCloudinary` in e2e/fixtures/cloudinary.ts) → Save → the deck list card shows `.card__cover` between title and body; negative: a link card's editor has no "Add image"
- [ ] T027 [P] [US1] [e2e:full] e2e/tests/full/cover.spec.ts (NEW, `@full`): replace then remove; failed upload (fake Cloudinary returns error) keeps old cover and Save still works for a title change; draft restore after reload keeps the cover; type switch to Link on a new card warns the image will be removed and drops it, switch to Table keeps it; no "Add image" on link and photo cards; drag-and-drop a file onto the field sets the cover; on an event card paste with the cover field focused sets the cover and with focus elsewhere goes to the link photo; review queue: add a cover to a proposal created through the API fixture → publish → bar in the list

### Implementation for User Story 1 — API

- [ ] T028 [US1] apps/api/src/services/image-reference.ts: `createCoverReference(assets)` next to `createImageReference`, using `assets.byPublicId`; returns `CardCover` with dims from the asset or a typed failure (`unknown_image` | `other_deck`) mapped to 422 `cover.publicId` "Unknown image". Wire it in apps/api/src/services/media-wiring.ts and the services index alongside `createImageReference`
- [ ] T029 [P] [US1] apps/api/src/services/item-cover.events.ts (NEW): `item.cover` decision log helper (`event`, `outcome: 'refused'`, `reason: 'unsupported_type' | 'unknown_image' | 'other_deck'`, requestId, deckId, itemId?, actorId; level info, warn for `other_deck`) following docs/design/api-conventions.md#decision-events and an existing `*.events.ts` file
- [ ] T030 [US1] apps/api/src/services/items.service.ts: on `create` and `update`, when `cover` is present (non-null): refuse with 422 `cover` "This card type has no cover image" if `!supportsCover(type)`; else resolve via `createCoverReference` (422 `cover.publicId` on failure); log refusals via T029; `null` on PATCH removes; absent leaves unchanged. Pass the resolved cover into the repository and include it in `itemFields()` so `diffFields`/`eventFrom` log `cover` (ADR-057)
- [ ] T031 [P] [US1] apps/api/src/events/diff-fields.ts: `ItemFields` carries `cover`; compare `cover?.publicId ?? null`
- [ ] T032 [US1] apps/api/src/repositories/items.repo.ts: write `cover` on insert and update (only when provided on update)
- [ ] T033 [P] [US1] apps/api/src/repositories/assets.repo.ts `unreferenced`: add `OR i.cover->>'publicId' = assets.public_id` to the reference predicate covering items of every status (soft-deleted included), so both the candidate query and the delete-time re-check see it (D389)
- [ ] T034 [US1] `pnpm api:openapi` if T030 changed any route schema; confirm no drift

### Implementation for User Story 1 — Web editor

- [ ] T035 [P] [US1] apps/web/src/editor/use-drop-image.ts (NEW): `useDropImage(ref, onImage)` with native `dragenter`/`dragover`/`dragleave`/`drop`, first `image/*` file, returns `{ dragging }`
- [ ] T036 [P] [US1] apps/web/src/editor/use-paste-image.ts: optional `scope` element option; when set, listen in the capture phase and only take pastes whose target is inside `scope` (mark handled so `pastedImage` in other handlers ignores it); default unchanged
- [ ] T037 [US1] apps/web/src/editor/draft.ts (+ drafts-store.ts if it whitelists keys): `Draft.cover: CardCover | null | undefined`; `toCreateBody`, `toPatch`, `withType` per T023; drafts store stays `v: 1`. apps/web/src/editor/composer/payload-content.ts: a set cover counts as content; apps/web/src/editor/composer/SwitchTypeConfirm.tsx copy says the image will be removed when switching to link/image with a cover
- [ ] T038 [US1] apps/web/src/editor/fields/CoverField.tsx (NEW, lazy editor chunk): reuse `useImageUpload`, `checkImageFile` and `PickButton` from ImageFields.tsx/LinkPhoto.tsx (same limits, progress, error copy); preview via `CoverBar`; "Add image" / "Replace" / "Remove" through `ui/buttons` with `ui/icons` (ADR-059); drop target via `useDropImage` with a drop highlight class; paste via `usePasteImage` — page-wide unless `scope` is passed (events). Failed upload never touches `draft.cover`
- [ ] T039 [US1] apps/web/src/editor/CardEditor.tsx: render `CoverField` above the type fields when `supportsCover(draft.type)` (import from `@gobbit/shared/card-cover`); pass `scope` = the field element for `event` so `LinkPhoto` keeps other pastes
- [ ] T040 [P] [US1] apps/web/src/events/event-copy.ts: label `cover` → "image"

**Checkpoint**: US1 independent test passes; smoke T026 green.

---

## Phase 3: User Story 2 — See cover images in card lists (P1)

**Goal**: the bar shows in every list (All, Favorites, category, search, Archived, Review); on events it
supersedes the link's preview image.

**Independent Test**: a deck with one card with a cover and one without; the list shows the bar only on the first.

### Tests for User Story 2

- [ ] T041 [P] [US2] [unit] apps/web/src/cards/EventCard.test.tsx: an event with a link preview and a cover renders the link box without its image (title, domain, button kept); without a cover the link image renders as today
- [ ] T042 [P] [US2] [unit] apps/web/src/review/ReviewCard.test.tsx (create if missing): the bar renders below the title when `cover` is set, nothing extra otherwise
- [ ] T043 [P] [US2] [e2e:full] e2e/tests/full/cover.spec.ts: event with a link and a cover shows exactly one image (the cover bar); a card whose cover image 404s (fake Cloudinary) renders without `.card__cover`; list at 360 px: the bar's bounding box is reserved before load (same height before and after load)

### Implementation for User Story 2

- [ ] T044 [US2] apps/web/src/cards/CardBody.tsx + EventCard.tsx + LinkCard.tsx: thread `showImage={false}` to `LinkCard` for an event when `item.cover` is set (LinkCard may already accept a flag — reuse it)
- [ ] T045 [US2] apps/web/src/review/ReviewCard.tsx: render `CoverBar` below its title

**Checkpoint**: lists, search results and the review queue show covers; events show one image.

---

## Phase 4: User Story 3 — See cover images in Browse (P1)

**Goal**: the current browse card and the full view show the cover below the title without a jump.

**Independent Test**: open Browse on the US2 deck and swipe between the two cards; open the full view.

- [ ] T046 [P] [US3] [unit] apps/web/src/browse/BrowsePage.test.tsx / FullView.test.tsx (existing or new): the current card passes the eager loading hint so its `CoverBar` image is eager; the full view renders the bar below the title
- [ ] T047 [P] [US3] [e2e:full] e2e/tests/full/cover.spec.ts: Browse — swipe from a card without a cover to one with; the cover is visible below the title and the card's bounding box doesn't change after the image loads; full view shows the bar
- [ ] T048 [US3] apps/web/src/browse/BrowsePage.tsx, FullView.tsx (+ browse/browse.css if the bar needs browse sizing): make sure both render through `Card` with the image loading hints so `CoverBar` gets them; adjust only if they bypass `Card`'s header/body slot

**Checkpoint**: all three stories work independently.

---

## Phase 5: Share preview (FR-010, D393) — cross-cutting

**Purpose**: public shares show the generated card with the cover (or the link/event snapshot) composited at
delivery; private shares stay generic.

- [ ] T049 [P] [unit] apps/api/src/share/share.service.test.ts: public mode order — image card picture; else generated card with visual = cover ?? link/event `preview.publicId` snapshot ?? none; a cover beats a snapshot; delivery URL contains `l_<publicId with / → :>,c_fill,g_auto,w_420,h_630/fl_layer_apply,g_east`; render failure → `c_fill,g_auto,w_1200,h_630,f_jpg/<publicId>` of the visual, else `/og/private.png`; `ogContentHash` changes when the visual's publicId changes; private mode output is byte-identical to before (no cover, title or image from the card). apps/api/src/share/og-template.test.ts (existing or new): `ogCardTree({ hasVisual: true })` narrows the text column and leaves the right-hand panel empty
- [ ] T050 [P] [int] apps/api/test/share.int.test.ts: `/s/{id}` of a public card with a cover has an `og:image` with the cover layer; of a private-deck card with a cover returns the generic private meta
- [ ] T051 apps/api/src/share/og-template.ts: `ogCardTree` gains `hasVisual: boolean` (narrow text column + empty right panel); `OgContent` gains `visualPublicId` and `ogContentHash` includes it
- [ ] T052 apps/api/src/share/share.service.ts `imageFor`: public mode picks `item.cover?.publicId ?? preview snapshot publicId`, renders with `hasVisual`, builds the layered delivery URL, and the visual-only fallback on render failure (D61 timeout path unchanged); private mode untouched

---

## Phase 6: Close-out

**Purpose**: Keep the repository's docs and gates true

- [ ] T053 `pnpm lint && pnpm format:check && pnpm typecheck && pnpm test:unit && pnpm test:int` + `pnpm budget` (CoverBar in main chunk; CoverField/use-drop-image only in the lazy editor chunk)
- [ ] T054 e2e: `@smoke` editor spec passes (CI `e2e` job); `pnpm test:e2e --grep @full` passes for e2e/tests/full/cover.spec.ts
- [ ] T055 [P] docs/design/card-media.md: cover image section (column, D160-style reference, bar through `CloudImage`, supersedes the event link image, sweep reference, runbook thresholds `other_deck` > 5/h, `unsupported_type` > 20/h) + "Deviations from the plan" list from implementation-notes.md; docs/design/web-pwa.md share-preview section (public visual = cover ?? snapshot, private rule); docs/design/card-editor.md (CoverField, drag and drop, event paste rule; follow-up: reuse `use-drop-image` for photo/link-photo fields); docs/design/activity-log.md (`cover`); docs/design/data-model.md (column + CHECK + index)
- [ ] T056 [P] docs/adr.md: ADR-077 "Card-level attributes that aren't content live in columns, not payload" (from D386/D387); docs/architecture.md: one ADR index row + at most one line in the media summary (keep < 250 lines)
- [ ] T057 [P] CLAUDE.md "Media" bullet: covers (`items.cover`) are image references checked like image cards (D160) and counted by the media sweep; CHANGELOG.md feature line (no env change)
- [ ] T058 PLAN.md: link `specs/044-card-avatar` under Usability pass; README.md unchanged unless commands/env changed
- [ ] T059 Run quickstart.md validation (automated section; manual steps noted as pending deploy in implementation-notes.md)
- [ ] T060 `/speckit-converge` until it reports Converged

---

## Dependencies & Execution Order

- **Phase 1 (Foundational)**: T001 → T002 → T003; T004 before T001/T006 (type import); T006 → T007, T009 → T010 → T011; T012 → T013 → T015 → T016 (T014 any time). Blocks all stories.
- **US1 (Phase 2)**: needs Phase 1. API (T028–T033) before web editor e2e (T026/T027). T035/T036 before T038; T037 before T038; T038 before T039.
- **US2 (Phase 3)**: needs Phase 1 only (covers can be seeded through the API/factory); its e2e T043 uses the US1 write path or API fixtures.
- **US3 (Phase 4)**: needs Phase 1; e2e T047 like T043.
- **Share (Phase 5)**: needs Phase 1 (DTO/column); independent of the web stories.
- **Close-out**: after all phases.

### Within each phase

- Tests written and FAILING before implementation
- Schema → repository → service → `api:openapi` → web

### Parallel opportunities

- Phase 1: T004/T008/T014 in parallel; T003 alongside T006–T007.
- US1 tests T017–T025 in parallel (different files); T026 and T027 in parallel; T029/T031/T033 and T035/T036/T040 in parallel.
- US2 T041/T042 in parallel; US3 T046; Share T049/T050 in parallel.
- Docs T055–T057 in parallel.

## Implementation Strategy

- **MVP**: Phase 1 + US1 — a member can add, replace and remove a cover, it shows on the card page and in
  deck lists (via `Card`), smoke e2e green.
- Then US2 (review queue, event supersede), US3 (Browse), Share preview, close-out. One PR for the feature
  unless it grows past a reviewable size; then split API (Phase 1 API + US1 API + Share) from web.

## Notes

- [P] tasks = different files, no dependencies (T019/T027/T043/T047 share files: run them sequentially)
- Log decisions the plan did not make, and deviations, in specs/044-card-avatar/implementation-notes.md
- Commit after each task or logical group (conventional commits, e.g. `feat(api): …`, `feat(web): …`)
