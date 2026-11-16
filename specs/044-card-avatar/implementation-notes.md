# Implementation notes: Card cover image (044)

## Drift since the plan (main @ `040d260`)

045 media cards shipped after this plan was written. Plan, research, data model, contracts and quickstart were updated (T001):

- The `image` card type is now `media` (the legacy `image` input alias still exists). Covers are refused on `link` and `media`.
- The D160 check lives in `apps/api/src/services/media-reference.ts` (`createMediaReferenceCheck`); there is no `image-reference.ts`. `createCoverReference` goes beside it and reuses its `recorded()` helper. Assets now have `kind` and `rejectedAt`.
- Migration `0025` is `0025_media_cards`, so this feature's migration is `0026_card_cover`.
- 045 used D386–D400 and claims ADR-077. This feature's decisions are renumbered D386–D395 → D406–D415 and its ADR is ADR-078.
- `ImageFields.tsx` is gone; uploads go through `use-image-upload.ts`, which signs per kind. Covers sign as `image`.
- Constitution IX (reuse before writing): the `item.cover` decision type goes into the existing `apps/api/src/services/media.events.ts` instead of a new `item-cover.events.ts`. There is no drag-and-drop helper in `apps/web/src/editor/`, so `use-drop-image.ts` stays new.
- The activity-log `changes` entry is `cover` (not `cover image`).
