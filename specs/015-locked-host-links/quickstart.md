# Quickstart: Links from locked social hosts

Validates [spec.md](./spec.md) end to end. Setup per `README.md` (`pnpm dev`, a signed-in editor, `CLOUDINARY_URL` set). Contract: [locked-hosts](./contracts/locked-hosts.md).

## 1. Automated

```sh
pnpm test:unit                           # locked-hosts, extract-validate, link-snapshot, link-checks.service, LinkCard, LinkPhoto
pnpm test:int                            # ingest-pipeline.int, items.int, link-checks.int
pnpm test:e2e -- links.spec.ts
pnpm budget
```

## 2. Shared posts (PLAN.md Phase 7 demo 4)

Use a public post of your own or a public test account, not other people's content.

1. On a phone with the PWA installed, open a public Instagram post with a caption and share it to the deck. Include the post image if the share sheet offers it.
2. Open the review queue. The proposal is a **link** card to the post URL. Its preview shows the caption (trimmed to 500 characters) and the shared image, and the card shows the "Instagram" label.
3. Publish it. In SQL, `assets` has the image with source `ingest`, and the card's `payload.preview.publicId` points to it.
4. Repeat with a TikTok or X link with no image. The card has the caption and the label, and no image.
5. Share a normal web page. Ingest behaves as in 014 (OG preview, snapshot).

## 3. Add photo in the editor

1. Create a link card by hand to `https://www.tiktok.com/@example/video/1`. Fetch preview: nothing usable.
2. Tap "Add photo", pick a test image, save. The card shows the photo and the "TikTok" label.
3. Change the URL to another TikTok link and save. The photo stays.
4. Tap "Remove photo" and save. The card has no image.

## 4. Checks

1. Make one of the cards due: `UPDATE link_checks SET next_check_at = now() WHERE item_id = '<id>'` (or delete its row).
2. Run the sweep: `pnpm --filter @gobbit/api exec tsx scripts/run-job.ts link-check-sweep`. The row has `status = 'unchecked'` and null `http_status`. The worker log shows no request to the host.
3. `POST /items/<id>/link-check` answers 422 "Links to TikTok can't be checked automatically".
4. On the deployed instance, repeat section 2 steps 1–3 and tick demo 4 in `PLAN.md`.
