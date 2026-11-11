# Implementation Plan: Card avatar

**Branch**: `044-card-avatar-plan` (plan); implementation `feat/044-card-avatar` | **Date**: 2026-11-11 | **Spec**: [spec.md](spec.md) | **Roadmap**: `PLAN.md` § Usability pass

**Input**: Feature specification from `/specs/044-card-avatar/spec.md`

## Summary

Text, reminder, event, table and calc cards get an optional round image beside their title.

**Storage.** The avatar is its own nullable `items.avatar` jsonb column (`{ publicId, width?,
height? }`), not a payload key (D386, ADR-077). That keeps it out of search text, embeddings, Ask,
public DTOs and ingestion without any stripping code.

**Rules.** A shared `avatarItemTypes` list and a DB CHECK say which types may carry one (D387). The
D160 asset check is extended: the image must be recorded for the card's deck, and its dimensions come
from the asset (D388). The media sweep counts avatars as references (D389). Adding, replacing or
removing an avatar logs `avatar` in the activity log (D390).

**Web.** One small `CardAvatar` component renders a face-aware square crop
(`c_fill,g_auto:faces`) in a fixed circle, in `Card`'s header and `ReviewCard`. It degrades to an
empty circle (D391). The editor gains one `AvatarField`, which reuses the photo upload hook, and a
top-level `Draft.avatar` that survives draft restore and type switches (D392).

**Sharing.** Non-public shares stay generic, with nothing from the card (D58/D59). A public card's
preview is the generated card with a visual that Cloudinary composites at delivery. The visual is
the member-set avatar, or else the automatic link/event preview snapshot, so a member-set avatar
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
  - `editor/fields/ImageFields.tsx`, `use-image-upload.ts`, `use-paste-image.ts`;
  - `editor/composer/payload-content.ts`, `SwitchTypeConfirm.tsx`;
  - `events/event-copy.ts`;
  - `styles.css` (`.card__header`), `browse/browse.css`.
- **Tests**: `e2e/fixtures/cloudinary.ts`, `e2e/tests/smoke/editor.spec.ts` (image card upload).

## Technical Context

**Language/Version**: TypeScript (strict, ESM, no build step) on Node ≥ 22

**Primary Dependencies**: the existing stack, with no new dependency. Cloudinary delivery transforms
(`c_fill,g_auto:faces`) replace any client-side cropping library.

**Storage**: PostgreSQL 17. Migration `0025_card_avatar` adds:

- `items.avatar jsonb NULL`;
- the CHECK `items_avatar_chk` (allowed types and shape);
- the partial index `items_avatar_public_id_idx`;
- a hand-written down file.

There is no backfill. See [data-model.md](data-model.md).

**Testing**:

- Vitest unit tests:
  - `supportsAvatar`, and `avatarInputSchema` (strict, no dimensions);
  - `diffFields` with `avatar`, and `createAvatarReference`;
  - share `imageFor` order;
  - `avatarUrl`, `CardAvatar` (box, `aria-hidden`, empty circle on error);
  - `AvatarField` states (add, replace, remove, failed keeps previous);
  - draft round-trip, and `withType` clearing for link and image.
- Integration tests (`items-avatar.int.test.ts`, plus additions to the `media-sweep`, `public` and
  `share` int tests):
  - the CHECK, and the down-file round trip;
  - the three 422s;
  - dimensions copied from the asset;
  - the `item_events` `avatar` row, and nothing for a no-op;
  - sweep keeps a referenced image (live, archived, soft-deleted) and frees it after removal or purge;
  - public DTOs and public search have no `avatar`;
  - ingestion proposals and imports have `avatar = null`.

**E2E tier**: smoke + full.

- **Smoke**: `e2e/tests/smoke/editor.spec.ts` gains "add an avatar to a text card → circle in the
  deck list". This edits a card and uploads a photo, and both are critical journeys
  (constitution V). Cloudinary is replaced only at the network edge by `routeFakeCloudinary`.
- **Full**: `e2e/tests/full/avatar.spec.ts` covers:
  - replace and remove;
  - a failed upload keeps the old avatar and Save still works;
  - draft restore;
  - the type-switch warning;
  - no "Add image" on link and photo;
  - Browse and full view;
  - review queue: add to a proposal created through the API fixture → publish;
  - a broken image shows the empty circle.

  These are variants and edge cases.

**Target Platform**: API container, PWA on Android Chrome and iOS Safari.

**Project Type**: pnpm monorepo: API + worker, PWA, shared packages

**Performance Goals**:

- No extra query on read paths: the column rides on `itemColumns`.
- Each avatar is 40 px (lists, card page) or 56 px (Browse) with a 1×/2×/3× `srcset`, so a list of 20
  avatars is a few KB.
- The sweep's reference lookup uses the partial index.

**Constraints**:

- Body ≤ 2000 code points and payload ≤ 8192 bytes; the avatar is outside the payload and is bounded
  by its own CHECK.
- Web bundle ≤ 150 KB gzip: `CardAvatar` is tiny and sits in the main chunk with `Card`, and
  `AvatarField` lives in the lazy editor chunk.
- `@gobbit/shared/card-avatar` is a zod-free subpath.
- Same origin.

**Scale/Scope**: family and community decks, with hundreds to low thousands of cards per deck. Most
cards have no avatar.

## Constitution Check

*Pre-design gate: passed. Re-checked after Phase 1 (data model, contracts): passed, no violations.*

| Principle | How this plan complies |
|-----------|-----------------------|
| I. Layered API | Routes only parse the new field. `items.service` applies the type rule and calls `createAvatarReference`. SQL changes live only in `assets.repo` (sweep predicate) and the schema. Access is the existing `item.update` |
| II. One source of truth for contracts | `avatarInputSchema`, `cardAvatarSchema` and `avatarItemTypes` live in `@gobbit/shared`. Run `pnpm api:openapi` (the item DTO, create and patch change) |
| III. Invariants live in the database | `items_avatar_chk` enforces the allowed types and the shape. Migration + down file + round-trip test. The asset/deck match stays in the service, as for image cards (D160); see D386 for the rejected FK |
| IV. Private by default | The avatar shares the card's visibility (every member read path already filters). The `toPublicItem` allow-list excludes it. Private shares stay content-free (D393). Uploads use the existing signed per-deck path |
| V. Tests at the right tier | Unit + integration as listed. E2E: smoke (add on edit) + full (the rest). See the traceability table below |
| VI. Lean, offline-first web | Plain CSS, no new dependency. The avatar is in the persisted item cache, and its bytes are in the HTTP cache (D395). The editor part is lazy. Subpath import |
| VII. Simple, optional, deployable | No new service, env var or dependency. Without Cloudinary, avatars behave like photo uploads do today |
| VIII. Accountable by default | Writes → `item_events` (`avatar`). Refusals → a new `item.avatar` decision log. Clean-up → existing `media-sweep` events. See the Accountability table |

## Decisions this plan pins down

Full reasoning is in [research.md](research.md).

| ID | Decision | ADR? |
|----|----------|------|
| D386 | The avatar is a nullable `items.avatar` jsonb column, not a payload key: outside search text, embeddings, public DTOs and ingestion | yes → ADR-077 |
| D387 | `avatarItemTypes` (text, reminder, event, table, calc) + `items_avatar_chk`; a type opts in by adding itself to both. An unsupported type is refused with 422 `avatar` | no (part of ADR-077) |
| D388 | The client sends `{ publicId }` only. The asset must be recorded for the card's deck (D160 rule), and the dimensions are copied from it | no |
| D389 | The sweep's `unreferenced` predicate includes `avatar->>'publicId'`, covering every status. Partial expression index | no |
| D390 | `itemEventFields` gains `avatar`; the web labels it "image" | no |
| D391 | `CardAvatar`: a fixed circle (40/56 px), `c_fill,g_auto:faces,ar_1:1`, `alt=""`, an empty circle on error. Rendered in `Card` and `ReviewCard`. Amends "stored images render only through `CloudImage`" to include `CardAvatar` | no |
| D392 | A top-level `Draft.avatar`, and one `AvatarField` above the type fields reusing `useImageUpload`. Paste goes to the avatar except on events. A type switch to link or image warns and clears | no |
| D393 | Share preview, **public mode**: image card picture → generated card + delivery-time overlay of avatar ?? link/event snapshot → that visual alone on render failure → private. **Private mode** unchanged and generic | no |
| D394 | Ingestion, import and public reads never set or see an avatar (by construction; tested) | no |
| D395 | Offline: the DTO comes from the persisted cache and the bytes from the HTTP cache; an unloaded avatar shows the empty circle | no |

## Project Structure

### Documentation (this feature)

```text
specs/044-card-avatar/
├── spec.md
├── plan.md               # this file
├── research.md           # D386–D395
├── data-model.md
├── quickstart.md
├── contracts/items-avatar.md
├── checklists/requirements.md
└── tasks.md              # /speckit-tasks (not yet)
```

### Source Code (repository root)

```text
packages/db/
├── src/schema/items.ts                       # avatar column, items_avatar_chk, items_avatar_public_id_idx
└── migrations/0025_card_avatar.sql (+ down/0025_card_avatar.down.sql)

packages/shared/src/
├── card-avatar/index.ts                      # NEW zod-free subpath: avatarItemTypes, supportsAvatar, CardAvatar
├── schemas/item.ts                           # cardAvatarSchema, avatarInputSchema; item/create/patch
├── events/constants.ts                       # itemEventFields + 'avatar'
└── package.json                              # exports "./card-avatar"

apps/api/src/
├── services/image-reference.ts               # + createAvatarReference
├── services/item-avatar.events.ts            # NEW item.avatar decision log
├── services/items.service.ts                 # type rule + reference on create/update; diff includes avatar
├── services/media-wiring.ts / index.ts       # wire createAvatarReference
├── repositories/items.repo.ts                # write avatar on insert/update
├── repositories/assets.repo.ts               # unreferenced predicate + avatar
├── events/diff-fields.ts                     # avatar in ItemFields
├── lib/mappers.ts                            # toItemDto avatar
├── share/share.service.ts                    # imageFor: visual (avatar ?? snapshot) + overlay (public mode)
├── share/og-template.ts                     # ogCardTree reserves the visual's slot; hash includes it
└── test/items-avatar.int.test.ts             # NEW

apps/web/src/
├── cards/CardAvatar.tsx (+ .test.tsx)        # NEW
├── cards/cloudinary.ts                       # + avatarUrl
├── cards/Card.tsx                            # header renders CardAvatar when set
├── review/ReviewCard.tsx                     # same
├── styles.css, browse/browse.css             # .card__header layout, --avatar-size
├── editor/fields/AvatarField.tsx (+ test)    # NEW
├── editor/CardEditor.tsx                     # render AvatarField for supportsAvatar(type)
├── editor/draft.ts                           # Draft.avatar, toCreateBody/toPatch, withType
├── editor/composer/payload-content.ts        # avatar counts as content for the switch warning
└── events/event-copy.ts                      # 'avatar' → "image"

e2e/tests/smoke/editor.spec.ts                # + add avatar journey
e2e/tests/full/avatar.spec.ts                 # NEW
```

**Structure Decision**: every layer changes slightly. No route files change, because the field
travels on the existing item routes. The only new web components are `CardAvatar` (main chunk) and
`AvatarField` (editor chunk).

## Invariant → test traceability

| Invariant / rule (spec FR or D-number) | Enforced in | Test (file, tier) |
|----------------------------------------|-------------|-------------------|
| FR-001 / D387 only text, reminder, event, table, calc | DB CHECK + service 422 + editor hides the field | `items-avatar.int.test.ts` (int); `AvatarField.test.tsx` (unit); `full/avatar.spec.ts` "no Add image on link/photo" |
| FR-002 only editors set it | `authorize(item.update)` | `items-avatar.int.test.ts` reader → 404/403 as today (int) |
| FR-003 / D388 asset of the card's own deck; dims from the asset | `createAvatarReference` | `image-reference.test.ts` (unit); `items-avatar.int.test.ts` other deck → 422 (int) |
| FR-004 / D389 / SC-003 referenced image never swept | `assets.repo` `unreferenced` | `media-sweep` int test: live, archived, soft-deleted kept; removed or purged freed |
| FR-005 / FR-006 circle in lists, Browse, card page, review; reserved box; empty circle on failure | `CardAvatar`, `Card`, `ReviewCard` | `CardAvatar.test.tsx` (unit); `smoke/editor.spec.ts`; `full/avatar.spec.ts` Browse + review + broken image |
| FR-007 decorative | `alt=""` + `aria-hidden` | `CardAvatar.test.tsx` (unit) |
| FR-008 / D390 activity log | `diffFields` + `insertItemEvents` | `diff-fields.test.ts` (unit); `items-avatar.int.test.ts` add, replace, remove, no-op (int) |
| FR-009 refused, never dropped; bounded | strict input schema + CHECK + service | `item.test.ts` schema (unit); `items-avatar.int.test.ts` (int) |
| FR-010 / D393 share preview: public = generated card + avatar ?? snapshot; private = generic; none on public pages or search | `share.service` `imageFor`, `ogCardTree`, `ogContentHash`; `toPublicItem` allow-list | `share.service.test.ts` (order, avatar beats snapshot, private has nothing from the card, hash changes with avatar) (unit); `public` int test asserts no `avatar` (int) |
| FR-011 / D394 ingestion and import never set one | no input path | `items-avatar.int.test.ts` ingestion proposal + import → `avatar` null (int) |
| Spec edge: type switch warns and drops | `withType`, `payloadHasContent` | `draft.test.ts` (unit); `full/avatar.spec.ts` |
| Acceptance 1.5 failed upload keeps previous | `AvatarField` | `AvatarField.test.tsx` (unit); `full/avatar.spec.ts` |
| Acceptance 1.6 draft keeps avatar | `drafts-store` | `draft.test.ts` (unit); `full/avatar.spec.ts` |
| SC-004 no visual change without an avatar | `Card` header markup unchanged | `Card.test.tsx` snapshot of a card without an avatar (unit) |
| Migration reversible | down file | migration round-trip int test |

## Accountability

| Decision | Event / audit row | Outcomes · reasons | Fields (ids/hashes only) | Level | Watched | Alert threshold (default) | Test |
|----------|-------------------|--------------------|--------------------------|-------|---------|---------------------------|------|
| Avatar added, replaced or removed | `item_events` row (`updated`, `changes ∋ avatar`) | — | itemId, deckId, actorId | audit | aggregate per day | none (expected) | `items-avatar.int.test.ts` |
| Avatar write refused | `item.avatar` log (new, `item-avatar.events.ts`) | `refused` · `unsupported_type`, `unknown_image`, `other_deck` | requestId, deckId, itemId (on PATCH), actorId | info; warn on `other_deck` | aggregate by reason; instance for `other_deck` | `other_deck` > 5/h (a client bug or probing); `unsupported_type` > 20/h (the UI offering the field wrongly) | `items-avatar.int.test.ts` |
| Avatar image deleted after removal or purge | existing `media-sweep` events | existing | existing | existing | existing | existing | `media-sweep` int test (reference cases) |
| Share preview picks the avatar or the snapshot | none: the image is derived from the state of a card that is already public, with no choice about a person. Render failures keep their existing log (D61) | — | — | — | — | — | `share.service.test.ts` |
| Ingestion never sets an avatar | none: no code path makes this decision (D394) | — | — | — | — | — | `items-avatar.int.test.ts` |

**Operator controls**: none new. Upload size and rate limits are the existing media ones, and the
avatar's display sizes are UI constants. The two alert thresholds above go in the
`docs/design/card-media.md` runbook section.

## Rollout

- **Migrations**: `0025_card_avatar` is additive and reversible (the down file drops the index, CHECK
  and column). No backfill.
- **Env / config**: none, so there's no CHANGELOG blocker. Add a CHANGELOG feature line as usual.
- **API client**: `pnpm api:openapi` is needed (item DTO, create, patch).
- **Deploy order / flags**: the normal CI → Dokploy flow.
  - The API must ship before or with the web image. Old clients ignore `avatar` (an unknown field
    in a DTO), and the new web only sends it after the API accepts it. Both ship in one deploy.
  - No flag is needed.
- **Docs**:
  - `docs/design/card-media.md`: avatar section, the `CardAvatar` exception to the CloudImage-only
    rule, sweep reference, runbook thresholds.
  - `web-pwa.md` share-preview section: the public visual (avatar ?? snapshot) and the private rule.
  - `card-editor.md` (AvatarField, paste rule), `activity-log.md` (`avatar`) and `data-model.md`
    (column).
  - ADR-077 in `docs/adr.md`, plus one index row in `docs/architecture.md`.
  - `CLAUDE.md` "Media" bullet: avatars render through `CardAvatar`.
  - A `PLAN.md` line.

## Risks

| Risk | Likelihood / impact | Mitigation |
|------|---------------------|------------|
| `g_auto` crops miss the subject on busy photos | M / L | `:faces` bias. A manual crop is explicitly out of scope (spec Assumptions); a later feature can add one |
| More Cloudinary derived images (3 sizes per avatar, plus the OG crop) | L / L | Small sizes; only cards with avatars; the same quota family as photo cards |
| Two paste listeners on an event card | L / M | Rule D392: avatar paste is off on events; unit test |
| The title row jumps in Browse while swiping | M / M | A fixed `--avatar-size` box rendered before the image loads; a full e2e checks the bounding box before and after load |
| A public card's `og:image` shows the avatar although the public page doesn't render it | L / L | Consistent with D177 (same image as `/s/`). Recorded in D393 |
| Public link/event previews change for cards without an avatar (the snapshot now appears in the generated card) | L / M | Intended per the 2026-11-11 clarification; the content hash re-renders on first share; covered by `share.service` unit tests |
| A layer `publicId` from another cloud or missing at Cloudinary | L / L | Avatars and snapshots both live in the one cloud behind `CLOUDINARY_URL`; a missing layer makes Cloudinary answer an error, which chat apps treat as no image, the same as a missing photo today |

## Settle before starting

- [ ] **CLAUDE.md / D161 wording**: "stored images render only through `cards/CloudImage`" gains
  `CardAvatar` (D391). Confirm the exception, or require `CardAvatar` to wrap `CloudImage`.

## Complexity Tracking

No constitution violations.
