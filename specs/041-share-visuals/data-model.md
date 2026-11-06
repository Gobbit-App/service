# Data model: Share visuals

No migration (spec, Assumptions). Everything below is optional keys in existing jsonb columns or pg-boss job data.

## Link payload preview (`items.payload.preview`, link cards)

| Key | Type | Owner | Meaning |
|-----|------|-------|---------|
| `title`, `description`, `image` | string | member / server | Unchanged. `image` is a remote http(s) URL. |
| `publicId`, `width`, `height` | string / int | server (D163, D167) | Unchanged: the stored copy or the member's photo. |
| `imageLookup` | int ≥ 1 | **server** (D350) | Image-rules version the snapshot job last looked under. Written after every job run that looked for or tried images, whether an image was found or not. |
| `imageRemoved` | `true` | **server** (D350) | Set when a member's write sends `publicId: null` ("Remove photo"). Cleared when a write sets a new `publicId` or changes `url`. |

Rules:

- Client values for `imageLookup` and `imageRemoved` are ignored. The stored values are carried into the new payload by `link-preview-fields`, the same as `publicId`/`width`/`height`.
- When the URL changes, the server-built preview is dropped (014/015). `imageLookup` goes with it, and `imageRemoved` is cleared.
- Neither key appears in `linkPreviewSchema` (the editor lookup DTO) or `toPublicItem`.
- `linkPayloadSchema.preview` (strict) accepts both as optional, so stored rows validate.
- Size: at most ~40 bytes of payload.

### State of a link card's picture

```text
          share / create / URL change
                    │
                    ▼
   ┌── needs snapshot? (needsLinkSnapshot) ──┐
   │ empty preview, or image w/o publicId,   │
   │ or title|description && no image &&     │
   │ no publicId && imageLookup < VERSION && │
   │ !imageRemoved                           │
   └──────────────┬──────────────────────────┘
                  ▼
             link-snapshot job ── tries ≤ LINK_IMAGE_TRIES candidates
          ┌───────┼──────────────┬──────────────────┐
          ▼       ▼              ▼                  ▼
       copied   all failed   storage failure    none found
   image+publicId image removed  remote kept      no image
   +w/h, stamped  stamped        (not stamped)     stamped
```

"Remove photo" sets `imageRemoved`. From then on `needsLinkSnapshot` is false for the picture, and the job and the pass never add one.

## Normalized source (`ingest_jobs.normalized`)

Two optional keys are added to `normalizedSourceSchema`:

| Key | Type | Meaning |
|-----|------|---------|
| `linkPreview` | `{ title?, description?, image? }` | What the builder decided (after the locked-host rule). Ingest prefers it over `toLinkPreview(og)`. |
| `imageCandidates` | `string[]` (≤ 5) | Ordered image URLs. They are passed to the snapshot job so it doesn't refetch the page. |

Jobs normalized before 041 have neither key. Ingest falls back to `toLinkPreview({ title: pageTitle, og })` as today. Both keys are nulled with `normalized` after 30 days, like the rest.

## Snapshot job data (`LinkSnapshotJob`)

```ts
interface LinkSnapshotJob {
  itemId: string;
  attempt?: number; // unchanged (requeue after a lost edit race)
  candidates?: string[]; // NEW, ≤ LINK_IMAGE_CANDIDATES_MAX, from ingest
}
```

The pass sends no candidates, so the job builds the preview itself.

## Constants (`@gobbit/shared/links/constants.ts`)

| Name | Default | Env |
|------|---------|-----|
| `LINK_IMAGE_RULES_VERSION` | 1 | — (bumped by code) |
| `LINK_IMAGE_CANDIDATES_MAX` | 5 | — |
| `LINK_IMAGE_TRIES` | 3 | `LINK_IMAGE_TRIES` |
| `LINK_IMAGE_MIN_STORED_PX` | 200 | — |
| `LINK_ARTICLE_IMAGE_MIN_PX` | 300 | `LINK_ARTICLE_IMAGE_MIN_PX` |
| `LINK_LOOKUP_TIMEOUT_MS` | 2500 | `LINK_LOOKUP_TIMEOUT_MS` |
| `LINK_LOOKUP_MAX_BYTES` | 65536 | — |
| `LINK_IMAGE_BACKFILL_HOST_SPACING_S` | 60 | script `--host-spacing` |

## Pass candidates (repository query)

`items.linkImageBackfillCandidates(afterId, limit)` returns `{ id, url }[]` ordered by id; the script takes the host from `url`. The conditions are in research D351. The member-edit exclusion is:

```sql
NOT EXISTS (
  SELECT 1 FROM item_events e
  WHERE e.item_id = items.id AND e.kind = 'updated'
    AND e.actor_user_id IS NOT NULL AND 'payload' = ANY(e.changes)
)
```
