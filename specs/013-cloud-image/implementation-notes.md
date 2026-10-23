# Implementation notes: 013-cloud-image

Plan: `specs/013-cloud-image/plan.md`, tasks: `tasks.md`. Branch `worktree-phase7-media` (all of Phase 7), on top of 012 (`5317282`).

Web only: no migration, route, env var or dependency.

## Bundle (T040)

| | Initial JS (gzip) |
| --- | --- |
| 012 | 113.7 KB |
| 013 | 113.7 KB (budget 150 KB) |

`CloudImage` and `useElementWidth` replace `use-image-sizes.ts` in the initial chunk; the size change rounds to zero.

## Settled before starting

- **One component** (`cards/CloudImage.tsx`) for every stored image; `ImageCard` wraps it, and 014 reuses it for link previews.
- **`imageSizesFor` moved** to `cards/use-element-width.ts` (git mv, history kept) as the pre-measurement estimate.

## Decisions not specified by the plan

- **The placeholder follows the sharp image's loading**: lazy unless `priority`, so off-screen cards don't fetch it early.
- **`nextWidth` ignores 0 widths**, so a hidden card (inactive Browse page) keeps its last measured `sizes`.
- **The editor payload carries the confirmed asset's dimensions** (`editor/image-payload.ts`: `withPhoto` / `withoutPhoto`), so the preview reserves the same box as the list. The API still overwrites them from the asset on save (D160).
- **`ImageFields`** keeps the local blob thumbnail while uploading; the Card preview renders through `CloudImage`.
- **Test helpers**: `test/resize-observer.ts` (`FakeResizeObserver`, installed in the Vitest setup) and `mockConfig` in `test/api-mock.ts` to switch on a cloud name per test.

## Deviations from the plan

- **T012**: the list-image smoke lives in the photo test of `e2e/tests/smoke/editor.spec.ts`, not `items.spec.ts`. Since 012 the fixture deck has no image card, so the only list image the smoke can reach is the one it uploads. It runs only with `CLOUDINARY_API_SECRET`.
- **T030**: there is no `BrowseStack.test.tsx`; the "priority only on the current card, `sizes` in px" test is in `browse/BrowseScreen.test.tsx`.
- **T034**: no e2e selector used `.image-card__img`; nothing to change.

## Gates

- `pnpm lint`, `pnpm format:check`, `pnpm typecheck`: clean.
- Web unit: 118 files, 936 tests passed.
- `pnpm build:web && pnpm budget`: 113.7 KB gzip initial JS.
- T044 demo tick and T045 (quickstart and Lighthouse on the deployed instance) are left for after deploy.
