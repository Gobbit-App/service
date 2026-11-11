# Quickstart: validating card avatars

Shapes and rules: [data-model.md](data-model.md), [contracts/items-avatar.md](contracts/items-avatar.md).
Decisions: [research.md](research.md).

## Setup

```bash
pnpm install && pnpm db:migrate && pnpm dev
# Cloudinary (CLOUDINARY_URL) is needed for real uploads, as for photo cards.
# Without it, avatar upload behaves exactly like photo-card upload does; tests use the fake in e2e/fixtures/cloudinary.ts.
```

## Automated

```bash
pnpm test:unit   # supportsAvatar list, avatar input schema (strict, dims refused), diffFields 'avatar',
                 # avatarUrl builder, CardAvatar (empty circle on error, aria-hidden), AvatarField states,
                 # draft avatar round-trip + withType clearing, share imageFor order
pnpm test:int -- items-avatar media-sweep public share   # CHECK + down file round trip, 422s (type, unknown,
                 # other deck), dims from asset, item_events 'avatar', sweep keeps referenced / frees removed,
                 # public DTO + public search have no avatar, ingestion/import never set one
pnpm test:e2e -- --grep @smoke editor   # add an avatar to a text card → circle in the deck list
pnpm test:e2e -- --grep @full avatar    # replace/remove, failed upload keeps old, draft restore, Browse,
                                        # review queue, type-switch warning, no avatar on link/photo
```

## Manual

1. **Add** (SC-001): on a phone, open an existing text card → Edit → "Add image" → pick a photo of a
   face. The preview shows a circle cropped to the face. Save. The deck list shows the circle before
   the title.
2. **No regression** (SC-004): a card without an avatar looks as it did before. Compare a list
   screenshot from `main`.
3. **Layout** (SC-002): at 360 px wide, mix 20 cards with and without avatars and long titles. Reload
   with "Slow 4G" throttling. Titles stay aligned and nothing jumps as the avatars load.
4. **Replace / remove**: Replace with another photo, then save. Remove it, then save. The deck's
   Activity shows two `updated` lines naming "image".
5. **Failure**: in DevTools, block `api.cloudinary.com` and try Replace. You see the error, the old
   avatar is still in the preview, and Save still works for a title change.
6. **Draft**: start adding an avatar to a new text card, then reload the page. The restored draft
   still has the avatar.
7. **Type switch**: on a new text card with an avatar, switch the type to Link. The confirmation says
   the image will be removed. Switch to Table instead, and the avatar stays.
8. **Browse**: open Browse on the deck and swipe between a card with an avatar and one without. The
   title row doesn't jump. Open the full view, and the avatar is beside the title.
9. **Review**: share a page to the deck. In the review queue, edit the proposal, add an avatar,
   publish. The proposal had none before (FR-011).
10. **Share** (D393):
    - Make the card public (public deck, public category) and share `/s/<id>`. The preview is the
      generated card (title, excerpt) with the avatar as a circle.
    - Add an avatar to a public event card that has a preview image. The preview shows the avatar,
      not the event's image. Remove the avatar, and the event's image is shown in the side panel.
    - Change the avatar and share again. The preview image URL changes.
    - Share a card with an avatar from a private deck. The preview is the generic private image and
      text, with nothing from the card.
11. **Missing image**: delete the avatar's image in Cloudinary. The card shows an empty circle and
    still renders.
12. **Clean-up** (SC-003): covered by `media-sweep` integration tests, which move the clock past the
    7-day grace. A removed avatar's image is deleted, and an image still used by an archived or
    soft-deleted card is kept.

## API smoke (`api.http`)

```http
PATCH {{base}}/items/{{itemId}}
Authorization: Bearer {{SMOKE_SESSION_TOKEN}}
Content-Type: application/json

{ "avatar": { "publicId": "{{recordedPublicId}}" } }
```

Expect 200 with `avatar.width`/`height` from the asset. The same request on a link card → 422
`avatar`. `{ "avatar": null }` removes it.
