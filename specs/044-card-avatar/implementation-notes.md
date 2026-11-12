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
  every other schema failure (e.g. ragged table rows). The contract table should say 400.
