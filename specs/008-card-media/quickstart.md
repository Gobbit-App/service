# Quickstart: Card media

Validates [spec.md](./spec.md) end to end. Setup per `README.md` (`pnpm dev`, a signed-in member). Contracts: [media-sign](./contracts/media-sign.md), [link-preview](./contracts/link-preview.md).

## 1. Automated

```sh
pnpm test:unit                       # sign-upload, services, upload helper, fields
pnpm test:int                        # media.int, link-preview.int (Docker)
pnpm api:openapi && git diff --exit-code packages/api-client
pnpm test:e2e -- editor.spec.ts      # against a running stack
```

## 2. API by hand (`api.http` style, `SMOKE_SESSION_TOKEN`)

1. `POST /decks/<deckId>/media/sign` → 200 with `folder: gobbit/items/<deckId>`, `tags: editor,deck:<deckId>`, no secret.
2. Same call with `CLOUDINARY_URL` unset → 503 `/problems/unavailable`.
3. As a reader member → 403. With an unknown deck → 404.
4. `POST /decks/<deckId>/link-preview {"url":"https://example.org/"}` → 200 with `preview.title`.
5. `{"url":"http://127.0.0.1:3000/health"}` → 200 `{ "preview": null }`, and no request appears in the API log as an inbound hit.
6. Make 31 lookups within an hour → the last answers 429 with `Retry-After`.

## 3. On the phone (deployed instance)

1. Open a test deck → Add card → **Image** → take a photo. Progress shows; Save stays disabled until alt text is filled in.
2. Cancel an upload halfway → no photo attached. Pick again → upload finishes → add alt text and a category → Save. The card shows the photo in the list and in the preview.
3. Edit the card → **Replace** the photo → Save → the new photo shows.
4. Add card → **Link** → paste a public article URL → **Fetch preview** → title, description and image fill in → edit the title → Save.
5. Paste a URL to a local address → **Fetch preview** → "No preview available"; Save still works.
6. iPhone: pick a HEIC photo from the gallery → upload succeeds and the card renders.
7. Together with `007-card-editor`: one card of each type renders identically in the list and the preview (PLAN.md Phase 6 demo 1).
