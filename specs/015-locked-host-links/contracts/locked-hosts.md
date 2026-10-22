# Contract: Links from locked social hosts

No new routes. Changes to existing behaviour only. Errors are `application/problem+json` (RFC 9457).

## 1. `lockedHostOf(url)` (`@pb/shared/links`)

| Input | Output |
|-------|--------|
| `https://www.instagram.com/p/abc/` | `{ host: 'instagram.com', label: 'Instagram' }` |
| `https://m.facebook.com/story.php?…` | `{ host: 'facebook.com', label: 'Facebook' }` |
| `https://fb.watch/xyz/` | `{ host: 'fb.watch', label: 'Facebook' }` |
| `https://vm.tiktok.com/…` | `{ host: 'tiktok.com', label: 'TikTok' }` |
| `https://twitter.com/…` | `{ host: 'twitter.com', label: 'X' }` |
| `https://notinstagram.com/` | `null` |
| `https://instagram.com.example.test/` | `null` |
| `ftp://instagram.com/`, `not a url` | `null` |

## 2. Ingest proposals (worker)

When the share's URL is on a locked host, the proposal is:

```json
{
  "type": "link",
  "sourceUrl": "https://www.instagram.com/p/abc/",
  "payload": {
    "url": "https://www.instagram.com/p/abc/",
    "preview": {
      "title": "Lemon olive oil cake",
      "description": "Grandma's cake, 3 eggs, 200 g sugar …",
      "publicId": "gobbit/ingest/<deckId>/…",
      "width": 1080,
      "height": 1350
    }
  }
}
```

- `title`: the OG title unless it is generic (equal to the label or the site name), else the extracted title.
- `description`: the OG description, else the shared text trimmed to 500 code points.
- `publicId`/`width`/`height`: the first shared image, when there is one.
- No `image` when `publicId` is set.

## 3. `POST /decks/{id}/items`, `PATCH /items/{id}` (link cards)

- `payload.preview.publicId` may be sent by the editor's "Add photo". It must be a recorded asset of the same deck (D160), else 422 `/problems/validation` (`pointer: /payload/preview/publicId`, "Unknown image").
- When `url` or `preview.image` changes, the stored `preview.publicId`/`width`/`height` are dropped **only** when that asset's source is `link_snapshot`.

## 4. `POST /items/{id}/link-check` (from 014)

New answer for locked hosts:

| Status | When |
|--------|------|
| 422 | `/problems/validation`, `detail: "Links to Instagram can't be checked automatically"` (label from the registry). No probe; does not count toward the rate limit |

## 5. Sweep (from 014)

Locked-host cards get `status = 'unchecked'`, with no request made. They never appear in `?flag=link` and never have `linkHealth`.

## 6. Web

| Element | Behaviour |
|---------|-----------|
| `LinkCard` | Host label ("Instagram") instead of the domain line when `lockedHostOf` matches |
| Link editor preview | "Add photo" / "Remove photo" (signed upload, as image cards) next to "Fetch preview" |
