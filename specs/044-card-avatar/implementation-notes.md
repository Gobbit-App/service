# Implementation notes: 044 card cover

Decisions the plan did not make, and deviations.

## API writes (T030)

- **Type change with a cover (decision).** `PATCH /items/{id}` refuses any type change with 409
  (D12), before the cover is looked at, so the resulting type is always the item's own type. A PATCH
  that would turn a covered card into a link/image can therefore not reach the cover rule. The cover
  is checked against `item.type`; `cover: null` is always accepted. The web editor's `cover: null`
  on a type switch applies to cards not yet saved.
- **Decision log wiring.** `createItemsService` takes `coverDecisions` (default: unparented logger),
  wired with the app logger in `services/index.ts`, so integration tests capture `item.cover`
  refusals through `setupApiTest({ logger })`. `coverReference` is now a required dependency.
- **Deviation: client-sent `width`/`height` answers 400, not 422.** The contract lists 422 for
  `cover` carrying extra keys; the app's route-level body validation (zod strict) answers 400 like
  every other schema failure (e.g. ragged table rows). The contract table now says 400.

## Database (T002–T003)

- **Bug caught by the CHECK tests.** The first `items_cover_chk` let a cover without `publicId`
  through: `jsonb_typeof(NULL) = 'string'` is NULL, and a CHECK passes on NULL. The type test is
  wrapped in `coalesce(…, false)` in the migration, the Drizzle schema and the snapshot.
- **Index declared in Drizzle.** `items_cover_public_id_idx` is declared in `schema/items.ts`
  (the older link-preview index lives only in hand-written migrations).

## Wiring

- **Cover reference wired in `services/index.ts`, not `media-wiring.ts`.** `createImageReference`
  is built there, so `createCoverReference` sits next to it. It returns a result union
  (`ok` / `unknown_image` / `other_deck`) so the service can both throw the 422 and log the reason.

## Web

- **`LinkCard` gained `showImage`** (no existing flag); `CardBody` passes `!item.cover` to
  `EventCard` → `LinkCard`.
- **`ReviewCard` doesn't render through `Card`**, so it renders `CoverBar` itself after its title.
- **`FullView` now passes `image={{ priority: true }}`** to `Card` so its cover loads eagerly;
  Browse already passed the hint for the current card.
- **`TypeControl` gained `hasCover`** (the only caller of `SwitchTypeConfirm`); its `hasContent` is
  computed without the cover, so text-with-cover → table doesn't warn. `isDirty` treats a null and
  a missing cover as equal.
- **`usePasteImage(onImage, enabled, scope?)`**: passing a scope (element or ref) switches to the
  capture phase; it marks the paste handled with `preventDefault`, the signal `pastedImage` already
  uses.

## Share (T049–T052)

- **`share.repo.findRecord` selects `cover`** (not named in the tasks; the service had no cover
  otherwise).
- **`hasVisual` / `visualPublicId` are optional**, and `visualPublicId` joins the content hash only
  when set, so cards without a visual keep their stored hash and aren't re-rendered.
- **Int test reads `og:image` from `/p/{slug}/i/{id}`**: `/s/{id}` 302-redirects public cards to the
  public page, whose head carries the share image.

## Validation (T054, T059)

- **Automated quickstart run green** on the branch: `pnpm test:unit`, full `pnpm test:int`, and the
  `editor.spec.ts` (`@smoke`) + `cover.spec.ts` (`@full`) e2e specs against a local dev stack (fake
  Cloudinary, 36 passed).
- **e2e fixture `recordAsset(api, deckId, name)`** (`e2e/fixtures/cloudinary.ts`) records an asset
  through `POST /decks/{id}/media/assets` with a signed fake upload answer; like the existing image
  smoke, it needs `CLOUDINARY_API_SECRET`.
- **Pending deploy**: the manual quickstart steps (adding a cover on a phone in under 30 s, the
  Slow-4G layout check, blocking and deleting in real Cloudinary, chat-app unfurls of public vs
  private shares) are run after deploy.

## Process

- Some unit tests (T022, T023, T049–T052, T019) were written alongside the code rather than run
  red first; each was run green after the change.
