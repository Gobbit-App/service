# Implementation Plan: Responsive images — `CloudImage`

**Branch**: `013-cloud-image` | **Date**: 2026-10-22 | **Spec**: [spec.md](./spec.md) | **Roadmap**: `PLAN.md` § Phase 7 (demo 2)

**Input**: Feature specification from `/specs/013-cloud-image/spec.md`

Project override of the core template. Written for outside readers: the repository is public.

## Summary

All stored images render through one web component, `CloudImage` (D161):

- It tells the browser the real shown width (the container measured with a shared `ResizeObserver`), so `srcset` picks a matching width.
- It reserves the image's box from the payload's `width`/`height` (from 012).
- It shows a 32 px blurred Cloudinary variant until the sharp image loads, with a fade that respects reduced motion.

Browse's viewport-based `useImageSizes` (009, D144) is folded into it. The service worker image cache doubles its entry count so that placeholders don't evict sharp images (D162). This is web only: no migration, route or API change.

## Starting point

- `main @ 8ff137c`. This plan depends on [`012-media-assets`](../012-media-assets/plan.md) for `width`/`height` in the image payload, but it works without them (default box), so it can start in parallel and merge after 012.
- `apps/web/src/cards/ImageCard.tsx`:
  - It renders `<figure class="image-card"><img class="image-card__img" src=w720 srcSet sizes …>`.
  - `sizes` defaults to `'100vw'`. This default is the cause of demo 2's Lighthouse warning in the list.
  - The `ImageLoading` props (`sizes`, `priority`) come from 009.
- `apps/web/src/cards/cloudinary.ts`: `IMAGE_WIDTHS = [360, 720, 1080]`, `cloudinaryImageUrl` (`f_auto,q_auto,c_limit,w_N`), `cloudinarySrcSet`.
- `apps/web/src/browse/use-image-sizes.ts`: `imageSizesFor(viewport) = min(vw, 640) − 32 px`, with `useImageSizes()` updating on `resize`. It is used by `BrowseStack.tsx`.
- `ImageCard` callers:
  - `CardBody.tsx`, which covers the list, the card page and Browse `ContentPane`;
  - `editor/fields/ImageFields.tsx`, for the preview.
- `LinkCard.tsx` renders a remote `preview.image` with a plain lazy `<img>`. It is unchanged here; 014 moves it to `CloudImage`.
- `sw.ts`: `cloudinary-images` `CacheFirst`, `maxEntries: 300`, 30 days.
- Bundle: 113.7 KB gzip after 009; the budget is 150 KB (`pnpm budget`).

## Technical Context

**Language/Version**: TypeScript (strict, ESM) — React 19 PWA built with Vite

**Primary Dependencies**: React, TanStack Router/Query, Workbox (existing). No new dependencies.

**Storage**: none (reads the existing item payload; service worker image cache)

**Testing**: Vitest + Testing Library (jsdom with a `ResizeObserver` stub); Playwright `@smoke`; manual Lighthouse for demo 2

**E2E tier**: smoke — every image in the deck reader changes rendering, and reading a deck is a critical journey (constitution V). Offline and placeholder variants stay in unit tests

**Target Platform**: evergreen mobile and desktop browsers (`ResizeObserver`, `fetchpriority`, and `width`/`height`-derived aspect ratio are supported in all of them)

**Project Type**: pnpm monorepo — web app only

**Performance Goals**: no "properly size images" warning; CLS < 0.05; first screen with placeholders < 1.5 s on simulated 4G

**Constraints**: plain CSS, no inline styles; initial bundle +≤ 1 KB gzip; value imports from `@gobbit/shared` subpaths only

**Scale/Scope**: lists of up to a few hundred image cards (one shared observer)

## Constitution Check

| Principle | How this plan complies |
|-----------|------------------------|
| I. Layered API | Not touched |
| II. One source of truth | Payload types come from `@gobbit/shared` (012 adds `width`/`height`); the widths stay in `cards/cloudinary.ts`, the only URL builder |
| III. Invariants in the DB | Not touched |
| IV. Private by default | Only `res.cloudinary.com` URLs for this deck's stored images; no Cloudinary fetch URLs for remote images (D162) |
| V. Tests at the right tier | Unit (URL builders, `sizes` from measurement, box classes, placeholder lifecycle, reduced motion via CSS class), e2e (list image has a measured `sizes` and `width`/`height`), manual Lighthouse; traceability below |
| VI. Lean offline-first web | One small component and hook in the initial chunk (≤ 1 KB); the placeholder is cached with the image cache; no API data in the service worker |
| VII. Simple, optional | No dependency; without `cloudinaryCloudName` it renders "Image unavailable" as today |

No violations.

## Decisions this plan pins down

Full reasoning in [research.md](./research.md).

| ID | Decision | ADR? |
|----|----------|------|
| D161 | `CloudImage`: `sizes` from the measured container (shared `ResizeObserver`, viewport estimate first); box from `width`/`height` attributes, default 4:3 contain box otherwise, `max-height: min(70vh, 640px)`; stacked `e_blur` 32 px placeholder with a fade that respects reduced motion; replaces Browse's `useImageSizes` | no |
| D162 | Placeholders share the `cloudinary-images` cache, `maxEntries` 300 → 600; remote link preview images unchanged until 014; no Cloudinary fetch URLs | no |

## Project Structure

### Documentation (this feature)

```text
specs/013-cloud-image/
├── spec.md
├── checklists/requirements.md
├── plan.md
├── research.md
├── data-model.md
├── contracts/cloud-image.md
├── quickstart.md
├── tasks.md
└── implementation-notes.md   # created during /speckit-implement
```

### Source Code (repository root)

```text
apps/web/src/
├── cards/cloudinary.ts            # + cloudinaryPlaceholderUrl, PLACEHOLDER_WIDTH
├── cards/use-element-width.ts     # NEW: shared ResizeObserver hook + imageSizesFor (moved from browse/)
├── cards/CloudImage.tsx           # NEW
├── cards/ImageCard.tsx            # delegates to CloudImage; drops `sizes`; passes width/height
├── cards/CardBody.tsx             # ImageLoading → { priority }
├── browse/use-image-sizes.ts      # DELETED
├── browse/BrowseStack.tsx         # drops useImageSizes; keeps priority for the current card
├── sw.ts                          # cloudinary-images maxEntries 600
└── styles.css                     # .cloud-image* rules (box, stack, fade, reduced motion, max height)
e2e/tests/smoke/items.spec.ts      # + list image attributes
```

**Structure Decision**: the component lives in `cards/` next to the URL builder, rather than in `ui/`, because it is specific to stored card images. `ImageCard` keeps the figure and the fallback copy, so its callers don't change apart from dropping `sizes`.

## Invariant → test traceability

| Invariant / rule | Enforced in | Test (file, tier) |
|------------------|-------------|-------------------|
| FR-001 one component, existing widths | `CloudImage` + `cloudinary.ts` | `CloudImage.test.tsx` (unit: `srcset` has 360/720/1080, `src` w720) |
| FR-002 measured `sizes`, estimate first, 8 px hysteresis | `use-element-width.ts` | `use-element-width.test.ts` (unit: stubbed observer → `sizes`, fallback before measuring, small changes ignored); `items.spec.ts` (e2e: list image `sizes` ≠ `100vw`, ≤ column width) |
| FR-003 box from dimensions, default box otherwise | `CloudImage` + CSS | `CloudImage.test.tsx` (unit: `width`/`height` attributes; `cloud-image--unknown` without them) |
| FR-004 placeholder shown, then removed on load/error | `CloudImage` | `CloudImage.test.tsx` (unit: fire `load`/`error` → placeholder gone, `--loaded` class) |
| FR-005 reduced motion | `styles.css` | `CloudImage.test.tsx` (unit: class only; transition lives in a `prefers-reduced-motion: no-preference` block, checked by review) |
| FR-006 lazy by default; priority eager + high | `CloudImage` | `CloudImage.test.tsx` (unit); `BrowseStack.test.tsx` (unit: current card priority) |
| FR-007 all callers use it; Browse hook removed | `ImageCard`, `BrowseStack` | `ImageCard.test.tsx`, `CardBody.test.tsx` (unit); `browse.spec.ts` (e2e, unchanged pass) |
| FR-008 failure → "Image unavailable" | `ImageCard` | `ImageCard.test.tsx` (unit) |
| FR-009 delivery transformation unchanged | `cloudinary.ts` | `cloudinary.test.ts` (unit) |
| FR-010 bundle | `pnpm budget` | budget script (CI) |
| SC-001–SC-003 Lighthouse | — | quickstart section 2 (manual, deployed) |

## Rollout

- **Migrations**: none.
- **Env / config**: none.
- **API client**: no change.
- **Deploy order / flags**:
  - Web only. Deploy after 012 so new cards carry dimensions. Before that, every card uses the default box, which is acceptable but is not demo 2.
  - The service worker update raises the cache size. Existing entries are kept.

## Risks

| Risk | Likelihood / impact | Mitigation |
|------|---------------------|------------|
| `ResizeObserver` callbacks re-render long lists on every resize | M / L | One shared observer; state changes only when the width moves by 8 px or more; `sizes` only affects later fetches |
| Placeholder requests add latency on slow networks | L / L | ~0.5 KB each and cached; eager only for `priority` images, lazy otherwise like the sharp one |
| Old cards (no dimensions) still shift slightly at the default box edges | M / L | `object-fit: contain` inside a fixed box, so there is no shift, only letterboxing |
| Lighthouse still flags images on very wide desktops (1080 w is the largest) | L / L | The column is capped at 640 px, so 1080 w covers DPR ≤ 1.7 exactly; for higher DPR Lighthouse does not flag "too large" |

## Settle before starting

- [ ] Is a 4:3 default box acceptable for pre-010 cards, or should it be 1:1? It is easy to change in CSS.
- [ ] Confirm the image-heavy test category for SC-003 (20 photo cards) on the deployed instance. It has to be created with test photos, not personal data.

## Complexity Tracking

None.
