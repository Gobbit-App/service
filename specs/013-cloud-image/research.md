# Research: Responsive images — `CloudImage`

Decisions continue the project-wide D numbering. Phase 7 reserves D156–D173. This feature owns **D161–D162**.

## Why the list fails the Lighthouse check today

`ImageCard` defaults to `sizes="100vw"` (`cards/ImageCard.tsx`). Only Browse passes a measured `sizes` (009, `browse/use-image-sizes.ts`, D144). In the list, the card column is at most about 608 px wide, but the browser is told the image fills the viewport:

- on a 1280 px desktop it picks the 1080 w variant for a ~600 px box;
- on Lighthouse's mobile preset (412 px at DPR 1.75) `100vw` × 1.75 = 721 px, so it picks 1080 w for a box that needs about 665 px.

Both cases trigger "properly size images". The fix is to tell the browser the real shown width. More widths are not needed.

## D161 — `CloudImage`: measured `sizes`, reserved box, blurred placeholder

- **Decision**: a new `apps/web/src/cards/CloudImage.tsx`, the only renderer of stored (Cloudinary) images. It is built on the existing `cards/cloudinary.ts` (`IMAGE_WIDTHS` 360/720/1080, `cloudinaryImageUrl`, `cloudinarySrcSet`).
  - **Sizes**: `use-element-width.ts` measures the wrapper with one shared `ResizeObserver` (one observer for all images, callbacks keyed by element). `sizes` is `<measured>px`. Before the first measurement it falls back to `imageSizesFor(window.innerWidth)`, the 009 estimate, which moves from `browse/` to `cards/`. Browse's `useImageSizes` and the `sizes` prop are removed; `priority` stays.
  - **Box**: the `<img>` gets `width` and `height` attributes from the payload (012, D160). The browser then derives `aspect-ratio` before load, with no inline style. Without dimensions, the wrapper gets the class `cloud-image--unknown`, a 4:3 box with `object-fit: contain`. A CSS cap of `max-height: min(70vh, 640px)` with `object-fit: contain` keeps extreme ratios in check.
  - **Placeholder**: a second `<img>` underneath with `src = …/f_auto,q_1,e_blur:2000,w_32/<publicId>`, about 300–600 bytes, `aria-hidden`, `decoding="async"`, eager. The sharp image fades in with a CSS opacity transition when `onLoad` fires (`cloud-image--loaded`). `prefers-reduced-motion: reduce` removes the transition. The placeholder is unmounted after load or error.
  - **Loading**: `loading="lazy"` by default. `priority` sets `eager` and `fetchPriority="high"`, and it also loads the placeholder eagerly.
  - **Errors**: `onError` → "Image unavailable" (the existing copy), with the box kept.
- **Rationale**:
  - The browser already combines `sizes` with DPR to pick from `srcset`. Measuring the container is the only missing input, and it covers every place an image appears (list, card page, Browse, editor), not just Browse.
  - `width`/`height` attributes are the standard way to stop layout shift without inline styles (project rule: no inline styles).
  - A blurred tiny variant is what the master plan asks for and costs one small request. The service worker cache already covers `res.cloudinary.com`.
- **Alternatives considered**:
  - **Computing the width × DPR in JS and setting `src` directly** (the master plan's wording): this duplicates what `srcset` does natively, breaks the browser's own choice on zoom, and needs a re-render on resize.
  - **More widths** (e.g. 480/600/840): this doesn't fix `100vw`, adds derived versions per image, and fills the cache faster.
  - **Dominant-colour placeholder** (Cloudinary `colors` on upload): needs upload-time analysis and a stored colour. A solid colour is less informative than a blur.
  - **BlurHash/ThumbHash**: needs a library and a stored hash per image, so a dependency and a migration for a marginal gain.
  - **`<picture>` with format sources**: `f_auto` already negotiates the format.

## D162 — Placeholders in the image cache; remote preview images unchanged

- **Decision**:
  - The service worker's `cloudinary-images` cache (`sw.ts`, `CacheFirst`, `maxEntries: 300`) also stores placeholder URLs. Placeholders are about 1/100 the size of a 720 w image, so `maxEntries` rises to **600** to keep the same number of sharp images cached.
  - Remote (non-Cloudinary) link preview images keep the existing plain `<img>` in `LinkCard` until [`014-link-snapshots`](../014-link-snapshots/research.md) stores a snapshot. They get no placeholder, because they aren't on Cloudinary.
  - The client never builds Cloudinary "fetch" URLs for remote images.
- **Rationale**: if the cache size stayed the same, placeholders would evict sharp images and make offline reading worse. Cloudinary fetch URLs would make Cloudinary fetch arbitrary third-party URLs on each view, outside the server's guarded fetcher (constitution IV). 014 copies preview images once, on the server, instead.
- **Alternatives considered**:
  - Excluding placeholders from the cache: offline, a viewed card would show a blank box until the sharp image arrives, and without a network it never does.
  - A separate cache for placeholders: more service worker code for the same effect.

## Other choices (no new D-number)

- **Location**: `cards/CloudImage.tsx` and `cards/use-element-width.ts`, next to `cloudinary.ts`. `ImageCard` keeps the figure and error copy and delegates the `<img>` to `CloudImage`. `ImageFields` (editor preview) keeps rendering `ImageCard`, so it gets the new behaviour without its own code.
- **Bundle**: the component and hook are in the initial chunk because the list renders images. The estimate is about 0.6 KB gzip; the budget check (`pnpm budget`) gates it at +1 KB.
- **Lighthouse**: run manually against the deployed instance for demo 2, on the mobile and desktop presets. No Lighthouse CI dependency is added (constitution VII). The quickstart records the steps.
- **Hydration of dimensions**: offline caches written before 012 hold image payloads without `width`/`height`. They render with the default box until the next refetch, and need no migration.
