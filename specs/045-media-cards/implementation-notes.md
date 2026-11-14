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
- **Sign body read by hand**: `POST /decks/{id}/media/sign` documents its optional `{ kind }`
  body in the route description instead of a declared request body. A declared optional JSON body
  is still validated when absent (no content type → 400), which broke clients that send none
  (caught by `media.int`).
- **0008 search-text overload**: the 4-argument `item_search_text` from 0008 compared the enum to
  the literal `'image'` and failed after the rename. 0025 makes it delegate to the 5-argument
  function with empty entities (same text for every other type); the down file restores it.
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

## PR 2 — Reader and editor

### Decisions

- **One facade, not one card per kind** (T036–T038): `cards/media/MediaFacade.tsx` renders the PDF,
  video and audio facades (still or waveform mask, badge, Read/Play) and loads the lazy
  `PageViewer`, `VideoPlayer` or `AudioPlayer` module on intent; the plan's `PdfCard`, `VideoCard`
  and `AudioCard` would have repeated the same facade three times. Facade-first is unchanged (D400).
- **Browse releases, rather than pauses** (T039): `BrowseStack` releases the active player when the
  current card changes (`use-active-media`), which unmounts the element and frees its buffer; a
  paused off-screen `<video>` would keep it.
- **Service worker** (T032): the "only `destination === 'image'` Cloudinary requests" rule lives in
  `sw-routes.ts` (`isCloudinaryImageRequest`) so it is unit-tested without a worker.
- **Upload hooks** (T040): no separate `use-media-upload.ts`. `useImageUpload` signs per kind
  (`start(file, kind)`, one cached permission per kind) and a new `useGalleryUploads` runs several
  photo uploads at once; both share `failure()`, `useKindSigners()` and `sendFailureReport()`.
  `ImageFields.tsx` and `image-payload.ts` are gone, replaced by `GalleryFields.tsx`, `FileFields.tsx`
  and `media-payload.ts`.
- **Gallery order**: a photo joins the gallery when its confirm returns, so several photos picked
  together land in the order their uploads finish; members put them in order with Move
  earlier/later (D398 has no drag). Pick order would need placeholder slots in the payload.
- **Photos or one file**: "Choose file" (PDF, audio, video) is offered only while the media card is
  empty; a file card's Remove file returns to the empty card. No in-place photo ↔ file conversion.
- **Save waits for uploads**: field editors report uploads in flight (`onUploadingChange`, new in
  `FieldsProps`) and `saveBlockedReason` answers "Wait for uploads to finish" before any field error.
- **FR-009 messages**: a confirm 422 whose error names `file` (wrong kind, over the limit,
  unreadable PDF) shows the server's message with no Retry; other 422s keep "couldn't be verified".
- **Limits**: the editor reads `/config` `media.maxBytes` (`useMediaLimits`), the defaults until it
  loads; photos now take the configured image limit too.
- **Labels**: the composer tile, section and Browse type label read "Media"; the hint is "Photos, a
  PDF, audio or video". The 8-photo cap message says how many photos were left out.
- **e2e fake Cloudinary**: `routeFakeCloudinary` gives each upload its own public id (`id`, `id-2`, …)
  so a gallery holds distinct photos, and takes an optional `FakeMediaFile` so the permission, the
  upload URL (`image`/`video`) and the answer (format, pages, duration) follow the kind.
- **Full playback check** (T043): video delivery answers 404 in e2e, so `full/media.spec.ts` checks
  what loads (no stream before Play) and how many media elements exist (one at a time), not that
  sound or picture plays.

## PR 3 — Public pages and share previews

Built on PR 1 (independent of PR 2, as the plan allows), so the stack is 1 → 3 → 4 → 2.

### Decisions

- **CSP moved here**: `media-src 'self' https://res.cloudinary.com` is in the Caddyfile of PR 3,
  not PR 2: public pages (`/p/*`, behind the same header) are the first to render `<video>` and
  `<audio>`. PR 2 only adds the service-worker rule (D394).
- **URL builders**: the share service and the OG store gained `mediaUrl(rendition, publicId)`
  reading `MEDIA_DELIVERY`; `renderItem` takes it as an optional third argument (absent or null →
  "File unavailable"), so the image-only `ImageUrlFor` callers didn't change.
- **Public video/audio**: one `<source>` each with a download link inside the element for
  browsers without the codec; `aria-label` is the description, else the card title (the title
  is the page heading, but a player has no other name). Poster is the 1080 px still, one of the
  signed eager widths.
- **PDF page 1** on the public page is `pg_1,…,w_1080` (a viewer width, not eager; images are
  generated on the fly), linked to the original with `rel="nofollow ugc noopener"`.
- **Content hash**: `mediaKind` is appended to the hashed data only for media cards, so every
  other card's stored preview keeps its hash (no mass regeneration on deploy).
- **Share preview of a gallery** uses the cover as before (`c_fill,w_1200,h_630,f_jpg`); video
  and PDF previews are cropped renditions; audio falls through to the generated card image.
- **`@full` spec** `e2e/tests/full/media-public.spec.ts` records files through the real confirm
  with a locally signed answer (`recordMediaAsset`), so it runs only where the e2e run knows
  `CLOUDINARY_API_SECRET` (as the smoke photo journey's confirm does); otherwise it skips.

## PR 4 — Ingestion

### Decisions

- **Unused, not refused**: a file whose bytes prove no allowed kind, or that is over its kind's
  limit, used to fail the whole share (400). It's now recorded in `raw.unused` with its reason
  (`unsupported`, `too_large`, `extra_file`) and the share goes on from its text, link or other
  files. A share left with nothing is still a 400, with the first file's reason. Photos follow
  the same rule. More than 3 files is still a 400.
- **Magic bytes decide** (`ingest/media-sniff.ts`): the declared type only breaks ties a container
  can't (MP4, WebM or Ogg holding sound only). The upload's content type comes from the sniffed
  format, never the client.
- **Unreadable files**: a PDF the provider reports without pages, or a recording without a
  duration, is deleted after upload and reported `unsupported` (the reason list has no
  `unreadable` for shares).
- **Ingestion stays off without an extraction provider** (D93). The media path makes no model
  call, but turning ingestion on without a provider is a separate change.
- **Titles longer than the card limit** (share titles may be 300 characters) are cut at 120 code
  points with an ellipsis; the caption is never cut (dropped and logged instead, D395).
- **Auto-publish**: a direct media proposal has no categories, so the existing rule holds it for
  review (`held_needs_category`). Same opt-in and checks as other proposals (FR-028).
- **File dedup includes proposals**: D396 says "live or archived"; the lookup also matches
  proposed cards, so sharing the same file twice flags the second share while the first still
  waits in review (US5.2).
- **Email-in**: attachments are filtered by type family (photo, PDF, audio, video) and bounded
  by the 25 MB share body, then classified like any share. Attachment names are kept as the
  title fallback.
- **Share status**: the sharer's summary gains `fileKind` and `unusedFiles` (reasons only).
- **Discard and prune** delete a job's file upload too (`raw.file`), across both resource types.
