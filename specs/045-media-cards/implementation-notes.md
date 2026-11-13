# Implementation notes: Media cards (045)

Decisions the plan didn't make and deviations from it, per PR. Copied into the "Deviations" list
of `docs/design/card-media.md` at close-out.

## PR 1 — Foundation

### Pending owner checks

- Quickstart § 0 (provider facts against a test cloud: `pages`/`duration`/`etag`/`original_filename`
  in the upload and Admin API answers, signed `allowed_formats` per kind, `pg_N` with `f_auto`,
  eager URLs) hasn't been run: it needs the owner's test cloud. PR 1 builds only on facts the
  automated suites don't need from the provider; PR 2 should not start the players before § 0 is
  recorded here.
- "Allow delivery of PDF and ZIP files" is in `CHANGELOG.md` as **Action required** before PR 2.

### Decisions

- **Migration snapshot**: `drizzle-kit generate --custom` copies the previous snapshot, so the
  migration was generated normally (to get a correct `0025_snapshot.json`) and its SQL then
  replaced by hand: `RENAME VALUE` instead of drop/recreate, the search function, the reshape and
  the GIN index. The GIN index stays SQL-only, like `items_image_public_id_idx` before it.
- **Index predicate**: `items_media_payload_idx` uses `WHERE "type" = 'media'` in the migration
  that renamed the value. A renamed value isn't an uncommitted *added* value, so it's safe in the
  same transaction; `::text` would not be immutable.
- **Readers don't use the input schema**: stored photo descriptions can be longer than today's
  200-character input cap (D398 keeps them), so the API's public renderer and share preview read
  galleries with the zod-free `mediaImagesOf()` / `mediaKindOf()` (`@gobbit/shared/media-constants`),
  which also read pre-045 flat payloads. The web has its own `asMediaPayload()` guard.
- **Alias (D387)** also covers: `ItemCreateResolved` (a create body after the alias), direct
  proposals (`parseDirectDraft`, logged with the job id, `route: 'ingest'`), `?type=image` links to
  the composer, cached items whose `type` is still `image`, and new-card drafts stored under the
  old `new:<deck>:image` key (moved to the `media` key on first read).
- **Model vocabulary**: the extraction tool still offers the model `"image"`; the validator maps
  it to a `media` card of kind `image`. `ingestCardTypes`/`directCardTypes` say `media`; stored
  `extraction.type` may still say `image` on older jobs, so the summary schema accepts both.
- **Confirm refusal paths**: the three pre-045 refusals keep their fields (`signature`,
  `publicId` ×2); the new ones (`format`, `kind_mismatch`, `too_large`, `unreadable`) use `file`.
  Messages say "file" instead of "image" ("File belongs to another deck", "Unknown file").
- **Refused uploads**: a refusal for a bad signature or a file outside the deck folder deletes
  nothing (it may not be this deck's file). The rest delete the stored file before answering.
- **Tamper level**: `media.confirm` refusals for `kind_mismatch`/`bad_signature` log at `warn`
  through a second decision logger, since the logger sets levels per event and outcome, not
  per reason.
- **`unknown_kind`** (Accountability: `media.sign`) is a 400 from the route's schema before the
  service runs, so it isn't logged as a decision event; it shows up as a 400 in the access log.
- **`media.refused_delete` / `media.confirm` subjects**: the public id is logged as a truncated
  SHA-256 (`publicIdHash`), not a keyed hash: a public id isn't personal data, it only names a
  storage path.
- **Verify pass scope**: only `source = 'editor'` assets are checked; ingest and link-snapshot
  uploads are made by the server from the provider's own answer. A file the provider doesn't
  know is marked verified (logged `missing`) so it isn't looked up every day.
- **Images without dimensions**: confirm now accepts an image without `width`/`height` (the
  schema made them optional for audio); the asset records nulls as backfilled rows do.
- **Upload parsing**: `uploadedImageOf()` already reads `resource_type`, `pages`, `duration`,
  `etag` and `original_filename`, and `uploadForm()` posts signed `eager` parameters, so PR 2
  only adds pickers.
- **`media-sweep.int` 0012 backfill test removed**: it ran 0012's SQL, which names the renamed
  enum value and can't run after 0025. Replaced by "never sweeps a photo in any gallery
  position" and a video-resource delete test.
- **Web in PR 1**: `CardBody` renders a gallery's cover through `ImageCard`; PDF, audio and video
  cards show "File unavailable" until PR 2. The editor edits the cover through a `MediaFields`
  adapter around `ImageFields`. Composer labels stay "Image"/"Photo" until PR 2 renames the tile.

### Known limits

- Integration tests (`*.int.test.ts`, Docker) weren't run in the implementation environment;
  CI runs them on the PR.
