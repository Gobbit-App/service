# Feature Specification: Media cards (photo, PDF, audio, video)

**Feature Branch**: `feat/045-media-cards` | **Created**: 2026-11-11 | **Status**: Draft

**Input**: Evolve the "image" card type into a "media" card type that, besides images, supports PDF documents, audio and video, all stored in the app's existing media storage, each with its own viewer or player in the reader (and suitable rendering on public pages and share previews). Existing image cards must keep working.

## User Scenarios & Testing

Families keep more than photos and notes: the school's term calendar arrives as a PDF, the appliance manual is a PDF, grandma's voice message is an audio clip, and the video of how to reset the boiler is the one thing everyone needs once a year. Today the only file a card can hold is a single photo, so these end up as links to someone's drive, or nowhere, and the eight photos from the school play need eight cards. A media card holds a gallery of up to 8 photos or one file of the other kinds, and lets every member read, listen to or watch it in the app.

### User Story 1 — Existing photo cards keep working as media cards (P1)

Every photo card that exists today becomes a media card holding an image. Members see, edit, share and search it exactly as before.

**Why this priority**: the change must not break the cards people already have. Everything else builds on the evolved type.

**Independent test**: take a deck with photo cards created before the change, apply the change, and open the deck list, Browse, the card page, the editor, the public page and a share preview. Each looks and behaves as before.

**Acceptance**:
1. **Given** a photo card created before the change, **When** a member opens it anywhere in the app, **Then** it renders with the same image, description, caption and layout as before.
2. **Given** a member running an older installed version of the app that still sends "photo/image" cards, **When** they save a new photo card, **Then** the save succeeds and the card is stored as a media card holding an image.
3. **Given** an unsaved photo-card draft kept on the device from before the change, **When** the member reopens the editor, **Then** the draft is restored as a media card holding that image.
4. Search, favorites, categories, the activity log, archive, delete and undelete behave unchanged for these cards.

---

### User Story 7 — A photo card holds a gallery of up to 8 photos (P1)

A member adds several photos to one card (the school play, the steps of a recipe, the before and after of a repair). They choose the order, and each photo can have its own description. In lists and Browse the card shows the first photo (the cover) with the number of photos. Tapping it opens a full-screen gallery where the member swipes from photo to photo, sees "3 of 6", zooms, and closes back to where they were.

**Why this priority**: it's the same card type and file kind as US1, so the stored shape of a photo card is decided once, in the first change, rather than migrated twice.

**Independent test**: create a photo card with 5 photos, reorder two and describe one; another member opens the card, swipes through all 5 in the chosen order and sees the description on the right photo.

**Acceptance**:
1. **Given** a member editing a photo card, **When** they add photos (pick several at once, take one with the camera, or paste one), **Then** each uploads with its own progress, up to 8 in total; the add action is disabled at 8 and says why.
2. **Given** a gallery in the editor, **When** the member moves a photo earlier or later or removes it, **Then** the order is kept on save; the first photo is the cover.
3. **Given** a saved gallery, **When** it shows in a list or Browse, **Then** the card shows the cover in its own shape (no layout shift) with a "N photos" label, and swiping Browse still moves between cards, never between photos.
4. **Given** a gallery, **When** the member opens it, **Then** a full-screen viewer shows the photos in order with "k of N", swipes and keyboard arrows between them, allows zoom, shows each photo's description, and closes back to the card.
5. **Given** a photo card with one photo, **Then** it looks and behaves exactly as a photo card does today (no count, no gallery chrome).
6. **Given** a gallery card, **When** it's shared or shown on a public page, **Then** the share preview uses the cover, and the public page shows every photo in order without scripts.

---

### User Story 2 — Add a PDF and read it in the app (P1)

A member who can create cards picks a PDF (say, the school calendar) from their device, gives it a title and an optional caption, and saves. Other members see the first page as the card's picture with the page count, tap it, and page through the whole document in an in-app viewer, zooming in on a page if needed. A clear action opens or downloads the original file.

**Why this priority**: PDFs are the most common household document after photos, and none can be kept today.

**Independent test**: create a media card from a three-page PDF; another member opens it, reads all three pages in the viewer and opens the original.

**Acceptance**:
1. **Given** a member in the card composer, **When** they choose a PDF within the size limit, **Then** it uploads with progress and the editor preview shows its first page and page count.
2. **Given** a saved PDF card, **When** a member views it in a list or Browse, **Then** the card shows the first page as a picture (no layout shift while it loads) and a "PDF · N pages" label.
3. **Given** a PDF card, **When** a member opens the viewer, **Then** they can scroll through every page in order, see which page they are on, zoom a page, and close the viewer back to where they were.
4. **Given** a PDF card, **When** the member chooses "Open original", **Then** the original file opens in the device's own PDF handling (new tab, download or share sheet).
5. **Given** a password-protected or unreadable PDF, **When** the member tries to add it, **Then** it is refused with a clear message and nothing is saved.

---

### User Story 3 — Add a video and play it (P1)

A member picks a video from their phone (including the formats phones record by default) and saves it as a media card. In the deck, the card shows a still from the video, the duration and a play control; playing it works inline on phones and desktops, with standard controls (play/pause, seek, volume, fullscreen). Nothing plays until the member asks.

**Why this priority**: short how-to and family videos are the second most requested kind of file after documents.

**Independent test**: upload a phone-recorded video; on another device (a different phone OS or a desktop browser) the card shows its still and duration and plays with sound.

**Acceptance**:
1. **Given** a video within the size limit in any common phone or camera format, **When** the member uploads it, **Then** the upload shows progress and the preview shows a still frame and the duration.
2. **Given** a video card, **When** it scrolls into view, **Then** it shows the still and duration and loads no video data until play is pressed.
3. **Given** a video card, **When** the member presses play, **Then** it plays inline with sound on current mobile and desktop browsers, regardless of the format it was recorded in.
4. **Given** a video card in Browse, **When** the member swipes to the next card, **Then** the video stops.
5. **Given** a portrait video, **When** it renders, **Then** it keeps its portrait shape within the card instead of being cropped or letterboxed into a landscape box.

---

### User Story 4 — Add an audio clip and listen (P2)

A member uploads a voice memo or song clip. The card shows a play control, the duration and a visual of the sound, and plays with seek and play/pause. Playback continues while the member scrolls the list but stops when they leave the deck.

**Why this priority**: valuable (voice messages, recordings of a recipe being explained) but less common than documents and video.

**Independent test**: upload a phone voice memo; another member plays it, seeks to the middle and pauses.

**Acceptance**:
1. **Given** an audio file in a common phone or desktop format within the size limit, **When** it is uploaded, **Then** the preview shows its duration and a sound visual.
2. **Given** an audio card, **When** the member presses play, **Then** it plays on current mobile and desktop browsers, whatever format it was recorded in.
3. **Given** one media card playing, **When** the member starts another, **Then** the first stops (only one plays at a time).

---

### User Story 5 — Shared files become media proposals (P2)

A member shares a PDF, audio clip or video into Gobbit from another app (the phone's share sheet), attaches one to an email sent to the deck's ingest address, or sends it through the shortcut. It becomes a proposed media card in the review queue with a title from the share (the accompanying text or subject, otherwise the file name), and a publisher approves it like any other proposal.

**Why this priority**: most of these files arrive in a chat or an email; adding them by hand means saving and re-uploading.

**Independent test**: share a PDF from a phone's files app into Gobbit; a publisher sees a PDF media proposal in Review with the right title and first page, and publishes it.

**Acceptance**:
1. **Given** a share that carries a PDF, audio or video file within the ingestion limits, **When** it is processed, **Then** a proposed media card of that kind is created, never a published one (except under the deck's existing auto-publish opt-in, with its usual checks).
2. **Given** the same file is shared twice into a deck, **When** the second share is processed, **Then** it is flagged as a duplicate of the first card.
3. **Given** a shared file of an unsupported kind or over the ingestion limit, **When** it is processed, **Then** no media card is proposed; the share falls back to what it can still propose from its text or link (as today), and the person sees why on the share's status.
4. **Given** a share with several files, **When** it is processed, **Then** the first supported file decides the kind. Further photos join a photo card as a gallery (up to the per-share photo limit). For the other kinds the first file becomes the card, and everything else is reported as not used.
5. The automatic text extraction (when the deck has it) never invents a title or description that the share didn't contain; with the extraction off, the card still gets a title from the text, subject or file name.

---

### User Story 6 — Public pages and share previews show media sensibly (P3)

On a public deck page, a media card shows its image (every photo of a gallery, in order), a playable video or audio player, or a PDF's first page with a link to the full document, all without scripts. A share preview of a private media card shows a picture: the image, the video's still, or the PDF's first page; audio cards use the generated card picture.

**Why this priority**: public decks and share previews already exist for photo cards and must not show blank cards for the new kinds.

**Independent test**: make a deck public with one card of each kind and open its public page in a browser with scripts disabled; share each card and inspect the preview.

**Acceptance**:
1. **Given** a public deck with video and audio cards, **When** a visitor opens its page with scripts off, **Then** each plays with the browser's own controls.
2. **Given** a public PDF card, **When** a visitor opens it, **Then** they see the first page and can open the original document.
3. **Given** a private video or PDF card, **When** a member shares it, **Then** the preview image is the video still or the PDF first page.

### Edge Cases

- **Wrong or disguised file**: a file whose content doesn't match its claimed kind (for example a renamed executable) is refused; nothing is stored or referenced.
- **Over the size limit**: refused before upload with the limit shown; if a client bypasses the check, the server refuses to record the file and the stored file is removed.
- **Upload interrupted** (network drop on a large video): the editor shows the failure, keeps the rest of the card and lets the member retry; no half-recorded file is referenced.
- **Changing the file's kind in the editor**: replacing a PDF with a video on the same card is allowed; the card's kind follows the file. Replacing the file keeps title, caption and categories.
- **Mixed galleries**: a gallery holds photos only. Adding a PDF, audio or video to a card that has photos asks to replace the photos (the kind follows the file); adding photos to a PDF, audio or video card works the same way in reverse.
- **Same photo twice**: a gallery can't hold the same uploaded photo twice. The same photo may still appear in different cards.
- **Gallery partly uploaded**: saving waits until every photo has finished uploading or been removed; a failed photo can be retried or removed without losing the others.
- **Photo descriptions are short**: each photo's description is limited (200 characters) so a full gallery always fits a card. Descriptions of existing photo cards are kept as they are, even if longer.
- **A gallery photo becomes unavailable**: the gallery still opens; that photo shows the "unavailable" placeholder in its place.
- **Offline**: the card text, the picture (first page, still, image) and anything already viewed are available offline; playing a video or audio clip, or opening pages not yet viewed, needs a connection and says so instead of failing silently.
- **Media storage not configured** on a deployment: media cards cannot be created (as photo cards today) and existing ones show "unavailable" placeholders instead of broken players.
- **Processing delay**: a freshly uploaded video may not be ready to play in every format immediately; the card shows the still and plays once ready, rather than erroring.
- **Very long PDF**: the viewer loads pages as the member reaches them, so a 200-page manual opens as fast as a 2-page one.
- **A file referenced by another deck**: a card may only reference a file recorded for its own deck (as photos today).
- **Clean-up**: a file no card (live, archived or within the undelete window) references is removed after the usual grace period, whatever its kind.
- **Card deleted and undeleted** within the undelete window: the file is still there.
- **Accessibility**: players and the viewer are operable by keyboard and screen reader; the card's description is the accessible text for images, stills and first pages.
- **Autoplay**: nothing plays on its own, anywhere (lists, Browse, public pages).

## Requirements

### Card type

- **FR-001** The "image" card type becomes the "media" card type. A media card holds files of one kind: 1 to 8 images (a gallery; the limit is a product constant that can be raised later), or exactly one PDF, audio or video file.
- **FR-002** Every existing image card becomes a media card of kind image with no change to what members see, and without any member action.
- **FR-003** Requests from older app versions or other clients that still create or edit cards as "image" keep working and produce media cards of kind image, for at least one release; the use of the old name is recorded so it can be retired.
- **FR-004** A media card's kind is determined by the file it holds, not chosen separately; the server decides the kind from the stored file's recorded facts, never from the client's claim alone.
- **FR-005** A media card may only reference a file recorded for its own deck; the facts shown about the file (kind, dimensions, duration, page count, size) come from the recorded file, never from the card's request.
- **FR-006** Title, caption (body), description (alternative text), categories, favorites, sources, activity log, archive/delete/undelete and permissions work for every media kind exactly as for photo cards today.

### Files and limits

- **FR-007** Accepted formats: images as today; PDF; audio in the common phone and desktop formats (including the default voice-memo formats of current iOS and Android); video in the common phone and camera formats (including the default recording formats of current iOS and Android).
- **FR-008** Each kind has its own maximum file size, enforced before upload in the app and again by the server when the file is recorded; an oversize file that reaches storage is removed. Defaults: image 8 MB (unchanged, per photo), PDF 10 MB, audio 15 MB, video 25 MB; operators can change each without a code change.
- **FR-009** Password-protected or unreadable PDFs and files whose content doesn't match their kind are refused with a field-level message.
- **FR-010** Members with permission to create cards can upload files of every kind; nobody else can. Upload rate limits apply to all kinds together.
- **FR-011** Unused files of every kind are cleaned up after the existing grace period; files referenced by any live, archived or recently deleted card never are.

### Viewing and playing

- **FR-012** A single image renders as today. A gallery shows its cover with the photo count wherever the card appears; it opens a full-screen viewer with the photos in order, "k of N", swipe, keyboard arrows, zoom and each photo's description. Inside Browse, swiping moves between cards, never between gallery photos.
- **FR-013** PDF cards show the first page as the card picture plus the page count; an in-app viewer shows every page in order, loads pages as they're reached, shows the current page number, allows zoom, and offers "Open original". The PDF itself is never executed or rendered inside the app's own pages.
- **FR-014** Video cards show a still frame and the duration; play inline with standard controls; load no video data until played; play on current mobile and desktop browsers whatever the recorded format; keep the video's own aspect ratio.
- **FR-015** Audio cards show the duration, a visual of the sound and standard controls; play on current mobile and desktop browsers whatever the recorded format.
- **FR-016** Nothing autoplays; only one video or audio card plays at a time; playback stops when the card leaves Browse's current position or the member leaves the deck.
- **FR-017** Every media card reserves its space before its picture loads (no layout shift) and degrades to a labelled "unavailable" placeholder when the file can't be loaded or media storage is off.
- **FR-018** Players and viewer are keyboard- and screen-reader-operable; the card's description (or title when none) is the accessible name of its picture.
- **FR-019** Offline: card text and already-loaded pictures show; playback and unloaded PDF pages say they need a connection.

### Editor and composer

- **FR-020** The composer offers one way to start a media card, which accepts a photo, PDF, audio or video file (including the device camera and the existing paste-an-image action); the editor shows the right preview per kind, with progress, replace and remove. For photos it accepts several files at once, up to 8 per card, with per-photo description, move earlier/later and remove; the first photo is the cover.
- **FR-021** Editor drafts (on the device) keep media choices for every kind; drafts saved before the change restore as media cards.

### Public pages and share previews

- **FR-022** Public deck pages render each media kind without scripts: the image (every gallery photo, in order); a video player with still; an audio player; a PDF's first page with a link to the original. Only the fields already allowed for public cards are exposed, plus each kind's display facts (duration, page count).
- **FR-023** A share preview of a media card uses, in order: the image (a gallery's cover), the video still or the PDF first page; audio cards use the generated card picture.

### Ingestion

- **FR-024** A share (phone share sheet, shortcut, email attachment, paste box where it accepts files) carrying a PDF, audio or video file within the ingestion limits becomes a proposed media card of that kind; images keep today's behaviour, except that when the share becomes a photo card, every shared photo within the per-share limit (unchanged at 3) is used, as a gallery, instead of only the first.
- **FR-025** The proposed card's title comes from the share's text or subject, otherwise the file's name; text extraction may shorten or tidy it but never invents content. With no AI provider configured, the proposal is still made.
- **FR-026** A file identical to one already in a deck (for a gallery, any of its photos) marks the proposal as a possible duplicate of that card.
- **FR-027** Ingestion has its own per-kind size limits (operator-changeable), within the overall share size limit; over-limit or unsupported files are not used and the share's status says so.
- **FR-028** Auto-publish applies to media proposals under the same opt-in and checks as other proposals.

### Search

- **FR-029** Media cards are found by title, caption, description (every gallery photo's) and, for PDF, audio and video, file name, as photo cards are today. The content of the file (PDF text, speech) is not searched in this feature.

### Accountability

- **FR-030** Every decision this feature adds is recorded: refused uploads (by reason: kind, format, size, unreadable), files removed for exceeding limits, files cleaned up by kind, use of the old "image" name, shared files not used (by reason) and media duplicates found.

### Key Entities

- **Media card**: a card of type media; holds its kind and either an ordered list of 1–8 photos (each with its own description and dimensions; the first is the cover) or one file reference with its display facts (dimensions for video/PDF first page, duration for audio/video, page count for PDF), and the existing title, caption, description and categories.
- **Recorded file (asset)**: a file stored for one deck, now of any kind, with its storage kind, format, size, dimensions, duration, page count and a content fingerprint for duplicate detection.

## Success Criteria

- **SC-001** 100% of image cards existing before the change render identically afterwards (visual comparison of list, Browse, card page and public page).
- **SC-002** A member can create a PDF, video or audio card from a phone in under one minute, not counting the file transfer itself.
- **SC-003** A video recorded on a current iPhone plays on a current Android phone and desktop browser, and vice versa, without the member converting anything.
- **SC-004** Opening the PDF viewer shows the first page in under 2 seconds on a typical mobile connection, regardless of the document's length.
- **SC-005** The app's initial download size grows by no more than 5 KB; viewers and players load only when a media card needs them.
- **SC-006** No media card list causes layout shift as pictures load, and nothing ever plays without a tap.
- **SC-007** A shared PDF, audio or video file becomes a reviewable proposal with the right kind and a title in 100% of shares within the limits.
- **SC-008** No file referenced by a live, archived or recently deleted card is ever removed by clean-up.
- **SC-009** A member can build an 8-photo gallery card, in the order they want, from a phone in under two minutes, not counting the uploads themselves.

## Assumptions

- **Galleries are photos only, up to 8.** PDF, audio and video cards hold one file; mixed galleries are out of scope. Ingestion keeps its per-share limit of 3 photos (shares travel through the app's server); larger galleries are built in the editor.
- **No in-app recording.** Members record with their device's camera or recorder via the file picker; in-app capture of audio or video is a later feature.
- **No content search.** PDF text and audio/video speech are not extracted, transcribed or embedded in this feature (FR-029); the caption and description carry what a member wants searchable. This is the biggest scope lever and can be revisited in `/speckit-clarify`.
- **Ingestion takes files, not file links.** A shared link that points at a PDF or video on the web stays a link card, as today; only files carried by the share become media cards. Copying web-hosted documents into storage is a later feature.
- **Starting limits are small.** Video 25 MB and audio 15 MB keep storage and conversion use modest while the feature beds in (a 25 MB phone video is roughly 10–20 seconds at full quality, a minute or more at reduced quality); operators raise them without a code change. Ingestion limits match the editor's within the overall share size limit.
- **Storage provider capabilities.** The existing media storage provider stores and converts all four kinds (format conversion for playback, page pictures for PDFs, stills for video, sound visuals for audio). The deployment must allow delivery of original PDF files for "Open original"; this is an operator setting, documented in the runbook.
- **Captions/subtitles** for video and chapter navigation are out of scope.
- **Bulk import and the notes import CLI** stay text and link only.
- **Card avatars** (044) remain images only; a media card's own picture is not an avatar.
- **Naming in the UI**: the composer and editor say "Media" with kind labels "Photo", "PDF", "Audio", "Video"; existing photo copy ("Add a photo") stays where it is specific to images.
