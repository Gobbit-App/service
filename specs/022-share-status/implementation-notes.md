# Implementation notes: 022-share-status

Plan: `specs/022-share-status/plan.md`, tasks: `tasks.md`. Branch `feat/022-share-status`.

Migration `0017` adds `decks.auto_publish_shares` (on for existing personal decks) and the share-status columns on `ingest_jobs`. E2E tier: full (`e2e/tests/full/shares.spec.ts`, `deck-admin.spec.ts`); the share and review journeys stay covered by the smoke suite.

## Decisions not specified by the plan

- **`publishProposal` returns the published item id** and takes an optional `autoPublish` outcome, which it records on the job in the same transaction.
- **`reviewTransaction(db)`** (in `review/publish-proposal.ts`) builds the transactional repos once for both the review service and the worker.
- **`mergeIntoTarget`** is split out of `review.service` so the update path stays readable next to the extracted publish.
- **Auto-publish is an optional handler dep** (`IngestHandlerDeps.autoPublish`), bound in `worker.ts`; it never throws, a failure leaves the card in review as `held_publish_failed`, and a failing follow-up enqueue is logged only.
- **Reviewer copy is separate from sharer copy**: the review card says "Not published directly: <reason>" (`review/held-line.ts`); the sharer's row keeps its own wording (`shares/share-state.ts`).
- **One co-owner note for both switches**: deck settings show "Only co-owners can change these settings." once, under the public and auto-publish switches, instead of a note per switch ("co-owners" matches the existing public switch rather than the task's "owners").
- **The auto-publish switch is its own component** (`deck-admin/AutoPublishSwitch.tsx`) and is shown on the personal deck too (FR-014).

## Deviations from the plan

- **Failure-copy tests** live in `shares/share-state.test.ts` next to the copy, not in the row test.
- **T031** is covered by the `SharesLink` unit test.
- **T041**: the auto-publish integration tests are a new file, `apps/api/test/ingest-auto-publish.int.test.ts`, rather than more cases in `ingest-pipeline.int.test.ts`.
- **T042**: the `autoPublishShares` patch tests are in `apps/api/test/public-settings.int.test.ts`, beside the other owner-only deck settings.
- **T045** was already covered by the US1 `ShareRow` tests (published and "Waiting for review — needs a category").
- **T046**: the maintainer's disabled switch is covered by `DeckSection.test.tsx`; a second admin cannot sign in from e2e (the invite needs the emailed magic link).
