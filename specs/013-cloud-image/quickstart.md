# Quickstart: Responsive images — `CloudImage`

Validates [spec.md](./spec.md) end to end. Setup per `README.md` (`pnpm dev`, a signed-in member, `CLOUDINARY_URL` set). Contract: [cloud-image](./contracts/cloud-image.md).

## 1. Automated

```sh
pnpm test:unit                       # CloudImage, use-element-width, ImageCard, CardBody, BrowseStack, cloudinary
pnpm test:e2e -- items.spec.ts browse.spec.ts
pnpm build:web && pnpm budget        # ≤ +1 KB gzip vs. the previous build
```

## 2. Lighthouse (PLAN.md Phase 7 demo 2)

1. On the deployed instance, create a test category with 20 image cards. Use stock or generated test photos of varied proportions, uploaded after 012 so they have dimensions.
2. Chrome DevTools → Lighthouse → Navigation, mode **Mobile**, categories Performance. Run on the list view of that category.
   - "Properly size images" is absent (SC-001).
   - CLS < 0.05 (SC-002).
   - The film strip shows the first screen of cards with placeholders by 1.5 s (SC-003).
3. Repeat with **Desktop**. "Properly size images" is again absent.
4. Tick demo 2 in `PLAN.md`.

## 3. By hand

1. Network → Slow 4G, disable cache, reload the list. Each image shows a blurred version in a box of the right shape. Nothing below an image moves when it sharpens.
2. DevTools → Rendering → emulate `prefers-reduced-motion: reduce`, then reload. The sharp image appears without a fade.
3. Inspect a list image. `sizes` is the column width in px (e.g. `576px` on desktop, `328px` on a 360 px phone). `width`/`height` match the photo.
4. Resize the window from 1280 px to 400 px and scroll to images not yet loaded. Their `sizes` follow the new width.
5. An image card created before 012 (no dimensions) shows a 4:3 box with the whole photo letterboxed.
6. Browse: the current card's image has `fetchpriority="high"` and `loading="eager"`. The next card's is lazy.
7. Editor: upload a photo. The preview shows it immediately in a box of the right shape.
8. Go offline after viewing the list once. The images still show from the cache.
