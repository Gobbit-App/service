# Card editor (Phase 6, `specs/007-card-editor`)

_Overview: [architecture.md](../architecture.md). Decisions: [adr.md](../adr.md)._

Create and edit every card type (text, link, table, calc; image is read-only until 008) in one editor with a live preview, local drafts and inline category creation. No API or schema changes and no migration: the editor uses the existing `POST /decks/{id}/items`, `PATCH /items/{id}` and `POST /decks/{id}/categories`.

**Routes (D135)**: create at `/d/$slug/new?type=` (`text` by default; the type picker updates `?type=`), edit at `/i/$itemId/edit` (file `routes/i.$itemId_.edit.tsx`, not nested under the Outlet-less card route; `?from=review` returns to the review queue). Both render `editor/CardEditor`. Edit has no type picker (the type is immutable). The edit route shows "Card unavailable" for a missing, deleted or not-editable card.

**Who sees Edit (R8)**: `canEditItem(item, role, meId)` (`cards/can-edit-item.ts`) mirrors the API: `item.update`, and for a proposal also `item.publish` or being its creator (D96); never a deleted card. `EditLink` renders on the card page, in the archived list (inside `CardActions`) and on the live lists (through `DeckItems`' `renderActions`); review cards get "Edit fully".

**Preview (D136)**: `EditorPreview` renders the draft through `cards/Card` in `preview` mode (no favorite, share, actions or links), so the list and the preview share one renderer. Phones get Edit/Preview tabs (`EditorTabs`); at ≥ 768 px the two sit side by side (CSS only).

**Draft model (D137)**: `editor/draft.ts`: `Draft`, `emptyDraft(type, defaultCategoryId)`, `draftFromItem(item)`, `withType`, `toCreateBody(draft)` and `toPatch(original, draft)` (minimal diff, whole `payload`/`entities` when changed, `null` when unchanged). The review queue's inline edit (`ReviewEditForm`) uses the same model and fields; `review-edit.ts` is gone. Saving goes through `use-save-card.ts` → `api/create-item.ts` / `api/update-item.ts` (one PATCH hook for the editor and the review queue; R9 cache rules: set the item (and its review-queue entry), invalidate the item lists and search, and the review queue when a proposal was saved). Server field errors map back to fields through `problem-fields.ts`.

**Field registry (D138)**: `editor/fields/registry.ts` maps each type to a lazy fields component (`TextFields`, `LinkFields` with a `previewSlot` seam for 008, `TableFields` up to 12 × 6 with up/down reorder and a byte meter, `CalcFields` up to 6 fields with a live result, `ReadOnlyImage`, replaced by `ImageFields` in 008). Shared fields: `TitleField`, `BodyField` (with `LimitMeter`), `CategoryChips` (at least one for a published card; on an existing card each tap saves on its own, 023; inline **New category** when `can(role, 'category.create')`, which posts with the default `shared` visibility and selects the same-named visible category on a 409), `SourceUrlField` and remove-only `EntityChips`.

**URL inputs (D205, 023)**: every URL input (link URL, source URL, the share form's link) goes through `ui/use-url-input.ts`: focusing an empty field prefills `https://`, leaving it runs `lib/url-input.ts` `normalizeUrlInput` (a lone scheme → empty, a doubled scheme collapsed, `http://` kept, a bare host gets `https://`, other schemes kept so validation refuses them with "Enter a valid web address"). Save paths normalise again, so Enter without blur behaves the same. The server stays strict.

**Instant categories (D207, D208, 023)**: on an existing card `use-instant-categories.ts` drives the chips through `category-saver.ts`: taps within 600 ms become one `PATCH /items/{id} { categoryIds }` (one activity-log line), followed by the app toast "Categories saved" with Undo (6 s); a failure reverts the chips and says so; a pending burst is sent when the editor closes. Removing a published card's last visible category is refused before any request. Each confirmed save (and Undo) calls `rebaselineAfterCategorySave` in `CardEditor`, which moves the baseline and the stored-draft base, so a category save never counts as an unsaved change; the form's Save never sends categories in edit mode. Create mode keeps the chips in the draft.

**Client validation (R6)**: `editor/validate.ts` mirrors the server limits without zod (title, body ≤ 600 code points, payload ≤ 8192 UTF-8 bytes, URLs, table and calc shapes) using value imports from `@pb/shared/card-limits` only. Calc expressions are checked by `@pb/shared/calc`, loaded with a dynamic import while the type is calc (`use-calc-check.ts`), so mathjs stays in its async chunk. The server stays authoritative; its problem details are shown as they come.

**Drafts (D145)**: `editor/drafts-store.ts` on idb-keyval (`createStore('gobbit-drafts', 'drafts')`, behind a `DraftsKv` interface). Keys `new:<deckId>:<type>` and `edit:<itemId>`, value `{ draft, baseUpdatedAt, savedAt }`. `use-draft-autosave.ts` writes 500 ms after the last change, offers a restore on open (`DraftRestoreBanner`, with a "card changed since" warning when the server `updatedAt` is newer than `baseUpdatedAt`), and deletes the draft on save, on discard and when the draft returns to its opening state. `signOut` calls `clearDrafts()` (loaded on demand) after clearing the persisted cache. Storage failures are logged and never block editing.

**Bundle**: initial JS 111.5 → 112.5 KB gzip. The editor, its fields and the drafts store are route or on-demand chunks; `editor/creatable-types.ts` keeps the draft model out of the `/d/$slug/new` route's initial import.

**No new dependencies (R7).**

## Deviations from the 007 plan

- **Edit on list cards**: 006 renders `CardActions` only on the card page and on the archived list (through `ItemList`'s `renderActions`). The live lists (all, category, favorites) have no actions slot in use, so 007 passes `renderActions` from `DeckItems` for them too, rendering `EditLink` there. On the card page and the archived list, `EditLink` goes in as a `CardActions` child.
- **T040** (card page back link via `deckHref`) was already done by 006.
- **T029**: `AddCardLink` already builds its href with `deckHref(slug, 'new')`.
- **T031**: the type-change → 400 and empty-categories → 422 cases already exist in `items.int.test.ts`. Only the "editor rewrite keeps a private category" case is new.
- **`useUpdateProposal` folded into `useUpdateItem`**: the review queue's inline edit and the editor share one PATCH hook (`api/update-item.ts`), so the cache rules (R9) live in one place.
- **Calc defaults and units are text in the draft** (`CalcDraftField`), converted by `toPayload`. Inputs can then hold a half-typed number; `validate.ts` flags a default that doesn't parse.
- **`toPatch` compares against the normalised original** (`toPayload(draftFromItem(item))`), so padding a malformed table row or a jsonb key reorder is not a change. It always reads the payload as the original's type.
- **Titles are trimmed** before compare and send (the server trims too).
- **PATCH payload error paths**: the service validates the payload on its own (`payloadSchemaFor(type).parse`), so its paths have no `payload.` prefix. `problem-fields.ts` prefixes any path whose first segment is not a top-level item key.
- **A network failure on save** shows the offline line ("your draft is saved on this device").
- **Calc keys that are function names** (`round`, `min`, `max`, `abs`, `floor`, `ceil`) are refused on the client (spec edge case). The server schema doesn't check this, so the parity test leaves that case out.
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
- **T031 private-category case lives in `visibility.int.test.ts`**, which already sets up a private category, readers and editors; `items.int.test.ts` has no private category fixture. The type-change 400 and empty-categories 422 cases were already in `items.int.test.ts`.
- **Proposals may have no category in the editor**: `ValidateOptions.categoriesOptional` is set when editing a proposal (full editor and review inline edit). The server only requires a category for published cards (D6) and publishing assigns one, so blocking Save there would stop reviewers fixing an ingested proposal's title.
- **`ReviewQueue` takes the `deck`** (not just its slug) so the inline form can pass it to the shared fields (`FieldsProps.deck`, `CategoryChips`).
- **"Edit fully"** is in the review card's button row and in the inline form, both to `/i/$id/edit?from=review`.
- **Review inline edit label "Text" → "Body"**: it now uses the shared `BodyField`.
- **List Edit link**: `DeckItems` renders `EditLink` with `row` (its own `.card-actions` wrapper) when the route passes no `renderActions`; the archived list and the card page put it inside `CardActions`.
- **Edit route guard**: besides 404/deleted, the route shows "Card unavailable" ("You can't edit this card.") when `canEditItem` fails, e.g. a reader opening the URL directly.
- **Reader-sees-no-Edit e2e (T034) not added**, for the same reason as T021: the smoke suite has only the owner session. `EditLink.test.tsx` and `can-edit-item.test.ts` cover it.
- `calc` was already in `CREATABLE_TYPES` (`?type=`) and the type picker. In `vite build`, mathjs is in a single async chunk (`evaluate-*.js`). `CardEditor` loads it with a dynamic `import()` (`useCalcCheck`), and `CalcFields`/`CalcCard` (both lazy chunks) import it statically. The entry chunk only lists it in the preload map.
- **No writes while a restore offer is open.** If the user types before answering, the stored draft is not overwritten. Writing resumes after Restore or Discard.
- **A stored draft equal to the opening state is dropped silently**, with no offer.
- **Create drafts follow the type.** The key is `new:<deckId>:<type>`. When the type changes, the draft moves to the new key and the old key is deleted. Restoring a draft of another type switches the picker and `?type=`.
- **Reverting to the opening state deletes the stored draft.**
- **After a stale restore, the original `baseUpdatedAt` is kept**, so the warning returns if the draft is offered again.
- **Storage failures are logged (`[drafts] …`) and never block editing or saving.** This covers private mode and missing IndexedDB.
- **`signOut` clears drafts after the persisted cache, in its own try/catch.** `clearDrafts` is a required `SignOutDeps` member, wired in `main.tsx`.
- **The e2e sign-out answers `/auth/logout` locally (`page.route`)** so the suite's shared smoke session survives. "Sign in again" is reopening the editor with the same cookie.
- **`memoryDraftsKv` moved to `src/test/memory-drafts-kv.ts`**, shared by the store, hook and editor tests. `CardEditor.test` mocks `idbDraftsKv` with it.
- **Matching on a 409.** The client does not ship the API's slug library (R7: no new deps). It matches a refreshed category by `nameToSlug(name)` (NFKD, accents dropped, lower case, non-alphanumerics → `-`) or by a case-insensitive name. With no visible match (e.g. a private category with that slug), the problem detail is shown.
- **The 409 resolution lives in `useCreateCategory`.** It refetches `categoriesQuery(deck.id)` with `staleTime: 0`, and the hook result carries `existed`. `onSettled` invalidates the categories by deck id and by slug.
- **Inline create is a `div`, not a nested `<form>`.** Enter adds and Escape cancels. The name input has `maxLength={NAME_MAX}`, and Add is disabled for a blank name.
- **"New category" also appears in the review inline edit**, which uses the same `CategoryChips` and the same `can(deck.role, 'category.create')` gate.
- **New categories are created with the server default visibility (`shared`).** There is no visibility choice inline.

## Deviations from the 023 plan

- **The instant-category controller is created on the first tap** (lint `react-hooks/refs`); until then the chips follow the card.
- **Undo failure has its own toast** ("Couldn't undo the category change.").
- **The last-category refusal counts only visible categories**: a published card with hidden categories is still refused, though the server would accept.
- **The 023 smoke test checks the saved categories through the API** rather than via the header back control, which 022 reworks.
