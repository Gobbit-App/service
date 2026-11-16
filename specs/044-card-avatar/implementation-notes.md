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

## Decisions made while implementing

- **Per-reason decision levels (T013)**: `decisionLogger` levels could only be keyed by `event` or `event:outcome`, so the plan's "info; warn on `other_deck`" for `item.cover` couldn't be expressed. `lib/decision-event.ts` now also looks up `event:outcome:reason` first (one-line change + unit test); `item.cover:refused:other_deck` is `warn`, the other reasons `info`.
- **Cover check (T013)**: `createCoverReference` classifies its own refusals (`other_deck` when the asset exists for another deck, else `unknown_image`, incl. rejected and non-image assets) instead of lifting the media check's `recorded()` closure: classifying needs the asset row anyway, so lifting saved nothing. The thrown 422 carries `coverReason` for the service's decision event.
- **No PATCH type change (T010/T014)**: a card's type never changes after creation (D12, `refuseTypeChange`), so the "type change to link/media while a cover remains" case can't arise on PATCH; the switch-type warning (D412) applies to the new-card composer only. The int case was dropped.
- **Save waits for a cover upload (T020)**: `CoverField` reports its upload through the editor's existing `onUploadingChange` (as `MediaFields` does), so Save is held while a cover uploads; the field is hidden when the deck has no media store (no cloud name), like the Media type.
- **CI fixes (first int run)**: `items_cover_chk` gained `cover ? 'publicId'` — without it a cover with no `publicId` made the CHECK evaluate to NULL, which Postgres accepts. Request-schema refusals of the cover (extra keys, bad `publicId`) answer **400** like every other request-schema error, not 422 (contract updated). The items service's decision logger is now wired to the app's parent logger in `services/index.ts` (it used the root logger, so `item.cover` and 045's `item.type_alias` never reached the injected logger).
