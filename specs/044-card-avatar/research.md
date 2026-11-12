# Research: Card cover image (044)

Decisions continue the project-wide D series (D386–D395). Each lists the decision, its rationale and the
alternatives considered.

## D386 — The cover image is its own item column, not a payload key

**Decision**: `items.cover` is a nullable `jsonb` column holding `{ publicId, width?, height? }`. It is
not stored inside `payload`. The member DTO gains `cover: CardCover | null`, and create and PATCH
accept `cover`.

The field is called `cover`, not `avatar` (clarified 2026-11-12). It represents the card's content,
not a person. The spec folder keeps its original `044-card-avatar` name so that existing links stay
valid.

**Rationale**:

- Payload strings feed `item_search_text()` (the `ELSE payload` branch), and that text drives the
  embedding hash (D74). A `payload.cover.publicId` would put a Cloudinary id into trigram search and
  re-embed a card whenever its cover image changes. A column touches neither.
- `toPublicItem` is an allow-list built field by field (D174). A new column stays off public pages and
  public search without any code, which is what the spec asks for (FR-010). A payload key would need
  stripping in `publicPayload`.
- Ingestion, bulk import and the extraction validator all build payloads from `payloadSchemas`. With a
  column they never see the cover image, so FR-011 holds by construction and needs no stripping.
- All five payload schemas are `.strict()`. A payload key would mean adding it to each of them, and
  to every later type.
- The editor resets `payload` on a type switch (`withType`). A top-level field survives a switch
  between supporting types without special handling.
- The activity log names it as its own field (D390). As a payload key it would need a group, like
  D369's event sub-fields.

**Alternatives considered**:

- *`payload.cover` on each supporting type*: rejected for the stripping work above (search text,
  embedding hash, public DTO, ingestion) and because every renderer reading `payload` would have to
  ignore it.
- *`cover_asset_id uuid` with a composite FK to `assets(id, deck_id)`*: this would enforce FR-003 in
  the database. Rejected because every list, search and review read would then join `assets`.
  Image cards already copy the asset's id and dimensions at write time (D160), and the cover image follows
  that pattern.
- *Three scalar columns (`cover_public_id`, `cover_width`, `cover_height`)*: these work, but they
  spread one value over three nullable columns that must be null together. One `jsonb` with a shape
  CHECK is simpler and matches `preview` on link cards.

**ADR**: yes → ADR-077 ("Card-level attributes that aren't content live in columns, not payload").
Checklists (`042-checklists`) and later types opt in through D387.

## D387 — Which types carry a cover image, and how a type opts in

**Decision**: `@gobbit/shared/card-cover` exports `coverItemTypes = ['text', 'reminder', 'event',
'table', 'calc']` and `supportsCover(type)`. This is a zod-free subpath, because the web reads it.
The DB CHECK `items_cover_chk` lists the same types. A new type opts in by adding itself to both: a
migration plus the constant, with a unit test that compares the two lists through the schema
snapshot.

Writes are refused, never dropped (FR-009):

- A cover image on `link` or `image` → 422 problem, field `cover`, "This card type has no cover image".
- PATCH can't change type (D12, 409 `type-change-not-supported`), so a stored cover image can never end up
  on an unsupported type.

**Rationale**: FR-001 asks for an explicit opt-in. A CHECK keeps the invariant in the database
(constitution III), and the service check gives the field-level error.

**Alternatives considered**: a per-type flag in `payloadSchemas` metadata. Rejected because the web
can't import the zod schemas (bundle rule), so it would need a second list anyway.

## D388 — Reference rule: the D160 check, extended to cover images

**Decision**:

- The client sends only `cover: { publicId }` (or `null` on PATCH to remove it).
- `createCoverReference(assets)` sits next to `createImageReference` in
  `services/image-reference.ts`, and it applies the same rule:
  - the asset must exist and belong to the card's deck;
  - otherwise the write fails with 422, field `cover.publicId`, "Unknown image".
- `width` and `height` come from the asset row; client values are refused by the strict input schema.
- An asset from another deck and an unknown id get the same answer, but the decision log tells them
  apart (Accountability).

**Rationale**: FR-003 is the same rule as image cards (D160, ADR-054), so it reuses the same repo call
(`assets.byPublicId`) and the same wording.

**Alternatives considered**: trusting client dimensions. Rejected because D160 already decided that
dimensions are server-owned.

## D389 — Clean-up counts cover images as references

**Decision**:

- `assets.repo`'s `unreferenced` predicate gains `OR i.cover->>'publicId' = assets.public_id`.
  Like the existing branches it covers items of every status, soft-deleted ones included.
- A partial expression index `items_cover_public_id_idx ON items ((cover->>'publicId')) WHERE
  cover IS NOT NULL` keeps the sweep's `NOT EXISTS` an index lookup. This mirrors
  `items_link_preview_public_id_idx`.
- Once `prune-deleted-items` hard-deletes a card after 30 days, or a member removes the cover image, the
  image becomes unreferenced. The normal 7-day grace period (ADR-054) then applies.

**Rationale**: FR-004 and SC-003. One predicate already serves both the candidate query and the
"still unreferenced" re-check at delete time, so a single edit covers both.

**Alternatives considered**: a reference-count column on `assets`. Rejected: the sweep already
derives references from `items`, and a counter would be a second source of truth.

## D390 — Activity log names `cover`

**Decision**:

- `itemEventFields` gains `'cover'`. `ItemFields`/`itemFields()` carry `row.cover`, and
  `diffFields` compares `cover.publicId`. Width and height are server-owned and follow the id.
- Adding, replacing or removing a cover image logs an `updated` line whose `changes` include `cover`
  (FR-008).
- `item_events.changes` is a `text[]` with no value CHECK, so this needs no migration.
- The web's field labels (`events/event-copy.ts`) show it as "image".

**Rationale**: the activity log lists field names only (ADR-057), and `cover` is a field name.
Removing a cover image is a change like any other.

## D391 — Rendering: a cover bar through `CloudImage`, shaped like a link preview

**Decision** (clarified 2026-11-12: the image represents the card's content and shows as a bar below
the title, like a link's preview):

- `apps/web/src/cards/CoverBar.tsx` renders `CloudImage` with `alt=""`, the cover's `publicId` and
  its stored `width`/`height`, and the class `card__cover`.
  - The CSS reuses the link snapshot's rule (D163): `aspect-ratio: 16 / 9`, `object-fit: cover`,
    full card width and `--radius` corners. A cover bar and a link preview look the same.
  - `CloudImage` supplies the measured `sizes`, the `srcset`, the reserved box and the blur
    placeholder, so loading causes no shift (FR-006, SC-002).
- `Card.tsx` renders `CoverBar` between `header.card__header` and `CardBody` only when `item.cover`
  is set. It passes the same `image` loading hints that Browse already gives image cards, so the
  current Browse card loads its cover eagerly.
  - Without a cover the markup is byte-identical to today (SC-004).
- On `onError` `CoverBar` renders nothing, the same as `LinkCard` when its preview fails (spec edge
  case). The bar's space is only lost on that failure path.
- `alt=""` makes it decorative (FR-007).
- Events: when `item.cover` is set, `CardBody` passes `showImage={false}` through `EventCard` to
  `LinkCard`. The member's cover supersedes the link's automatic preview image, and the link box
  keeps its title, domain and button (FR-010, clarification 2026-11-11). Without a cover, events
  render as today.
- `ReviewCard.tsx` has its own title markup, so it renders the same `CoverBar` below its title.
- The stored-image rule (D161, "stored images render only through `cards/CloudImage`") is unchanged.
  The 2026-11-11 plan amended it for a separate round `CardAvatar`. A bar needs no component of its
  own, so the amendment is withdrawn.

**Rationale**:

- The bar is the same shape and job as a link preview, so it reuses that look and `CloudImage` as
  they are.
- No new image component, URL builder or crop rule is needed.

**Alternatives considered**:

- *A round thumbnail beside the title (the original "avatar")*: replaced. The 2026-11-12
  clarification says the image is for the content, not a person, and should look like a link's
  preview. A circle also cut off the corners of logos, objects and screenshots.
- *Subject-aware server crop (`c_fill,g_auto`)*: not needed. The link snapshot's CSS crop is already
  accepted (D163), and one look for both bars is simpler.
- *Showing both the cover and an event's link preview image*: rejected. That would be two large
  images on one card, and the member-set image supersedes the automatic one.

## D392 — Editor: a top-level `Draft.cover` and one `CoverField`, with every image input

**Decision**:

- `Draft` gains `cover: CardCover | null`. It is stored in IndexedDB with the rest of the draft,
  so the choice survives a restore (acceptance 1.7). The drafts store stays `v: 1`, and a draft
  without the key reads as "unchanged" (`undefined`).
- `toCreateBody` sends `cover` when it is set. `toPatch` sends it only when it differs from the
  item (`null` = remove).
- `editor/fields/CoverField.tsx` is rendered by `CardEditor` above the type fields, for
  `supportsCover(type)` only. Link and image cards never show it (acceptance 1.1). It offers:
  - "Add image" with no cover set, and "Replace" and "Remove" once one is set (acceptance 1.4);
  - a bar preview through `CoverBar`.
- It reuses `useImageUpload`, `checkImageFile` and `PickButton`, with the same limits, progress and
  error copy (acceptance 1.3). A failed upload leaves `draft.cover` untouched and never blocks Save
  (acceptance 1.6).
- **Three inputs** (FR-002, acceptance 1.2), all feeding one `pick(file)`:
  - **Pick**: `PickButton`, as on photo cards.
  - **Drag and drop**: the field is a drop target. A new `editor/use-drop-image.ts` hook handles
    `dragover`/`drop` on the field's element, takes the first `image/*` file and shows a drop
    highlight while dragging.
    - Nothing in the editor supports drop today. Photo-card and link-photo fields could reuse the
      hook later; that's out of scope here and noted as a follow-up.
  - **Paste**: `usePasteImage` gains an optional `scope` element.
    - On text, reminder, table and calc cards the cover is the only image field, so paste is
      page-wide, as on photo cards.
    - On event cards `LinkPhoto` already takes page-wide paste. `CoverField` therefore listens with
      `scope` set to its own element and in the capture phase, so a paste while focus is in the cover
      field goes to the cover. Any other paste goes to `LinkPhoto` as today (spec edge case).
      `pastedImage` already ignores pastes that another handler took.
- Type switch (new cards only): `withType` keeps `cover` between supporting types and clears it when
  switching to link or image. `payloadHasContent`/`SwitchTypeConfirm` treat a set cover as content,
  so the confirmation says the image will be removed (spec edge case).
- `EditorPreview` shows it through `Card`, with no extra work.

**Rationale**:

- FR-002 and User Story 1, done with the existing upload path (FR-003).
- One `pick` behind three inputs keeps the limits and errors identical whichever input is used.

**Alternatives considered**:

- *Putting the cover in each type's fields component*: rejected. It would be five copies, and the
  field isn't type content.
- *On events, disabling cover paste (the earlier plan)*: rejected, because every image input must
  work (clarification 2026-11-12).
- *A whole-editor drop zone*: rejected. On event cards a drop would be ambiguous between the cover
  and the link photo, and the field is a clear target.

## D393 — Share preview: generic when not public, richest when public

**Decision** (clarified 2026-11-11):

- **Not public** (private share mode): unchanged. `privateMeta` keeps the static image and the generic
  text, with no cover, title or anything content-derived (D58/D59).
- **Public share mode**: `share.service` `imageFor` picks the first that applies:
  1. An image card's own picture (D59, unchanged).
  2. The generated card (D60: title, excerpt, category, deck) **with a visual**. The visual is the
     member-set cover, or else an automatically gathered image (the stored link/event
     `preview.publicId` snapshot). A member-set cover always supersedes an automatic image. Without
     either, it's today's generated card.
  3. If rendering fails or times out (D61): the visual alone, cropped `c_fill,g_auto,w_1200,h_630,f_jpg`,
     or else the private image.
- **How the visual gets in**:
  - The renderer is never handed image bytes. `ogCardTree` gains `hasVisual: boolean`, and when it is
    set the text column narrows and a right-hand panel is left empty.
  - Cloudinary fills that panel at delivery through a layer on the stored card's URL:
    `l_<publicId with / as :>,c_fill,g_auto,w_420,h_630/fl_layer_apply,g_east`.
  - The cover and the snapshot are both landscape images, so one slot serves both.
  - Both images live in the one cloud behind `CLOUDINARY_URL`, so no outbound fetch happens and
    safe-fetch is unaffected.
- `OgContent` gains `visualPublicId`, and it goes into `ogContentHash`. Adding, replacing or
  removing a cover therefore re-renders the stored card, and the delivery URL changes with it.
- Public pages' `og:image` uses the same `imageFor` (D177), so a public card's page metadata carries
  the same image. The visible public page still doesn't render the cover (FR-010).
- Behaviour change beyond covers: public link and event cards without a cover now show their preview
  snapshot in the generated card. Today they get a text-only card; the spec's earlier "as today"
  premise about event preview images was inaccurate. This follows the clarification that public
  previews should be as rich as possible.

**Rationale**:

- Clarification 2026-11-11: nothing about a non-public card leaks, and public previews carry as much
  content and imagery as possible.
- A delivery-time overlay keeps the renderer pure (text only) and within its 3 s budget (D61). It
  also adds no fetch path, and it gives the visual and the text in one image.

**Alternatives considered**:

- *The cover alone as `og:image`*: rejected. It loses the title and excerpt that the generated card
  carries, which is less information.
- *Compositing inside the renderer (Satori `<img>` with fetched bytes)*: rejected. It needs a
  fetch, base64 bytes and a timeout inside the render budget, and the overlay does the same work at
  Cloudinary's edge.
- *A cover in private-mode previews*: rejected. It would leak a non-public card's image to anyone
  holding the link and into chat-app caches.

## D394 — People only: ingestion, import and public reads never see a cover image

**Decision**:

- `ingest/propose.ts`, `auto-publish.ts`, `imports.service` and the notes CLI create items without
  `cover` (column default `NULL`). Their input schemas don't carry the field, so a model or file
  can't supply one.
- A publisher adds one through the normal PATCH while reviewing (FR-011, FR-002).
- `toPublicItem` stays as it is. A test asserts that `cover` is absent from public DTOs and public
  search.

**Rationale**: FR-011, FR-010 and constitution IV. With D386 this needs no code beyond the tests.

## D395 — Offline and failure behaviour need no new mechanism

**Decision**:

- `cover` is part of the item DTO, so the persisted query cache carries it offline (ADR-036).
- The image bytes come from the browser HTTP cache, as card photos do today. A cover that was
  never loaded is left out offline, as link previews are (spec edge case).
- A deleted or missing Cloudinary image follows the same `onError` path.

**Rationale**: this is the existing behaviour of `CloudImage`. There's no service-worker image
caching, consistent with ADR-036.
