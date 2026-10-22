# Data Model: Responsive images — `CloudImage`

No tables, columns, migrations, routes or DTO changes. This feature reads the image payload's optional `width` and `height`, added by [`012-media-assets`](../012-media-assets/data-model.md) (D160).

## Inputs used

| Source | Field | Use |
|--------|-------|-----|
| `imagePayloadSchema` | `publicId` | Delivery and placeholder URLs |
| `imagePayloadSchema` | `alt` | `alt` of the sharp image (the placeholder is `aria-hidden`) |
| `imagePayloadSchema` | `width?`, `height?` | `<img width height>` → reserved aspect ratio; missing → default 4:3 box |
| `GET /config` | `cloudinaryCloudName` | Unchanged; `null` → "Image unavailable" |
| link `preview.publicId?`, `width?`, `height?` | (from 014) | Same component for snapshotted link previews |

## URLs (`cards/cloudinary.ts`)

| Variant | Transformation | Notes |
|---------|----------------|-------|
| Sharp | `f_auto,q_auto,c_limit,w_{360\|720\|1080}` | Unchanged (008/009), in `srcset` |
| Default `src` | `f_auto,q_auto,c_limit,w_720` | Unchanged; for browsers that ignore `srcset` (PLAN.md demo 1) |
| Placeholder | `f_auto,q_1,e_blur:2000,w_32` | New `cloudinaryPlaceholderUrl()` |

## Service worker cache (`apps/web/src/sw.ts`)

`cloudinary-images`: `maxEntries` 300 → **600** (D162); `maxAgeSeconds` 30 days and `CacheFirst` unchanged.

## Constants (web only, `cards/cloudinary.ts`)

- `IMAGE_WIDTHS = [360, 720, 1080]`, unchanged.
- `PLACEHOLDER_WIDTH = 32`.
- `DEFAULT_ASPECT = 4 / 3`; the box CSS lives in `styles.css`.
