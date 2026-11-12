# Data model: Media cards (045)

One migration, `0025_media_cards` (number after the latest merged migration at implementation time),
plus a hand-written `down/0025_media_cards.sql`.

## Enums

| Enum | Change |
|------|--------|
| `item_type` | value `image` renamed to `media` (D386). Shared `itemTypes` becomes `['text','link','media','table','calc','reminder','event']`. |
| `media_kind` (new) | `image`, `pdf`, `audio`, `video`. Shared `mediaKinds`. |
| `asset_resource_type` (new) | `image`, `video` (D388). Shared `assetResourceTypes`. |

## `items` (media rows)

`type = 'media'`, payload (Zod `mediaPayloadSchema`, a strict discriminated union on `kind`, in
`@gobbit/shared` `schemas/payloads.ts`). The kind comes from the asset(s) (derived from the format, D390);
a client value that disagrees is refused (`422`).

**Image kind (gallery, D398)**: `{ kind: 'image', images: MediaImage[] }`, 1…`MEDIA_GALLERY_MAX` (8)
entries in display order, first = cover, no repeated `publicId`.

| `MediaImage` field | Type | Source | Notes |
|--------------------|------|--------|-------|
| `publicId` | string ≥ 1 | client | an image asset of the card's deck (D160) |
| `alt` | string ≤ `MEDIA_ALT_MAX` (200 code points), optional | client | per-photo description (D206); cap applies to input only |
| `width`, `height` | int 1…20000 | asset | replaced from the asset |

**PDF, audio and video kinds**: `{ kind, publicId, alt?, width?, height?, durationMs?, pages?, fileName? }`.

| Field | Type | Kinds | Source | Notes |
|-------|------|-------|--------|-------|
| `publicId` | string ≥ 1 | all three | client | must be an asset of the card's deck (D160) |
| `alt` | string ≤ 200, optional | all three | client | description / accessible name (D206) |
| `width`, `height` | int 1…20000, optional | pdf (page 1), video | asset | replaced from the asset |
| `durationMs` | int ≥ 1 | audio, video (required) | asset | |
| `pages` | int ≥ 1 | pdf (required) | asset | |
| `fileName` | string ≤ 200, optional | all three | asset (`original_filename` + format) | searchable; never public (D397) |

Payload facts other than `publicId` and `alt` are server-owned: `mediaReference()` (successor of
`imageReference()`) checks every referenced asset and overwrites the facts from it on every create,
patch, review edit and publish. Worst-case size of an 8-photo gallery: 8 × (≈ 110 bytes of ids and
dimensions + 200 code points of alt) stays under the 8192-byte payload CHECK.

**DB invariants (migration)**:
- `items_media_kind_check`: `type <> 'media' OR (payload->>'kind') IN ('image','pdf','audio','video')`.
- `items_media_files_check`: `type <> 'media' OR CASE payload->>'kind'
  WHEN 'image' THEN jsonb_typeof(payload->'images') = 'array'
    AND jsonb_array_length(payload->'images') BETWEEN 1 AND 8
    AND NOT jsonb_path_exists(payload, '$.images[*] ? (!exists(@.publicId) || @.publicId == "")')
  ELSE coalesce(payload->>'publicId','') <> '' END` (8 = `MEDIA_GALLERY_MAX`; raising it is a migration).
- Backfill (reshape): `UPDATE items SET payload = jsonb_build_object('kind','image','images',
  jsonb_build_array(jsonb_strip_nulls(jsonb_build_object('publicId', payload->'publicId', 'alt', payload->'alt',
  'width', payload->'width', 'height', payload->'height')))) WHERE type = 'media' AND NOT payload ? 'kind'`,
  run between `ALTER TABLE items DISABLE TRIGGER items_set_updated_at` and `ENABLE` (D386). It also
  recomputes the generated `search_text` for those rows.
- Index: drop `items_image_public_id_idx`; add `items_media_payload_idx` GIN (`payload jsonb_path_ops`)
  `WHERE type = 'media'`, serving `payload @> '{"images":[{"publicId":…}]}'` and `payload @> '{"publicId":…}'` (D398).
- `item_search_text()` redefined (copy of the `0022` version): `WHEN 'media' THEN jsonb_build_object('alts',
  jsonb_path_query_array(payload, '$.images[*].alt'), 'alt', payload->'alt', 'fileName', payload->'fileName')`
  (was `payload - 'publicId'`, which also indexed width/height digits). Stale embeddings heal through the
  existing sweep (ADR-041).

`type` never changes on PATCH (D12); replacing the file may change `kind` (spec edge case).

## `assets`

| Column | Change | Type | Notes |
|--------|--------|------|-------|
| `resource_type` | new | `asset_resource_type` NOT NULL DEFAULT `'image'` | existing rows are images |
| `kind` | new | `media_kind` NOT NULL DEFAULT `'image'` | |
| `duration_ms` | new | integer NULL | CHECK `> 0` |
| `pages` | new | integer NULL | CHECK `> 0` |
| `etag` | new | text NULL | content MD5 from the provider (D396); NULL for pre-045 rows |
| `original_filename` | new | text NULL | ≤ 200 chars |
| `verified_at` | new | timestamptz(3) NULL | set by the sweep's verify pass (D390); NULL = not yet checked |
| `rejected_at` | new | timestamptz(3) NULL | set when the verify pass found a false or over-limit fact and deleted the file |
| `width`, `height`, `bytes`, `format` | unchanged | | already nullable |

- CHECK `assets_kind_resource_check`: `(kind IN ('image','pdf') AND resource_type = 'image') OR (kind IN ('audio','video') AND resource_type = 'video')`.
- Index `assets_deck_etag_idx` on `(deck_id, etag) WHERE etag IS NOT NULL` (dedup, D396).
- `assets.repo.ts`:
  - `isReferenced()` / the orphan predicate match `i.type = 'media'` with the two `@>` forms (D398).
  - `upsert()` fills the new columns.
  - `orphans()` returns `resource_type`, so the sweep deletes per resource type.
  - new `liveMediaByEtag(deckId, etags[])` for dedup (any photo of a gallery).
  - new `unverified(limit)`, `markVerified(id)` and `markRejected(id)` for the verify pass.
- `mediaReference()` refuses an asset with `rejected_at` set (`422 Unknown file`); readers treat a
  card whose asset is rejected as unavailable (the payload keeps its `publicId`, the delivery URL 404s).

## Ingest

- `dedupVias` gains `'file'` (D396).
- `IngestRaw.images` stays for images (all of them, ≤ 3, become the gallery of an image proposal, D395); a new `IngestRaw.file?: { publicId, kind, bytes, mime }` holds the
  one non-image file used (D395). `raw` is jsonb, so no column change.
- `INGEST_*` MIME lists: `INGEST_MEDIA_MIMES` per kind in `@gobbit/shared/ingest`.

## Down migration

Refuses (RAISE) if any `media` row has `kind <> 'image'`, any gallery has more than one photo, or any asset has `resource_type = 'video'` or
`kind = 'pdf'`: rolling back would orphan files the old code can't render or delete. Otherwise it
drops the new constraints, index and columns, flattens `images[0]` back into the payload (trigger
disabled again), recreates `items_image_public_id_idx`,
renames the enum value back, restores the previous `item_search_text()` and drops the two new enums.
Round-trip tested in `packages/db/test/migrations.int.test.ts`.

## Web-only shapes

- Editor draft (IndexedDB, `editor/draft.ts`): `type: 'image'` drafts are read as `media` +
  `{ kind: 'image', images: [ … ] }` (D387); drafts store the kind and either the ordered photo list
  (each `{ publicId, alt, preview facts }`; photos still uploading are not kept) or the single file.
- Persisted query cache: items cached by an old build with `type: 'image'` and a flat payload render
  through the same normalizer (`cards/payload-guards.ts` `asMediaPayload`).
