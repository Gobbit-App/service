# Quickstart: validating card cover images

Shapes and rules: [data-model.md](data-model.md), [contracts/items-cover.md](contracts/items-cover.md).
Decisions: [research.md](research.md).

## Setup

```bash
pnpm install && pnpm db:migrate && pnpm dev
# Cloudinary (CLOUDINARY_URL) is needed for real uploads, as for photo cards.
# Without it, cover upload behaves exactly like photo-card upload does; tests use the fake in e2e/fixtures/cloudinary.ts.
```

## Automated

```bash
pnpm test:unit   # supportsCover list, cover input schema (strict, dims refused), diffFields 'cover',
                 # CoverBar (only when set, nothing on error), EventCard hides the link image with a cover,
                 # CoverField states + pick/drop/paste, use-drop-image, usePasteImage scope (event rule),
                 # draft cover round-trip + withType clearing, share imageFor order
pnpm test:int -- items-cover media-sweep public share   # CHECK + down file round trip, 422s (type, unknown,
                 # other deck), dims from asset, item_events 'cover', sweep keeps referenced / frees removed,
                 # public DTO + public search have no cover, ingestion/import never set one
pnpm test:e2e -- --grep @smoke editor   # add a cover to a text card → bar in the deck list
pnpm test:e2e -- --grep @full cover     # replace/remove, drop, paste on an event, failed upload keeps
                                        # old, draft restore, Browse, review queue, type-switch warning,
                                        # event shows one image, no cover on link/photo
```

## Manual

1. **Add** (SC-001): on a phone, open an existing text card → Edit → "Add image" → pick a photo of
   the dish. The preview shows it as a bar below the title, shaped like a link's preview. Save. The
   deck list shows the bar between the title and the body.
   - On a desktop, drag an image file onto the field, then try pasting a screenshot. Both set the
     cover.
   - On an event card with a link: with focus in the cover field, a paste sets the cover. With focus
     elsewhere, a paste goes to the link's photo as today.
2. **No regression** (SC-004): a card without a cover image looks as it did before. Compare a list
   screenshot from `main`.
3. **Layout** (SC-002): at 360 px wide, mix 20 cards with and without cover images and long titles. Reload
   with "Slow 4G" throttling. Nothing jumps as the cover images load.
4. **Replace / remove**: Replace with another photo, then save. Remove it, then save. The deck's
   Activity shows two `updated` lines naming "image".
5. **Failure**: in DevTools, block `api.cloudinary.com` and try Replace. You see the error, the old
   cover image is still in the preview, and Save still works for a title change.
6. **Draft**: start adding a cover image to a new text card, then reload the page. The restored draft
   still has the cover image.
7. **Type switch**: on a new text card with a cover image, switch the type to Link. The confirmation says
   the image will be removed. Switch to Table instead, and the cover image stays.
8. **Browse**: open Browse on the deck and swipe between a card with a cover image and one without. The
   card doesn't jump. Open the full view, and the cover image is below the title.
   - An event with a link and a cover shows the cover bar, and its link box has no image. Block the
     cover image: the link image comes back. An event with no link and no cover shows the generic
     event image (D396).
9. **Review**: share a page to the deck. In the review queue, edit the proposal, add a cover image,
   publish. The proposal had none before (FR-011).
10. **Share** (D393):
    - Make the card public (public deck, public category) and share `/s/<id>`. The preview is the
      generated card (title, excerpt) with the cover image in the right-hand panel.
    - Add a cover image to a public event card that has a preview image. The preview shows the cover image,
      not the event's image. Remove the cover image, and the event's image is shown in the panel.
    - Change the cover image and share again. The preview image URL changes.
    - Share a card with a cover image from a private deck. The preview is the generic private image and
      text, with nothing from the card.
11. **Missing image**: delete the cover's image in Cloudinary. The card renders without the bar, as a
    link card does when its preview fails.
12. **Clean-up** (SC-003): covered by `media-sweep` integration tests, which move the clock past the
    7-day grace. A removed cover's image is deleted, and an image still used by an archived or
    soft-deleted card is kept.

## API smoke (`api.http`)

```http
PATCH {{base}}/items/{{itemId}}
Authorization: Bearer {{SMOKE_SESSION_TOKEN}}
Content-Type: application/json

{ "cover": { "publicId": "{{recordedPublicId}}" } }
```

Expect 200 with `cover.width`/`height` from the asset. The same request on a link card → 422
`cover`. `{ "cover": null }` removes it.
