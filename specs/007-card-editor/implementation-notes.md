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

## Deviations (editor UI)

- **Calc expression check via `useCalcCheck`**: rather than `CalcFields` handing the check to `validate.ts`, `CardEditor` loads `@pb/shared/calc` through a dynamic import while the type is calc (`editor/use-calc-check.ts`) and passes `validateCalcExpression` as `ValidateOptions.calcExpression`. Save stays disabled ("Loading the calculator…") until it has loaded; a failed load shows a form error. mathjs stays in the calc async chunk.
- **`setTitleIfEmpty` lives on `FieldsProps`** (optional) instead of only on `LinkFieldsProps`, so the registry can pass one prop shape to every type.
- **Field styles in `styles.css`**: `.field`, `.limit-meter` and the pressed-chip style are global because the review queue's inline edit uses the same field components. Editor layout stays in `editor/editor.css`.
- **Client errors show once the draft is dirty**: an untouched new card doesn't open with "Title is required"; Save is disabled with the count from the start. Server errors always show.
- **`TextInput`** is the shared labelled input/textarea (hint, error, `aria-describedby`, `dir="auto"`) under the Title, Body, Source URL, link, calc fields.
- **`TextFields` renders nothing**: a text card has only the shared Title/Body/Categories/Source fields.
- **Category select → chips**: the old `<select>` is replaced by `CategoryChips` (toggle buttons with `aria-pressed`), so a card can have several categories.
- **`?type=` follows during render**: when the URL type changes (back button), the editor applies `withType` while rendering instead of in an effect (`react-hooks/set-state-in-effect`).
- **e2e 601-char case** now checks that Save is disabled with "Fix 1 field" and the meter at 601 / 600; the client never sends the request, so the old server alert can't appear.
- **Reader guard e2e not added (T021)**: the smoke suite has a single session (the owner's `SMOKE_SESSION_TOKEN`) and no way to sign in as a reader, so "You can't add cards here" for a reader is not covered end to end. The route checks `can(role, 'item.create')`, and `can` is covered by the shared authz unit tests.

## Deviations (edit, US2)

- **T031 private-category case lives in `visibility.int.test.ts`**, which already sets up a private category, readers and editors; `items.int.test.ts` has no private category fixture. The type-change 400 and empty-categories 422 cases were already in `items.int.test.ts`.
- **Proposals may have no category in the editor**: `ValidateOptions.categoriesOptional` is set when editing a proposal (full editor and review inline edit). The server only requires a category for published cards (D6) and publishing assigns one, so blocking Save there would stop reviewers fixing an ingested proposal's title.
- **`ReviewQueue` takes the `deck`** (not just its slug) so the inline form can pass it to the shared fields (`FieldsProps.deck`, `CategoryChips`).
- **"Edit fully"** is in the review card's button row and in the inline form, both to `/i/$id/edit?from=review`.
- **Review inline edit label "Text" → "Body"**: it now uses the shared `BodyField`.
- **List Edit link**: `DeckItems` renders `EditLink` with `row` (its own `.card-actions` wrapper) when the route passes no `renderActions`; the archived list and the card page put it inside `CardActions`.
- **Edit route guard**: besides 404/deleted, the route shows "Card unavailable" ("You can't edit this card.") when `canEditItem` fails, e.g. a reader opening the URL directly.
- **Reader-sees-no-Edit e2e (T034) not added**, for the same reason as T021: the smoke suite has only the owner session. `EditLink.test.tsx` and `can-edit-item.test.ts` cover it.
