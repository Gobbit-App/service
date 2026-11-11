# Research: Card avatar (044)

Decisions continue the project-wide D series (D386–D395). Each lists the decision, its rationale and the
alternatives considered.

## D386 — The avatar is its own item column, not a payload key

**Decision**: `items.avatar` is a nullable `jsonb` column holding `{ publicId, width?, height? }`. It is
not stored inside `payload`. The member DTO gains `avatar: CardAvatar | null`, and create and PATCH
accept `avatar`.

**Rationale**:

- Payload strings feed `item_search_text()` (the `ELSE payload` branch), and that text drives the
  embedding hash (D74). A `payload.avatar.publicId` would put a Cloudinary id into trigram search and
  re-embed a card whenever its avatar changes. A column touches neither.
- `toPublicItem` is an allow-list built field by field (D174). A new column stays off public pages and
  public search without any code, which is what the spec asks for (FR-010). A payload key would need
  stripping in `publicPayload`.
- Ingestion, bulk import and the extraction validator all build payloads from `payloadSchemas`. With a
  column they never see the avatar, so FR-011 holds by construction and needs no stripping.
- All five payload schemas are `.strict()`. A payload key would mean adding it to each of them, and
  to every later type.
- The editor resets `payload` on a type switch (`withType`). A top-level field survives a switch
  between supporting types without special handling.
- The activity log names it as its own field (D390). As a payload key it would need a group, like
  D369's event sub-fields.

**Alternatives considered**:

- *`payload.avatar` on each supporting type*: rejected for the stripping work above (search text,
  embedding hash, public DTO, ingestion) and because every renderer reading `payload` would have to
  ignore it.
- *`avatar_asset_id uuid` with a composite FK to `assets(id, deck_id)`*: this would enforce FR-003 in
  the database. Rejected because every list, search and review read would then join `assets`.
  Image cards already copy the asset's id and dimensions at write time (D160), and the avatar follows
  that pattern.
- *Three scalar columns (`avatar_public_id`, `avatar_width`, `avatar_height`)*: these work, but they
  spread one value over three nullable columns that must be null together. One `jsonb` with a shape
  CHECK is simpler and matches `preview` on link cards.

**ADR**: yes → ADR-077 ("Card-level attributes that aren't content live in columns, not payload").
Checklists (`042-checklists`) and later types opt in through D387.

## D387 — Which types carry an avatar, and how a type opts in

**Decision**: `@gobbit/shared/card-avatar` exports `avatarItemTypes = ['text', 'reminder', 'event',
'table', 'calc']` and `supportsAvatar(type)`. This is a zod-free subpath, because the web reads it.
The DB CHECK `items_avatar_chk` lists the same types. A new type opts in by adding itself to both: a
migration plus the constant, with a unit test that compares the two lists through the schema
snapshot.

Writes are refused, never dropped (FR-009):

- An avatar on `link` or `image` → 422 problem, field `avatar`, "This card type has no avatar".
- PATCH can't change type (D12, 409 `type-change-not-supported`), so a stored avatar can never end up
  on an unsupported type.

**Rationale**: FR-001 asks for an explicit opt-in. A CHECK keeps the invariant in the database
(constitution III), and the service check gives the field-level error.

**Alternatives considered**: a per-type flag in `payloadSchemas` metadata. Rejected because the web
can't import the zod schemas (bundle rule), so it would need a second list anyway.

## D388 — Reference rule: the D160 check, extended to avatars

**Decision**:

- The client sends only `avatar: { publicId }` (or `null` on PATCH to remove it).
- `createAvatarReference(assets)` sits next to `createImageReference` in
  `services/image-reference.ts`, and it applies the same rule:
  - the asset must exist and belong to the card's deck;
  - otherwise the write fails with 422, field `avatar.publicId`, "Unknown image".
- `width` and `height` come from the asset row; client values are refused by the strict input schema.
- An asset from another deck and an unknown id get the same answer, but the decision log tells them
  apart (Accountability).

**Rationale**: FR-003 is the same rule as image cards (D160, ADR-054), so it reuses the same repo call
(`assets.byPublicId`) and the same wording.

**Alternatives considered**: trusting client dimensions. Rejected because D160 already decided that
dimensions are server-owned.

## D389 — Clean-up counts avatars as references

**Decision**:

- `assets.repo`'s `unreferenced` predicate gains `OR i.avatar->>'publicId' = assets.public_id`.
  Like the existing branches it covers items of every status, soft-deleted ones included.
- A partial expression index `items_avatar_public_id_idx ON items ((avatar->>'publicId')) WHERE
  avatar IS NOT NULL` keeps the sweep's `NOT EXISTS` an index lookup. This mirrors
  `items_link_preview_public_id_idx`.
- Once `prune-deleted-items` hard-deletes a card after 30 days, or a member removes the avatar, the
  image becomes unreferenced. The normal 7-day grace period (ADR-054) then applies.

**Rationale**: FR-004 and SC-003. One predicate already serves both the candidate query and the
"still unreferenced" re-check at delete time, so a single edit covers both.

**Alternatives considered**: a reference-count column on `assets`. Rejected: the sweep already
derives references from `items`, and a counter would be a second source of truth.

## D390 — Activity log names `avatar`

**Decision**:

- `itemEventFields` gains `'avatar'`. `ItemFields`/`itemFields()` carry `row.avatar`, and
  `diffFields` compares `avatar.publicId`. Width and height are server-owned and follow the id.
- Adding, replacing or removing an avatar logs an `updated` line whose `changes` include `avatar`
  (FR-008).
- `item_events.changes` is a `text[]` with no value CHECK, so this needs no migration.
- The web's field labels (`events/event-copy.ts`) show it as "image".

**Rationale**: the activity log lists field names only (ADR-057), and `avatar` is a field name.
Removing an avatar is a change like any other.

## D391 — Rendering: one `CardAvatar`, auto-gravity square crop, fixed boxes

**Decision**:

- `apps/web/src/cards/CardAvatar.tsx` renders a fixed square box with `border-radius: 50%`.
  The sizes are CSS custom properties: `--avatar-size` is 40 px in lists and on the card page, and
  56 px in Browse and its full view.
- The box is always laid out at its size, so loading causes no shift (FR-006).
- The image URL comes from a new `avatarUrl(cloudName, publicId, px)` in `cards/cloudinary.ts`:
  `f_auto,q_auto,c_fill,g_auto:faces,ar_1:1,w_{px}`. It is built on the module's existing
  `deliveryUrl`, the same builder `CloudImage` uses, so every stored-image URL still comes from one
  module. The `srcset` covers 1×, 2× and 3× of the box,
  so there are no `sizes` measurements.
- `alt=""` and `aria-hidden` make it decorative (FR-007).
- On `onError` the `<img>` is removed and the empty circle stays. The circle uses the card fill
  token and has no border, per the no-borders rule for repeating items.
- `Card.tsx`'s header renders `CardAvatar` before `h2.card__title` only when `item.avatar` is set.
  Without one, the markup is byte-identical to today (SC-004).
- "Titles line up" (SC-002) means the title stays vertically centred on the avatar and wraps or
  truncates beside it. A card without an avatar is not indented.
- `ReviewCard.tsx` has its own title markup, so it renders the same `CardAvatar` before its title.
  That's two call sites of a single component. The header isn't extracted into a shared component
  (no abstraction for two uses).

**Rationale**: `CloudImage` is built for flowing images, with a measured `sizes`, a blur placeholder
and payload dimensions (D161). An avatar is a fixed small square, and a second, much smaller component
is simpler than adding crop modes to `CloudImage`. ADR-059/D161 says stored images render only
through `cards/CloudImage`. This plan amends that rule (settled 2026-11-11) to: "stored images
render only through `cards/CloudImage` or `cards/CardAvatar`, and every delivery URL is built in
`cards/cloudinary.ts`". The amendment goes in `docs/design/card-media.md` and the CLAUDE.md "Web"
bullet. The guarantee the rule exists for, one place that knows Cloudinary URLs, is kept, and each
component is sized for its own job.

**Alternatives considered**:

- *`CardAvatar` wrapping `CloudImage`, or a `crop="avatar"` mode on it*: rejected. It would have to
  switch off most of `CloudImage`'s logic: the `c_limit` URLs (an avatar needs a square face crop),
  the 360–1080 px `srcset` (up to 20× the bytes for a 40 px circle), per-instance measuring, the blur
  placeholder (an extra request about the avatar's own size) and the intrinsic box from payload
  dimensions. That is a second mode inside one component.
- *`g_face`*: rejected, because it fails on images without faces. `g_auto:faces` prefers faces and
  falls back to the salient subject.
- *`c_thumb`*: rejected, because `c_fill` with `ar_1:1` gives the same result and is easier to read.

## D392 — Editor: a top-level `Draft.avatar` and one `AvatarField`

**Decision**:

- `Draft` gains `avatar: CardAvatar | null`. It is stored in IndexedDB with the rest of the draft,
  so the choice survives a restore (acceptance 1.6). The drafts store stays `v: 1`, and a draft
  without the key reads as "unchanged" (`undefined`).
- `toCreateBody` sends `avatar` when it is set. `toPatch` sends it only when it differs from the
  item (`null` = remove).
- `editor/fields/AvatarField.tsx` is rendered by `CardEditor` above the type fields, for
  `supportsAvatar(type)` only. Link and image cards never show it (acceptance 1.1).
  It offers:
  - "Add image" with no avatar set;
  - "Replace" and "Remove" once one is set (acceptance 1.3);
  - a circular preview through `CardAvatar`.
- It reuses `useImageUpload`, `checkImageFile` and `PickButton`, with the same limits, progress and
  error copy (acceptance 1.2). A failed upload leaves `draft.avatar` untouched and never blocks Save
  (acceptance 1.5).
- Paste: `AvatarField` enables `usePasteImage` only on types with no other image picker, which is
  every supporting type except `event`, where `LinkPhoto` keeps paste. This avoids two listeners
  competing for one paste.
- Type switch (new cards only): `withType` keeps `avatar` between supporting types and clears it when
  switching to link or image. `payloadHasContent`/`SwitchTypeConfirm` treat a set avatar as content,
  so the confirmation says the image will be removed (spec edge case).
- `EditorPreview` shows it through `Card`, with no extra work.

**Rationale**: FR-002 and User Story 1, done with the existing upload path (FR-003).

**Alternatives considered**: putting the avatar in each type's fields component. Rejected because it
would be five copies, and the field isn't type content.

## D393 — Share preview: generic when not public, richest when public

**Decision** (clarified 2026-11-11):

- **Not public** (private share mode): unchanged. `privateMeta` keeps the static image and the generic
  text, with no avatar, title or anything content-derived (D58/D59).
- **Public share mode**: `share.service` `imageFor` picks the first that applies:
  1. An image card's own picture (D59, unchanged).
  2. The generated card (D60: title, excerpt, category, deck) **with a visual**. The visual is the
     member-set avatar, or else an automatically gathered image (the stored link/event
     `preview.publicId` snapshot). A member-set avatar always supersedes an automatic image. Without
     either, it's today's generated card.
  3. If rendering fails or times out (D61): the visual alone, cropped
     `c_fill,g_auto:faces,w_1200,h_630,f_jpg`, or else the private image.
- **How the visual gets in**:
  - The renderer is never handed image bytes. `ogCardTree` gains `visual: 'avatar' | 'snapshot' |
    null`, and it only reserves the space: a 240 px circle on the leading side for an avatar, or a
    right-hand panel for a snapshot.
  - Cloudinary composites the image at delivery through a layer on the stored card's URL:
    `l_<publicId with / as :>,c_fill,g_auto:faces,w_240,h_240,r_max/fl_layer_apply,g_north_west,…`
    for an avatar, or `…,c_fill,g_auto,w_420,h_630/fl_layer_apply,g_east` for a snapshot.
  - Both images live in the one cloud behind `CLOUDINARY_URL`, so no outbound fetch happens and
    safe-fetch is unaffected.
- `OgContent` gains `visual` and `visualPublicId`, and both go into `ogContentHash`. Adding,
  replacing or removing an avatar therefore re-renders the stored card, and the delivery URL changes
  with it.
- Public pages' `og:image` uses the same `imageFor` (D177), so a public card's page metadata carries
  the same image. The visible public page still doesn't render the avatar (FR-010).
- Behaviour change beyond avatars: public link and event cards without an avatar now show their
  preview snapshot in the generated card. Today they get a text-only card; the spec's "as today"
  premise about event preview images was inaccurate. This follows the clarification that public
  previews should be as rich as possible.

**Rationale**:

- Clarification 2026-11-11: nothing about a non-public card leaks, and public previews carry as much
  content and imagery as possible.
- A delivery-time overlay keeps the renderer pure (text only) and within its 3 s budget (D61). It
  also adds no fetch path, and it gives the visual and the text in one image.

**Alternatives considered**:

- *The avatar alone as `og:image`*: rejected. It loses the title and excerpt that the generated card
  carries, which is less information.
- *Compositing inside the renderer (Satori `<img>` with fetched bytes)*: rejected. It needs a
  fetch, base64 bytes and a timeout inside the render budget, and the overlay does the same work at
  Cloudinary's edge.
- *An avatar in private-mode previews*: rejected. It would leak a non-public card's image to anyone
  holding the link and into chat-app caches.

## D394 — People only: ingestion, import and public reads never see an avatar

**Decision**:

- `ingest/propose.ts`, `auto-publish.ts`, `imports.service` and the notes CLI create items without
  `avatar` (column default `NULL`). Their input schemas don't carry the field, so a model or file
  can't supply one.
- A publisher adds one through the normal PATCH while reviewing (FR-011, FR-002).
- `toPublicItem` stays as it is. A test asserts that `avatar` is absent from public DTOs and public
  search.

**Rationale**: FR-011, FR-010 and constitution IV. With D386 this needs no code beyond the tests.

## D395 — Offline and failure behaviour need no new mechanism

**Decision**:

- `avatar` is part of the item DTO, so the persisted query cache carries it offline (ADR-036).
- The image bytes come from the browser HTTP cache, as card photos do today. An avatar that was
  never loaded shows the empty circle offline (spec edge case).
- A deleted or missing Cloudinary image follows the same `onError` path.

**Rationale**: this is the existing behaviour of `CloudImage`. There's no service-worker image
caching, consistent with ADR-036.
