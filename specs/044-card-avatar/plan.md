# Implementation Plan: Card cover image

**Branch**: `044-card-avatar-plan` (plan); implementation `feat/044-card-avatar` | **Date**: 2026-11-11 | **Spec**: [spec.md](spec.md) | **Roadmap**: `PLAN.md` § Usability pass

**Input**: Feature specification from `/specs/044-card-avatar/spec.md`

## Summary

Text, reminder, event, table and calc cards get an optional cover image: a visual that represents
the card's content, shown as a bar below the title like a link's preview, so text-based cards are
easy to spot in lists and Browse (clarified 2026-11-12). The code calls it `cover`; the folder keeps
its original `avatar` name.

**Storage.** The cover image is its own nullable `items.cover` jsonb column (`{ publicId, width?,
height? }`), not a payload key (D386, ADR-077). That keeps it out of search text, embeddings, Ask,
public DTOs and ingestion without any stripping code.

**Rules.** A shared `coverItemTypes` list and a DB CHECK say which types may carry one (D387). The
D160 asset check is extended: the image must be recorded for the card's deck, and its dimensions come
from the asset (D388). The media sweep counts cover images as references (D389). Adding, replacing or
removing a cover image logs `cover` in the activity log (D390).

**Web.** A thin `CoverBar` renders the image through `CloudImage` between the title and the body,
in the link preview's 16:9 shape, in `Card` and `ReviewCard`. On an event it supersedes the link's
preview image (D391). The editor gains one `CoverField` that takes a picked, dropped or pasted image
through the photo upload hook, and a top-level `Draft.cover` that survives draft restore and type
switches (D392).

**Sharing.** Non-public shares stay generic, with nothing from the card (D58/D59). A public card's
preview is the generated card with a visual that Cloudinary composites at delivery. The visual is
the member-set cover, or else the automatic link/event preview snapshot, so a member-set cover
supersedes anything gathered automatically (D393, clarified 2026-11-11).

## Starting point

main @ `d3c2844` (Ask behind `ASK_ENABLED`). The latest migration is `0024_card_body_2000`, and the
feature is not deployed.

It builds on:

- `specs/012-media-assets` and `013-cloud-image` (assets, D156–D161, ADR-054);
- `specs/020-item-events` (activity log, ADR-057);
- `specs/041-share-visuals` (share preview builder, D58–D61, D177);
- `specs/042-events` and `043-deck-header` (the current card header).

Code to read:

- **API**:
  - `packages/db/src/schema/items.ts`;
  - `apps/api/src/services/image-reference.ts`, `items.service.ts` (`referencedPayload`, `create`,
    `update`, `patchEvents`);
  - `repositories/assets.repo.ts` (`unreferenced`);
  - `events/diff-fields.ts`;
  - `lib/mappers.ts` (`toItemDto`), `services/public-dtos.ts`;
  - `share/share.service.ts` (`imageFor`), `share/og-template.ts` (`ogCardTree` visual slot).
- **Shared**: `packages/shared/src/schemas/item.ts`, `events/constants.ts`, `package.json` exports
  (new subpath).
- **Web**:
  - `apps/web/src/cards/Card.tsx`, `cloudinary.ts`, `CloudImage.tsx`;
  - `review/ReviewCard.tsx`, `browse/BrowsePage.tsx`, `browse/FullView.tsx`;
  - `editor/draft.ts`, `drafts-store.ts`, `CardEditor.tsx`;
  - `editor/fields/ImageFields.tsx`, `LinkPhoto.tsx`, `use-image-upload.ts`, `use-paste-image.ts`;
  - `editor/composer/payload-content.ts`, `SwitchTypeConfirm.tsx`;
  - `events/event-copy.ts`;
  - `cards/LinkCard.tsx`, `EventCard.tsx`, `CardBody.tsx`;
  - `styles.css` (`.link-card__image--stored`), `browse/browse.css`.
- **Tests**: `e2e/fixtures/cloudinary.ts`, `e2e/tests/smoke/editor.spec.ts` (image card upload).

## Technical Context

**Language/Version**: TypeScript (strict, ESM, no build step) on Node ≥ 22

**Primary Dependencies**: the existing stack, with no new dependency. `CloudImage` and the link
preview's CSS crop are reused; drag and drop uses the native DOM events.

**Storage**: PostgreSQL 17. Migration `0025_card_cover` adds:

- `items.cover jsonb NULL`;
- the CHECK `items_cover_chk` (allowed types and shape);
- the partial index `items_cover_public_id_idx`;
- a hand-written down file.

There is no backfill. See [data-model.md](data-model.md).

**Testing**:

- Vitest unit tests:
  - `supportsCover`, and `coverInputSchema` (strict, no dimensions);
  - `diffFields` with `cover`, and `createCoverReference`;
  - share `imageFor` order;
  - `CoverBar` (renders only when set, `alt=""`, nothing on error), and `EventCard` hiding the link
    image when a cover is set;
  - `CoverField` states (add, replace, remove, failed keeps previous) and its three inputs: pick,
    drop (`use-drop-image`) and paste, including the event focus rule (`usePasteImage` `scope`);
  - draft round-trip, and `withType` clearing for link and image.
- Integration tests (`items-cover.int.test.ts`, plus additions to the `media-sweep`, `public` and
  `share` int tests):
  - the CHECK, and the down-file round trip;
  - the three 422s;
  - dimensions copied from the asset;
  - the `item_events` `cover` row, and nothing for a no-op;
  - sweep keeps a referenced image (live, archived, soft-deleted) and frees it after removal or purge;
  - public DTOs and public search have no `cover`;
  - ingestion proposals and imports have `cover = null`.

**E2E tier**: smoke + full.

- **Smoke**: `e2e/tests/smoke/editor.spec.ts` gains "add a cover image to a text card → bar in the
  deck list". This edits a card and uploads a photo, and both are critical journeys
  (constitution V). Cloudinary is replaced only at the network edge by `routeFakeCloudinary`.
- **Full**: `e2e/tests/full/cover.spec.ts` covers:
  - replace and remove;
  - a failed upload keeps the old cover image and Save still works;
  - draft restore;
  - the type-switch warning;
  - no "Add image" on link and photo;
  - Browse and full view;
  - review queue: add to a proposal created through the API fixture → publish;
  - drag and drop onto the field, and paste on an event card with the cover field focused;
  - an event with a link and a cover shows one image (the cover);
  - a broken image leaves the card without the bar.

  These are variants and edge cases.

**Target Platform**: API container, PWA on Android Chrome and iOS Safari.

**Project Type**: pnpm monorepo: API + worker, PWA, shared packages

**Performance Goals**:

- No extra query on read paths: the column rides on `itemColumns`.
- Covers load like link previews: `CloudImage`'s measured `sizes` and `srcset`, lazy below the fold,
  eager for the current Browse card.
- The sweep's reference lookup uses the partial index.

**Constraints**:

- Body ≤ 2000 code points and payload ≤ 8192 bytes; the cover image is outside the payload and is bounded
  by its own CHECK.
- Web bundle ≤ 150 KB gzip: `CoverBar` is a few lines in the main chunk with `Card`, and
  `CoverField` and `use-drop-image` live in the lazy editor chunk.
- `@gobbit/shared/card-cover` is a zod-free subpath.
- Same origin.

**Scale/Scope**: family and community decks, with hundreds to low thousands of cards per deck. Most
cards have no cover image.

## Constitution Check

*Pre-design gate: passed. Re-checked after Phase 1 (data model, contracts): passed, no violations.*

| Principle | How this plan complies |
|-----------|-----------------------|
| I. Layered API | Routes only parse the new field. `items.service` applies the type rule and calls `createCoverReference`. SQL changes live only in `assets.repo` (sweep predicate) and the schema. Access is the existing `item.update` |
| II. One source of truth for contracts | `coverInputSchema`, `cardCoverSchema` and `coverItemTypes` live in `@gobbit/shared`. Run `pnpm api:openapi` (the item DTO, create and patch change) |
| III. Invariants live in the database | `items_cover_chk` enforces the allowed types and the shape. Migration + down file + round-trip test. The asset/deck match stays in the service, as for image cards (D160); see D386 for the rejected FK |
| IV. Private by default | The cover image shares the card's visibility (every member read path already filters). The `toPublicItem` allow-list excludes it. Private shares stay content-free (D393). Uploads use the existing signed per-deck path |
| V. Tests at the right tier | Unit + integration as listed. E2E: smoke (add on edit) + full (the rest). See the traceability table below |
| VI. Lean, offline-first web | Plain CSS, no new dependency. The cover image is in the persisted item cache, and its bytes are in the HTTP cache (D395). The editor part is lazy. Subpath import |
| VII. Simple, optional, deployable | No new service, env var or dependency. Without Cloudinary, cover images behave like photo uploads do today |
| VIII. Accountable by default | Writes → `item_events` (`cover`). Refusals → a new `item.cover` decision log. Clean-up → existing `media-sweep` events. See the Accountability table |

## Decisions this plan pins down

Full reasoning is in [research.md](research.md).

| ID | Decision | ADR? |
|----|----------|------|
| D386 | The cover image is a nullable `items.cover` jsonb column, not a payload key: outside search text, embeddings, public DTOs and ingestion | yes → ADR-077 |
| D387 | `coverItemTypes` (text, reminder, event, table, calc) + `items_cover_chk`; a type opts in by adding itself to both. An unsupported type is refused with 422 `cover` | no (part of ADR-077) |
| D388 | The client sends `{ publicId }` only. The asset must be recorded for the card's deck (D160 rule), and the dimensions are copied from it | no |
| D389 | The sweep's `unreferenced` predicate includes `cover->>'publicId'`, covering every status. Partial expression index | no |
| D390 | `itemEventFields` gains `cover`; the web labels it "image" | no |
| D391 | `CoverBar`: `CloudImage` in a 16:9 bar between title and body (the link snapshot's CSS), `alt=""`, nothing on error. In `Card` and `ReviewCard`. On events the cover supersedes the link's preview image. The CloudImage-only rule stays as it is | no |
| D392 | A top-level `Draft.cover`, and one `CoverField` above the type fields reusing `useImageUpload`, with pick, drag and drop (new `use-drop-image`) and paste. On events, paste goes to the cover while the field has focus, else to `LinkPhoto`. A type switch to link or image warns and clears | no |
| D393 | Share preview, **public mode**: image card picture → generated card + delivery-time overlay (one right-hand panel) of cover ?? link/event snapshot → that visual alone on render failure → private. **Private mode** unchanged and generic | no |
| D394 | Ingestion, import and public reads never set or see a cover image (by construction; tested) | no |
| D395 | Offline: the DTO comes from the persisted cache and the bytes from the HTTP cache; an unloaded cover is left out, as link previews are | no |

## Project Structure

### Documentation (this feature)

```text
specs/044-card-avatar/
├── spec.md
├── plan.md               # this file
├── research.md           # D386–D395
├── data-model.md
├── quickstart.md
├── contracts/items-cover.md
├── checklists/requirements.md
└── tasks.md              # /speckit-tasks (not yet)
```

### Source Code (repository root)

```text
packages/db/
├── src/schema/items.ts                       # cover column, items_cover_chk, items_cover_public_id_idx
└── migrations/0025_card_cover.sql (+ down/0025_card_cover.down.sql)

packages/shared/src/
├── card-cover/index.ts                      # NEW zod-free subpath: coverItemTypes, supportsCover, CardCover
├── schemas/item.ts                           # cardCoverSchema, coverInputSchema; item/create/patch
├── events/constants.ts                       # itemEventFields + 'cover'
└── package.json                              # exports "./card-cover"

apps/api/src/
├── services/image-reference.ts               # + createCoverReference
├── services/item-cover.events.ts            # NEW item.cover decision log
├── services/items.service.ts                 # type rule + reference on create/update; diff includes cover
├── services/media-wiring.ts / index.ts       # wire createCoverReference
├── repositories/items.repo.ts                # write cover on insert/update
├── repositories/assets.repo.ts               # unreferenced predicate + cover
├── events/diff-fields.ts                     # cover in ItemFields
├── lib/mappers.ts                            # toItemDto cover
├── share/share.service.ts                    # imageFor: visual (cover ?? snapshot) + overlay (public mode)
├── share/og-template.ts                     # ogCardTree reserves the visual's slot; hash includes it
└── test/items-cover.int.test.ts             # NEW

apps/web/src/
├── cards/CoverBar.tsx (+ .test.tsx)        # NEW
├── cards/Card.tsx                            # CoverBar between header and body when set
├── cards/CardBody.tsx, EventCard.tsx, LinkCard.tsx # showImage=false on an event with a cover
├── review/ReviewCard.tsx                     # CoverBar below its title
├── styles.css                                # .card__cover shares the link snapshot's 16:9 rule
├── editor/fields/CoverField.tsx (+ test)    # NEW: pick, drop, paste
├── editor/use-drop-image.ts (+ test)        # NEW: first image/* file dropped on an element
├── editor/use-paste-image.ts                 # + optional scope element (event cards)
├── editor/CardEditor.tsx                     # render CoverField for supportsCover(type)
├── editor/draft.ts                           # Draft.cover, toCreateBody/toPatch, withType
├── editor/composer/payload-content.ts        # cover counts as content for the switch warning
└── events/event-copy.ts                      # 'cover' → "image"

e2e/tests/smoke/editor.spec.ts                # + add cover journey
e2e/tests/full/cover.spec.ts                 # NEW
```

**Structure Decision**: every layer changes slightly. No route files change, because the field
travels on the existing item routes. The only new web components are `CoverBar` (main chunk) and
`CoverField` (editor chunk).

## Invariant → test traceability

| Invariant / rule (spec FR or D-number) | Enforced in | Test (file, tier) |
|----------------------------------------|-------------|-------------------|
| FR-001 / D387 only text, reminder, event, table, calc | DB CHECK + service 422 + editor hides the field | `items-cover.int.test.ts` (int); `CoverField.test.tsx` (unit); `full/cover.spec.ts` "no Add image on link/photo" |
| FR-002 only editors set it | `authorize(item.update)` | `items-cover.int.test.ts` reader → 404/403 as today (int) |
| FR-003 / D388 asset of the card's own deck; dims from the asset | `createCoverReference` | `image-reference.test.ts` (unit); `items-cover.int.test.ts` other deck → 422 (int) |
| FR-004 / D389 / SC-003 referenced image never swept | `assets.repo` `unreferenced` | `media-sweep` int test: live, archived, soft-deleted kept; removed or purged freed |
| FR-005 / FR-006 bar below the title in lists, Browse, card page, review; reserved box; left out on failure | `CoverBar`, `Card`, `ReviewCard` | `CoverBar.test.tsx` (unit); `smoke/editor.spec.ts`; `full/cover.spec.ts` Browse + review + broken image |
| FR-007 decorative | `alt=""` | `CoverBar.test.tsx` (unit) |
| FR-008 / D390 activity log | `diffFields` + `insertItemEvents` | `diff-fields.test.ts` (unit); `items-cover.int.test.ts` add, replace, remove, no-op (int) |
| FR-009 refused, never dropped; bounded | strict input schema + CHECK + service | `item.test.ts` schema (unit); `items-cover.int.test.ts` (int) |
| FR-010 / D391 / D393 cover supersedes the event's link image in the app; share preview: public = generated card + cover ?? snapshot; private = generic; none on public pages or search | `EventCard` `showImage`; `share.service` `imageFor`, `ogCardTree`, `ogContentHash`; `toPublicItem` allow-list | `EventCard.test.tsx` (unit); `share.service.test.ts` (order, cover beats snapshot, private has nothing from the card, hash changes with cover) (unit); `public` int test asserts no `cover` (int) |
| FR-011 / D394 ingestion and import never set one | no input path | `items-cover.int.test.ts` ingestion proposal + import → `cover` null (int) |
| Spec edge: type switch warns and drops | `withType`, `payloadHasContent` | `draft.test.ts` (unit); `full/cover.spec.ts` |
| Acceptance 1.2 / FR-002 pick, drop and paste; event paste goes to the focused field | `CoverField`, `use-drop-image`, `usePasteImage` `scope` | `CoverField.test.tsx`, `use-drop-image.test.ts`, `use-paste-image.test.ts` (unit); `full/cover.spec.ts` |
| Acceptance 1.6 failed upload keeps previous | `CoverField` | `CoverField.test.tsx` (unit); `full/cover.spec.ts` |
| Acceptance 1.7 draft keeps cover image | `drafts-store` | `draft.test.ts` (unit); `full/cover.spec.ts` |
| SC-004 no visual change without a cover image | `Card` markup unchanged when `cover` is null | `Card.test.tsx` snapshot of a card without a cover image (unit) |
| Migration reversible | down file | migration round-trip int test |

## Accountability

| Decision | Event / audit row | Outcomes · reasons | Fields (ids/hashes only) | Level | Watched | Alert threshold (default) | Test |
|----------|-------------------|--------------------|--------------------------|-------|---------|---------------------------|------|
| Cover image added, replaced or removed | `item_events` row (`updated`, `changes ∋ cover`) | — | itemId, deckId, actorId | audit | aggregate per day | none (expected) | `items-cover.int.test.ts` |
| Cover image write refused | `item.cover` log (new, `item-cover.events.ts`) | `refused` · `unsupported_type`, `unknown_image`, `other_deck` | requestId, deckId, itemId (on PATCH), actorId | info; warn on `other_deck` | aggregate by reason; instance for `other_deck` | `other_deck` > 5/h (a client bug or probing); `unsupported_type` > 20/h (the UI offering the field wrongly) | `items-cover.int.test.ts` |
| Cover image deleted after removal or purge | existing `media-sweep` events | existing | existing | existing | existing | existing | `media-sweep` int test (reference cases) |
| Share preview picks the cover image or the snapshot | none: the image is derived from the state of a card that is already public, with no choice about a person. Render failures keep their existing log (D61) | — | — | — | — | — | `share.service.test.ts` |
| Ingestion never sets a cover image | none: no code path makes this decision (D394) | — | — | — | — | — | `items-cover.int.test.ts` |

**Operator controls**: none new. Upload size and rate limits are the existing media ones, and the
cover image's display sizes are UI constants. The two alert thresholds above go in the
`docs/design/card-media.md` runbook section.

## Rollout

- **Migrations**: `0025_card_cover` is additive and reversible (the down file drops the index, CHECK
  and column). No backfill.
- **Env / config**: none, so there's no CHANGELOG blocker. Add a CHANGELOG feature line as usual.
- **API client**: `pnpm api:openapi` is needed (item DTO, create, patch).
- **Deploy order / flags**: the normal CI → Dokploy flow.
  - The API must ship before or with the web image. Old clients ignore `cover` (an unknown field
    in a DTO), and the new web only sends it after the API accepts it. Both ship in one deploy.
  - No flag is needed.
- **Docs**:
  - `docs/design/card-media.md`: cover image section (bar through `CloudImage`, supersedes the event
    link image), sweep reference, runbook thresholds.
  - `web-pwa.md` share-preview section: the public visual (cover image ?? snapshot) and the private rule.
  - `card-editor.md` (CoverField, drag and drop, the event paste rule), `activity-log.md` (`cover`) and `data-model.md`
    (column).
  - ADR-077 in `docs/adr.md`, plus one index row in `docs/architecture.md`.
  - `CLAUDE.md` "Media" bullet: covers are image references checked like image cards (D160) and
    counted by the sweep.
  - A `PLAN.md` line.

## Risks

| Risk | Likelihood / impact | Mitigation |
|------|---------------------|------------|
| The centre crop of a 16:9 bar misses the subject of a tall photo | M / L | The same crop link previews use today. A manual crop is out of scope (spec Assumptions); a later feature can add one |
| More Cloudinary derived images (the `CloudImage` widths per cover, plus the OG overlay) | L / L | Only cards with covers; the same quota family as photo cards |
| Two paste listeners on an event card | L / M | Rule D392: the cover listens in the capture phase, scoped to its field; `LinkPhoto` keeps every other paste; unit tests for both |
| Lists get taller (a 16:9 bar per card with a cover) | M / L | Intended: it is what makes cards easy to spot. Only cards with a cover grow, as link cards do today |
| The card jumps in Browse while the cover loads | M / M | `CloudImage`'s reserved 16:9 box; a full e2e checks the bounding box before and after load |
| A public card's `og:image` shows the cover image although the public page doesn't render it | L / L | Consistent with D177 (same image as `/s/`). Recorded in D393 |
| Public link/event previews change for cards without a cover image (the snapshot now appears in the generated card) | L / M | Intended per the 2026-11-11 clarification; the content hash re-renders on first share; covered by `share.service` unit tests |
| A layer `publicId` from another cloud or missing at Cloudinary | L / L | Cover images and snapshots both live in the one cloud behind `CLOUDINARY_URL`; a missing layer makes Cloudinary answer an error, which chat apps treat as no image, the same as a missing photo today |

## Settle before starting

Nothing open:

- The share-preview questions were settled by the 2026-11-11 clarification (D393).
- Purpose, placement and inputs were settled by the 2026-11-12 clarification (D391, D392). That
  removed the separate `CardAvatar` component and its rule amendment.

## Complexity Tracking

No constitution violations.
