# Quickstart: Share visuals

How to check the feature works. Contracts: [crawler-identity](./contracts/crawler-identity.md), [preview-builder](./contracts/preview-builder.md), [decision-events](./contracts/decision-events.md).

## 1. Automated

```sh
pnpm typecheck && pnpm lint
pnpm test:unit   # page-images (+ corpus SC-002/SC-003), lookup-hosts, build-preview, locked-host-preview, extract-validate/prompt, link-snapshot, link-preview-fields
pnpm test:int    # link-preview, link-snapshot, ingest-pipeline, links-image-backfill, link-checks (UA)
```

Expected:

- The corpus test reports at least 90% of image-bearing pages found, and no OG-only page lost.
- The integration fixture server records `GobbitBot/1.0` on page, oEmbed and image requests, and the browser identity on link checks.

## 2. Local share with a richer page

1. Run `pnpm dev` with Cloudinary configured.
2. Paste a link to a page with no `og:image` but a large article image (any blog post).
3. The proposal shows the article image. After the snapshot job, the card's preview has `publicId`.
4. Logs: `link_preview.built` with `imageSource: "article"`, then `link_snapshot.image` with `outcome: "copied"`.

## 3. Video host lookup

1. Paste a YouTube link.
2. The proposal carries the video title and thumbnail. If the page already had them, `lookup` is `skipped`.
3. Turn the network off for oEmbed (or use a bogus video id). The share still succeeds, and `link_preview.lookup` shows `failed` or `empty`.

## 4. Remove photo is respected

1. On a link card with a picture, choose Edit → Remove photo → Save.
2. In the database, the card's `payload.preview.imageRemoved` is `true`.
3. Run `pnpm links:image-backfill --dry-run`. The card is not listed.

## 5. Post-deploy (production, manual, SC-001)

1. Share a public Instagram post from a phone with no caption.
2. If the card shows the post's picture and real title, Instagram answers GobbitBot.
3. If not, check `link_preview.built` for `host: "instagram.com"`:
   - `discarded` with `login_wall` means Instagram walls the production server. 015 behaviour still applies: the caption plus the member's image.
   - Record the result in `implementation-notes.md`.

## 6. One-time pass (operator)

Run inside the API container (see `docs/design/links.md`):

```sh
pnpm links:image-backfill --dry-run   # counts only
pnpm links:image-backfill             # enqueue, ≤ 1 request a minute per host
```

Check:

- The `link_snapshot.backfill` summary line.
- `link_snapshot.image` outcomes over the following hours.
- A rerun enqueues 0.
