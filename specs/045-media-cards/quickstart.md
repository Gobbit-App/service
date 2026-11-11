# Quickstart: validating media cards (045)

Prerequisites: `pnpm install`, Docker running, a repo-root `.env` with `CLOUDINARY_URL` for a test
cloud (not production) for steps 0 and 3–6. Automated suites never call Cloudinary (constitution V);
these manual steps confirm the provider facts the plan relies on.

## 0. Provider facts (first implementation task; record results in `implementation-notes.md`)

On the test cloud:
1. Enable **Settings → Security → Allow delivery of PDF and ZIP files**.
2. Upload, with the signatures from `POST /decks/{id}/media/sign` (`kind` = pdf, audio, video), a 3-page
   PDF, an iPhone `.m4a` voice memo and an iPhone `.mov` (HEVC) clip.
3. Confirm each answer:
   - Does the upload response carry `pages` (PDF), `duration` (audio, video), `etag` and
     `original_filename`? Does the Admin API resource response carry the same `bytes`, `format`,
     `pages` and `duration` for the verify pass (D390)?
   - Does an upload of an `.mp4` under the audio signature fail (the signed `allowed_formats`, D389)?
   - Does `pg_2,f_auto,…` return page 2 (D391)?
   - Do the eager URLs in `contracts/delivery-urls.md` answer 200 once processing finishes, and 423
     before (D392)?
   - Does a password-protected PDF fail on upload or report no `pages`?
4. If any answer differs from the plan, log a deviation before building on it.

## 1. Static gates

```bash
pnpm lint && pnpm format:check && pnpm typecheck
pnpm api:openapi && git diff --exit-code packages/api-client   # no drift after regeneration
pnpm build:web && pnpm budget                                  # initial bundle ≤ 150 KB gzip, growth ≤ 5 KB (SC-005)
```

## 2. Tests

```bash
pnpm test:unit
pnpm test:int      # migration round trip, mediaReference, confirm refusals, sweep per resource type, dedup by etag
pnpm test:e2e -- --grep @smoke
```

Expected: the `0025_media_cards` round trip passes, and the down migration refuses when a PDF, audio or
video card exists.

## 3. Existing photo cards survive (US1, SC-001)

1. Check out `main`, run `pnpm dev`, create a deck with two photo cards (one with a description), and
   note their `updated_at` values.
2. Switch to the feature branch and run `pnpm db:migrate`.
3. The cards look the same in the list, in Browse, on the card page and in the editor.
4. `GET /items/{id}` returns `type: "media"`, `payload.kind: "image"` and an unchanged `updated_at`.
5. `curl` a create with `type: "image"`: it returns `201` with `type: "media"`, and the API log shows
   `item.type_alias`.

## 4. Each kind in the app (US2–US4)

In the composer choose Media:
1. **PDF**: pick the 3-page PDF. The preview shows page 1 and "PDF · 3 pages". Save, open Read, scroll
   to page 3 (the indicator shows "Page 3 of 3"), zoom, then Open original (it opens in a new tab).
2. **Video**: pick the `.mov`. The preview shows a still and the duration. Save, then play it on an
   Android phone or in desktop Chrome. Swipe away in Browse and check that it stops.
3. **Audio**: pick the `.m4a`. Check the waveform and duration, then play it. Starting the video
   pauses the audio.
4. **Negatives**:
   - An 11 MB PDF is refused before upload.
   - A renamed `.exe` saved as `.pdf` is refused.
   - Going offline and pressing play shows "Needs a connection".

## 5. Ingestion (US5)

1. With an ingest token, `POST /ingest` (multipart) with a PDF and the text "Term calendar". Review
   shows a PDF proposal titled "Term calendar".
2. Repeat the same file. The proposal is flagged as a possible duplicate (`via: file`).
3. Send a 30 MB video. The share status reports the file unused (`too_large`).

## 6. Public pages and share previews (US6)

1. Make the deck public and open `/p/<slug>` with JavaScript disabled. The video and audio play, and the
   PDF links to the original.
2. Share the video card and the PDF card, then fetch `/s/<token>`. `og:image` is the still or page 1,
   respectively.
