# Contract: `CloudImage` component

The web-internal contract for the one renderer of stored images (D161). It is not an HTTP API.

## Props

```ts
interface CloudImageProps {
  cloudName: string;          // from useCloudName(); callers handle null before rendering
  publicId: string;
  alt: string;                // '' for decorative uses (link preview image)
  width?: number;             // intrinsic px from the payload (012); omit when unknown
  height?: number;
  priority?: boolean;         // eager + fetchPriority=high (Browse current card, D144)
  className?: string;         // extra class on the wrapper
  onError?: () => void;       // caller swaps in its fallback copy
}
```

## Rendered markup

```html
<span class="cloud-image [cloud-image--unknown] [cloud-image--loaded]">
  <img class="cloud-image__placeholder" aria-hidden="true" alt=""
       src="…/f_auto,q_1,e_blur:2000,w_32/<publicId>" decoding="async">
  <img class="cloud-image__img" alt="<alt>"
       src="…/f_auto,q_auto,c_limit,w_720/<publicId>"
       srcset="…w_360/… 360w, …w_720/… 720w, …w_1080/… 1080w"
       sizes="<measured>px" width="<w>" height="<h>"
       loading="lazy|eager" fetchpriority="high?" decoding="async">
</span>
```

## Behaviour

| Situation | Result |
|-----------|--------|
| Before the first measurement | `sizes` = `imageSizesFor(window.innerWidth)` (009 estimate) |
| Container measured or resized | `sizes` = rounded container width in px; it changes only when the width moves by 8 px or more, so resizes don't make the srcset flap |
| `width`/`height` present | Box takes their aspect ratio before load |
| Dimensions absent | `cloud-image--unknown`: 4:3 box, `object-fit: contain` |
| Sharp image loaded | `cloud-image--loaded`: sharp opacity 0 → 1 (no transition with `prefers-reduced-motion: reduce`); placeholder unmounted |
| Sharp image error | Placeholder unmounted; `onError()` called |
| Any image | `max-height: min(70vh, 640px)`, `object-fit: contain` |

## Callers

| Caller | Props |
|--------|-------|
| `ImageCard` (list, card page, editor preview via `ImageFields`) | `publicId`, `alt`, `width`, `height`; `onError` → "Image unavailable" |
| Browse `ContentPane` (via `CardBody` → `ImageCard`) | as above + `priority` for the current card |
| `LinkCard` (014) | `publicId`, `alt=""`, preview `width`/`height` |

Removed: the `sizes` prop on `ImageCard`/`ImageLoading`, and `browse/use-image-sizes.ts` (its `imageSizesFor` moves to `cards/use-element-width.ts`).
