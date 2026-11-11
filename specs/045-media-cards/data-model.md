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

`type = 'media'`, payload (Zod `mediaPayloadSchema`, strict, in `@gobbit/shared` `schemas/payloads.ts`):

| Field | Type | Kinds | Source | Notes |
|-------|------|-------|--------|-------|
| `kind` | `media_kind` | all | asset (derived from its format, D390) | required; client value replaced by the asset's |
| `publicId` | string ≥ 1 | all | client | must be an asset of the card's deck (D160) |
| `alt` | string, optional | all | client | description / accessible name (D206) |
| `width`, `height` | int 1…20000, optional | image, pdf (page 1), video | asset | replaced from the asset |
| `durationMs` | int ≥ 1 | audio, video (required) | asset | |
| `pages` | int ≥ 1 | pdf (required) | asset | |
| `fileName` | string ≤ 200, optional | all | asset (`original_filename` + format) | searchable; never public (D397) |

Payload facts other than `publicId` and `alt` are server-owned: `mediaReference()` (successor of
`imageReference()`) overwrites them from the asset on every create, patch, review edit and publish.

**DB invariants (migration)**:
- `items_media_kind_check`: `type <> 'media' OR (payload->>'kind') IN ('image','pdf','audio','video')`.
- `items_media_public_id_check`: `type <> 'media' OR coalesce(payload->>'publicId','') <> ''`.
- Backfill: `UPDATE items SET payload = payload || '{"kind":"image"}' WHERE type = 'media' AND NOT payload ? 'kind'`,
  run between `ALTER TABLE items DISABLE TRIGGER items_set_updated_at` and `ENABLE` (D386).
- Index `items_image_public_id_idx` renamed `items_media_public_id_idx` (predicate unchanged).
- `item_search_text()` redefined (copy of the `0024` version): `WHEN 'media' THEN concat_ws(' ', payload->>'alt', payload->>'fileName')`
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
  - `isReferenced()` matches `i.type = 'media'`.
  - `upsert()` fills the new columns.
  - `orphans()` returns `resource_type`, so the sweep deletes per resource type.
  - new `liveMediaByEtag(deckId, etag)` for dedup.
  - new `unverified(limit)`, `markVerified(id)` and `markRejected(id)` for the verify pass.
- `mediaReference()` refuses an asset with `rejected_at` set (`422 Unknown file`); readers treat a
  card whose asset is rejected as unavailable (the payload keeps its `publicId`, the delivery URL 404s).

## Ingest

- `dedupVias` gains `'file'` (D396).
- `IngestRaw.images` stays for images; a new `IngestRaw.file?: { publicId, kind, bytes, mime }` holds the
  one non-image file used (D395). `raw` is jsonb, so no column change.
- `INGEST_*` MIME lists: `INGEST_MEDIA_MIMES` per kind in `@gobbit/shared/ingest`.

## Down migration

Refuses (RAISE) if any `media` row has `kind <> 'image'` or any asset has `resource_type = 'video'` or
`kind = 'pdf'`: rolling back would orphan files the old code can't render or delete. Otherwise it
drops the new constraints, index and columns, strips `kind` from payloads (trigger disabled again),
renames the enum value back, restores the previous `item_search_text()` and drops the two new enums.
Round-trip tested in `packages/db/test/migrations.int.test.ts`.

## Web-only shapes

- Editor draft (IndexedDB, `editor/draft.ts`): `type: 'image'` drafts are read as `media` + `kind: 'image'`
  (D387); drafts store `{ kind, publicId, alt, preview facts }`.
- Persisted query cache: items cached by an old build with `type: 'image'` render through the same
  normalizer (`cards/payload-guards.ts` `asMediaPayload`).
