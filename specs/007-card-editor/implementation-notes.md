# Implementation notes: 007-card-editor

Plan: `specs/007-card-editor/plan.md`, tasks: `tasks.md`. Branch `feat/007-card-editor`, stacked on `feat/006-card-lifecycle` at `4ddd2b1`.

## Bundle (T001, T060)

| | Initial JS (gzip) | Of which `index` |
| --- | --- | --- |
| Baseline, 006 head `4ddd2b1` | 111.5 KB | 94.5 KB |

Budget: 150 KB. SC-006 target: at most +3 KB.

## Reconciliation with 006

The plan was written against `main` before 006 existed. Differences:

- **Edit on list cards**: 006 renders `CardActions` only on the card page and on the archived list (through `ItemList`'s `renderActions`). The live lists (all, category, favorites) have no actions slot in use, so 007 passes `renderActions` from `DeckItems` for them too, rendering `EditLink` there. On the card page and the archived list, `EditLink` goes in as a `CardActions` child.
- **T040** (card page back link via `deckHref`) was already done by 006.
- **T029**: `AddCardLink` already builds its href with `deckHref(slug, 'new')`.
- **T031**: the type-change → 400 and empty-categories → 422 cases already exist in `items.int.test.ts`. Only the "editor rewrite keeps a private category" case is new.

## Decisions not specified by the plan

- **`useUpdateProposal` folded into `useUpdateItem`**: the review queue's inline edit and the editor share one PATCH hook (`api/update-item.ts`), so the cache rules (R9) live in one place.
- **Calc defaults and units are text in the draft** (`CalcDraftField`), converted by `toPayload`. Inputs can then hold a half-typed number; `validate.ts` flags a default that doesn't parse.
- **`toPatch` compares against the normalised original** (`toPayload(draftFromItem(item))`), so padding a malformed table row or a jsonb key reorder is not a change. It always reads the payload as the original's type.
- **Titles are trimmed** before compare and send (the server trims too).
- **PATCH payload error paths**: the service validates the payload on its own (`payloadSchemaFor(type).parse`), so its paths have no `payload.` prefix. `problem-fields.ts` prefixes any path whose first segment is not a top-level item key.
- **A network failure on save** shows the offline line ("your draft is saved on this device").
- **Calc keys that are function names** (`round`, `min`, `max`, `abs`, `floor`, `ceil`) are refused on the client (spec edge case). The server schema doesn't check this, so the parity test leaves that case out.
