# Research: Media cards (045)

Decisions D386–D400 belong to this feature (D400 added after the reservation of D386–D399 ran out). Each states the decision, why,
and what was rejected. "Verify" items are facts about the storage provider (Cloudinary) that the first
implementation task confirms against a real account before building on them (quickstart § 0).

## D386 — Rename the `image` card type to `media`; the file kind lives in the payload

**Decision**: `ALTER TYPE item_type RENAME VALUE 'image' TO 'media'`. A media payload carries
`kind: 'image' | 'pdf' | 'audio' | 'video'`, and its shape depends on the kind: image cards hold a
gallery `images: [...]` (D398), the other kinds a single `publicId`. Existing rows are reshaped to
`{ kind: 'image', images: [{ publicId, alt, width, height }] }` in the same migration, with `items_set_updated_at` disabled for the backfill so no card's `updated_at` (and
so its list position, share content hash or "recently changed" state) moves. A CHECK constraint
requires a valid `kind` on every media row.

**Why**: one card type with one editor, one asset reference rule (D160) and one sweep is simpler than
four near-identical types. Renaming the enum value is a catalogue-only change (no table rewrite); the
payload reshape rewrites only media rows, once, and the old `publicId` index is replaced (D398).

**Rejected**:
- *Keep `image` and add `pdf`, `audio`, `video` types*: four switch arms everywhere (CardBody, render-item,
  share, search SQL, sweep, ingest) for what is one concept, "a card that is a file".
- *Keep the DB value `image` and only relabel in the UI*: the API, OpenAPI, analytics and search would
  say "image" for a video forever.
- *Treat a missing `kind` as image (no backfill)*: leaves an invariant only in code (constitution III).

## D387 — Old clients may still say `image` for one release (alias, logged)

**Decision**: create, patch, list filter (`?type=`) and direct-ingest inputs accept `type: 'image'` and
normalize it to `media`; a flat image payload (`{ publicId, alt, width, height }`) becomes
`{ kind: 'image', images: [{ … }] }` (D398). Responses always say `media`.
Each use logs `item.type_alias` (`alias: 'image'`). The alias is removed in a later release once the
event has been silent for 30 days (tracked in `PLAN.md`).

**Why**: installed PWAs keep running the old bundle until the service worker updates, and drafts in
IndexedDB hold `type: 'image'`. Refusing them would lose a member's unsaved card.

**Rejected**: a hard switch (data loss on stale clients); a permanent alias (two names forever).

## D388 — Storage: images and PDFs as Cloudinary `image` resources, audio and video as `video`

**Decision**: PDFs upload as `resource_type: image` (Cloudinary rasterizes pages with `pg_N` and reports
`pages`); audio and video upload as `resource_type: video` (Cloudinary stores audio under `video`). The
asset row records `resource_type` and `kind`, and every delete, sweep, reconcile and URL builder takes
the resource type from the asset instead of hard-coding `image`.

**Why**: this is the provider's native model, and it gives page images, stills, waveforms and format
conversion without our own processing.

**Rejected**: `raw` for PDFs (no page rendering, no thumbnails).

## D389 — One signed upload per kind; the kind is signed into the upload

**Decision**: `POST /decks/{id}/media/sign` takes `{ kind }` (default `image`, so old clients keep
working) and signs per kind: `uploadUrl` (`…/image/upload` or `…/video/upload`), `allowed_formats` for
the kind, the folder and tags as today, and, for audio and video, the kind's
`eager` transformations with `eager_async: true` (D392). The provider enforces the signed
`allowed_formats`, so a file can only be stored in a format of the signed kind.

Formats (allow-lists in `@gobbit/shared/media`). They are **disjoint**, so a stored file's format names
exactly one kind:
- image: `jpg, png, webp, heic, heif` (unchanged)
- pdf: `pdf`
- audio: `mp3, m4a, aac, wav, ogg, opus, flac, amr` (iOS voice memos are `m4a`, Android recorders `m4a`/`amr`/`ogg`)
- video: `mp4, mov, m4v, webm, 3gp` (iOS records `mov` (HEVC), Android `mp4`/`webm`)

**Rejected**: a single signature with all formats (the kind becomes a client claim, FR-004).

## D390 — Confirm stays offline (D157 model); the daily sweep verifies against the provider

**Decision**:
- `POST /decks/{id}/media/assets` keeps D157: it verifies Cloudinary's response signature over
  `public_id` + `version` and the deck folder prefix, then records the facts the client forwards from the
  upload response (`resource_type`, `format`, `bytes`, `width`, `height`, `duration`, `pages`, `etag`,
  `original_filename`).
- The server derives `kind` from `format` (D389's disjoint lists), never from the request.
- It refuses, and deletes the stored file, when: the format is in no list, the derived kind differs
  from the requested kind, `bytes` is over the kind's limit, a PDF reports no `pages`, or audio/video
  reports no `duration`.
- Client-sent `width`/`height` stay accepted for images (old clients).
- The daily `media-sweep` gains a **verify pass**. For assets recorded since its last run, it reads the
  Admin API resource (with `pages` and media metadata) and compares `bytes`, `format` and
  `resource_type`. If a fact breaks a limit, or the reported fact was false, it deletes the file, marks
  the asset `rejected_at`, and logs `media.verify` `refused`. Cards referencing a rejected asset render
  the "unavailable" placeholder. A resource the provider doesn't know is logged `missing`; it is not deleted.

**Why**:
- Smoke e2e (in CI and post-deploy against production) replaces Cloudinary in the browser and signs
  confirms locally (D149, D151). A synchronous Admin API call at confirm would refuse every smoke upload,
  and the API's server-side traffic can't be routed to a fake post-deploy.
- The provider doesn't enforce a maximum size on signed uploads, so a deliberately false `bytes` could
  only be caught by asking the provider. A member who could do that can already create cards on the
  deck, so a check within a day is proportionate.
- The verify pass makes FR-008's "again by the server" true without a request-time dependency.

**Verify**: the Admin API resource response includes `bytes`, `format`, `pages` (PDF) and `duration`
(audio/video) (quickstart § 0).

**Rejected**:
- *Admin API lookup at confirm*: breaks the smoke model above, and adds a third-party call to the
  critical upload path.
- *Upload webhooks (`notification_url`)*: a new public endpoint and async state.
- *Trusting the forwarded facts with no verification*: leaves FR-008 enforced only by the client.

## D391 — PDF viewer = provider-rendered page images, no PDF library

**Decision**: the card picture is page 1 (`pg_1`) through `CloudImage`. "Read" opens a full-screen
`<dialog>` (lazy chunk) listing one `<img loading="lazy">` per page (`pg_N,f_auto,q_auto,c_limit,w_<measured>`),
a "Page n of N" indicator (IntersectionObserver), built on the page viewer shared with galleries (D399), zoom steps (fit width → 2× → 3×, re-requesting a
wider image and panning with native scroll), and "Open original" (`…/image/upload/<id>.pdf`, new tab).

**Why**: zero new dependency and a few KB of code, works with the existing image cache offline for pages
already seen, loads only visible pages (SC-004), and never runs a PDF inside the app's origin (FR-013).

**Rejected**: `pdfjs-dist` (≈ 400 KB+ worker, a `worker-src` CSP change, parsing untrusted PDFs in our
origin); an `<iframe>`/`<object>` (iOS Safari shows only page 1; needs `frame-src`; inconsistent controls).
Trade-off accepted: no text selection or in-document search (content search is out of scope, spec Assumptions).

**Verify**: `pg_N` with `f_auto` delivers page N for a PDF stored as an image resource; original PDF
delivery requires the account's "Allow delivery of PDF and ZIP files" setting (runbook, quickstart § 0).

## D392 — Video and audio: native elements, one fixed rendition each, generated eagerly

**Decision**:
- Video: `<video controls playsinline preload="none" poster=…>` with one source
  `…/video/upload/c_limit,w_1280,h_1280,q_auto,vc_auto/<id>.mp4`. Poster: `so_auto` still through
  `CloudImage` (`…/video/upload/so_auto,f_auto,q_auto,c_limit,w_<360|720|1080>/<id>.jpg`).
- Audio: `<audio controls preload="none">` with `…/video/upload/q_auto/<id>.mp3`, plus a waveform image
  (`fl_waveform,co_white,b_transparent,w_720,h_96/<id>.png`) drawn as a CSS `mask-image` over
  `currentColor`, so it follows the theme (D383).
- These delivery transformations are declared once in `@gobbit/shared/media` and signed as `eager`
  (`eager_async: true`) at upload (D389) and on server uploads (ingest), so large files are ready without
  hitting on-the-fly limits. Until they are, the player shows "Still processing — try again shortly".

**Why**: native controls are accessible, small and work without JS on public pages. `mp4` + `vc_auto` and
`mp3` play everywhere, including iPhone `mov`/HEVC sources on Android and desktop (SC-003).

**Rejected**: Cloudinary Video Player / hls.js (heavy, adaptive streaming unnecessary for short family
clips); `f_auto` for video (fine in browsers but less predictable for the eager-list match).

**Verify**: eager derived URLs match delivery URLs exactly (unit test asserts the web/API builders use
only the shared eager list).

## D393 — Size limits per kind, env-tunable, enforced at confirm

**Decision**: editor defaults image 8 MB per photo (unchanged), PDF 10 MB, audio 15 MB, video 25 MB;
ingest defaults image 8 MB (unchanged), PDF 10 MB, audio 15 MB, video 24 MB, all within
`INGEST_BODY_MAX_BYTES` (25 MB, which also carries the share's text and other parts).
Env overrides: `MEDIA_MAX_BYTES_{PDF,AUDIO,VIDEO}` and `INGEST_MAX_BYTES_{PDF,AUDIO,VIDEO}`, defaults in
`@gobbit/shared/media`. The sign response returns the effective limit, so the editor checks before
upload; the server refuses at confirm (D390). Uploads stay single-request; that holds up to the
provider's 100 MB single-request ceiling, beyond which chunked upload is needed (a later feature).

**Why**: the starting limits are deliberately small (product decision) to keep storage and conversion
use modest while the feature beds in; they are env-tunable, so raising them is a deploy, not a release.
The 10 MB PDF default fits the smaller provider plans' image limit. 25 MB of video is roughly 10–20 s
of full-quality phone video or a minute or more at the phone's reduced "share" quality, so the editor
copy says to choose a shorter clip or a smaller size when one is refused.

## D394 — Service worker caches only Cloudinary images

**Decision**: narrow the `cloudinary-images` CacheFirst route to `request.destination === 'image'`
(images, PDF pages, posters, waveforms). Audio and video requests go to the network (range requests,
large bodies). CSP gains `media-src 'self' https://res.cloudinary.com`. No `frame-src`/`worker-src`
change (D391).

**Why**: caching opaque range responses breaks seeking and would evict hundreds of images.

## D395 — Ingestion: the first supported file decides; no LLM for non-image files

**Decision**: the share target accepts `image/*, application/pdf, audio/*, video/*`; `POST /ingest` and
email-in accept the same MIME families (sniffed by magic bytes, as images are today). If the first
supported file is an image, today's flow runs, except that an image proposal now holds every shared image
(up to `INGEST_MAX_IMAGES`, still 3) as a gallery in share order (D398); the model's alt text goes to
the cover and the other photos have none (D206 allows that). PDF, audio and video files in the same
share are then unused (`extra_file`). If it is a PDF, audio or video file, the job
uploads it (server upload, `resource_type` per D388, eager per D392), builds the proposal directly
(`extraction.model = 'direct'`): title = the share title or email subject, else the first line of the
text, else the file name without extension; body = the remaining share text when it fits the body limit,
otherwise empty (limits reject, never clamp: the text is not cut, the drop is logged as
`ingest.media_proposal` `body: 'dropped_too_long'` and the publisher can add a caption); `sourceUrl` = the shared URL if any. Other
files are reported as unused on the share status.

**Why**: content extraction from PDFs, audio and video is out of scope (spec Assumptions), and sending
a 20 MB video to a model to get a title is waste. A deterministic title satisfies FR-025 with or without
an AI key (constitution VII).

**Rejected**: sending PDFs to the model as document input (cost, provider variance, no search benefit
while content search is out); copying files from shared URLs (spec Assumptions).

## D396 — Media dedup by content fingerprint

**Decision**: assets store the provider's `etag` (content MD5). Media dedup adds a signal before the
existing ones: a live or archived media card in the same deck holding an asset with the same `etag` as any file
of the proposal (for a gallery, any photo) → verdict
`possible_duplicate` with `via: 'file'`. It never returns `update` (identical bytes are not new content
to merge). Auto-publish already skips `possible_duplicate`.

## D397 — Public pages and share previews per kind

**Decision**: `toPublicItem` gains an allow-list for media payloads: `kind`, `images[]` of
`{ publicId, alt, width, height }`, and `publicId, alt, width, height, durationMs, pages` for the other
kinds (no `fileName`, `bytes`, `format`: a file name can carry personal details).
`render-item.ts` renders without JS: each photo in order (a single image exactly as today); video `<video controls preload="none" poster>`;
audio `<audio controls preload="none">` plus duration; PDF page-1 `<img>` linked to the original with
"PDF · N pages". Share preview image order: image (a gallery's cover) → video still (`so_auto`, `c_fill,w_1200,h_630`) →
PDF page 1 (`pg_1,c_fill,g_north,w_1200,h_630`) → generated card image for audio. The share content hash
includes `kind`.

## D398 — A photo card is a gallery of 1–8 images

**Decision**: the image-kind payload is `{ kind: 'image', images: [{ publicId, alt?, width, height }] }`
with 1 to `MEDIA_GALLERY_MAX` (8, a constant in `@gobbit/shared/media`, not an env var: it bounds the
payload) entries in display order; the first is the cover. The other kinds keep a flat
`{ kind, publicId, alt?, … }`. The Zod schema is a discriminated union on `kind`; the DB checks
`jsonb_array_length(payload->'images') BETWEEN 1 AND 8` and that every entry has a non-empty `publicId`
(`jsonb_path_exists`, immutable, so a plain CHECK). `mediaReference()` checks every photo (own deck,
`kind = 'image'`, not rejected, no repeats within the card) and fills each photo's dimensions from its
asset. Per-photo `alt` is capped at `MEDIA_ALT_MAX` (200 code points) on input so 8 photos always fit
the 8192-byte payload limit; existing longer alts are kept by the migration and only need shortening if
the member edits that card. The card body stays the caption for the whole card.

Lookups that ask "which media card holds this file" (sweep `isReferenced`, dedup, share preview) use
`payload @> '{"images":[{"publicId":…}]}' OR payload @> '{"publicId":…}'`, served by one GIN
(`jsonb_path_ops`) partial index on media payloads that replaces `items_image_public_id_idx`.
`item_search_text()` indexes every photo's alt via `jsonb_path_query_array(payload, '$.images[*].alt')`.

Reader: a single image renders exactly as today. A gallery shows its cover through `CloudImage` (its
own aspect ratio, no layout shift) with an "N photos" badge; tapping opens the page viewer (D399). The
card itself never scrolls horizontally, so it doesn't fight Browse's horizontal card swipe (ADR-065).
Editor: multi-select picker, per-photo upload state, description, move earlier/later and remove (no
drag library); paste and camera add to the gallery; saving waits for every upload.

**Why**: a gallery is the same file kind and the same reader/editor surfaces as a photo, so it belongs
to the image kind rather than being a fifth kind. Deciding the array shape now, while the migration is
already reshaping every photo card, avoids a second payload migration. Always an array (even of one)
gives every reader one code path.

**Rejected**:
- *A fifth kind `gallery`*: two kinds for photos, and converting 1 ↔ 2 photos would change the kind.
- *Flat cover fields plus an `extra: [...]` array*: two places for the same fact, and every reader must
  merge them.
- *Galleries of mixed kinds*: a different viewer per slide; no demand yet.
- *An inner horizontal carousel on the card*: conflicts with Browse's swipe between cards.

## D399 — One lazy page viewer for galleries and PDFs

**Decision**: `cards/media/PageViewer` is a lazy full-screen `<dialog>` that takes a list of pages
(`{ source, width, height, alt }`), shows "k of N", zoom steps and native scroll (horizontal scroll-snap
for photos, vertical for PDF pages), and arrow-key navigation; it restores focus to the card on close.
The gallery passes its photos; the PDF card passes `pg_1…pg_N` sources and adds "Open original".

**Why**: the two viewers differ only in scroll axis and one action; one chunk keeps the initial bundle
untouched and halves the viewer tests.

**Rejected**: two separate viewers; a lightbox library (constitution VI, ADR-065 no gesture library).

## D400 — Facade first: media cards cost nothing until a member reaches for them

**Decision**: every media card loads in three tiers.

1. **Facade (in the list, always)**: an eager, tiny `MediaFacade` renders the card from the payload
   alone: the cover, still or page-1 picture through `CloudImage` (with the existing list `loading`
   rules), the kind badge ("N photos", "PDF · N pages", duration) and the play/open button. The box is
   sized from payload dimensions. No `<video>`/`<audio>` element, no player or viewer code, no
   metadata request. This is why duration, pages and dimensions are server-owned payload facts (D390):
   showing them never touches the file.
2. **Intent prefetch**: the player or viewer chunk is imported (and kept in a module cache, the D290
   pattern) on the first sign of intent: `pointerdown`, `focus` or hover on the facade, or the card
   becoming Browse's current card. When a media card has been on screen for a second, the chunk for its
   kind is also prefetched in `requestIdleCallback`, unless the connection reports `saveData`. Each
   chunk is a few KB, so this costs little and makes the tap feel instant.
3. **Activation (on tap)**:
   - **Video and audio**: the media element is mounted on intent (`preload="none"`, so no bytes yet),
     and `play()` is called synchronously in the click handler. iOS only lets sound play from inside a
     user gesture.
   - **Viewer**: it opens showing the picture the card already loaded, then swaps in the sharper one.
     It loads only the current photo or page ± 1; PDF pages use `loading="lazy"` with boxes reserved
     from page 1's dimensions.
   - **Bytes**: media bytes come from the eager renditions (D392), so the first frame doesn't wait for a
     conversion.

**One active player**: activating a player returns the previous one to its facade. Returning to the
facade pauses the player and releases its buffer (`removeAttribute('src')` and `load()`). Closing the
viewer, leaving Browse's current position or leaving the deck does the same. `use-exclusive-playback`
becomes this "active media" store. At most one media element is alive, which keeps memory flat on phones.

**Failure**: a chunk that fails to load (offline, stale deploy) leaves the facade in place with
"Couldn't open · Retry", never an error boundary.

**Guards**:
- `initial-chunks.ts` `LAZY_ONLY_MARKERS` gains markers for the viewer and players, so CI fails if one
  leaks into the initial bundle.
- `pnpm budget` holds initial growth to ≤ 5 KB (SC-005).
- A unit test renders 20 video cards and asserts zero media elements.
- A full e2e test counts requests: no video or audio bytes before a tap, and no viewer chunk before
  intent or idle.

**Why**: an eagerly mounted `<video preload="none">` still costs a DOM media element, a decoder slot on
some phones, and on iOS sometimes a metadata request. With a list of video cards that adds up, while a
facade costs one image. Lazy-loading the whole card (the first draft) would show a placeholder until a
chunk arrived for every PDF, video and audio card in a list. Prefetching on intent hides the chunk
fetch behind the ~100 ms between `pointerdown` and `click`.

**Rejected**:
- *Mounting players in the list with `preload="none"`*: many media elements, and iOS metadata fetches.
- *Lazy-loading the whole card body*: a visible placeholder flash per card.
- *Prefetching every chunk at app start*: it spends members' data on kinds a deck may not have.

## Not decided here (left to `/speckit-clarify` if wanted)

- Content search (PDF text, transcripts): out of scope per spec Assumptions; would be its own feature with
  an `item_search_text` change and an extraction job.
- Chunked uploads for videos over 100 MB (not needed at the starting limits).
- Raising the gallery limit above 8, or the per-share photo limit above 3 (the share body limit is the constraint).
