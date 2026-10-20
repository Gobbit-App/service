# Research: Card editor (create and edit)

Decisions D135–D138 and D145 (allocated in the Phase 6 plan), plus the supporting choices R6–R9 that the code review surfaced. Format: Decision / Rationale / Alternatives considered.

## D135 — Editor routes

**Decision**:
- **Create** keeps `/d/$slug/new` (Phase 3B path) and adds `validateSearch` for `type` (`text | link | table | calc`, default `text`; `image` is added by 008). The file stays `routes/d.$slug.new.tsx`, a child of the deck layout `d.$slug.tsx` (which already hides list chrome when the path ends in `/new`).
- **Edit** is `/i/$itemId/edit` in file `routes/i.$itemId_.edit.tsx`. The trailing `_` un-nests it from `i.$itemId.tsx`, which renders no `<Outlet>`.
- Both routes render `editor/CardEditor`. On edit there is no type control (the API refuses a type change with 400).
- `autoCodeSplitting: true` (`vite.config.ts`) already makes route components lazy. The rule is: no layout or list module may statically import from `editor/`.

**Rationale**:
- Keeping the 3B URL means existing "Add card" links and e2e specs need only small edits.
- The edit URL is deck-independent like `/i/$itemId`, so it survives Phase 12 custom hosts (deck links go through 006's `deckHref`).

**Alternatives considered**:
- `/d/$slug/i/$id/edit`: ties edit to a deck path that Phase 12 removes on custom hosts.
- A modal editor over the list: loses deep links and back-button behaviour, and makes drafts awkward to key.
- A nested `i.$itemId.edit.tsx`: would need an `<Outlet>` in the read view.

## D136 — Preview uses the real renderers

**Decision**:
- `EditorPreview` builds an `Item`-shaped object from the draft (`id: 'preview'`, the draft fields, `status` from the original or `published`, `categoryIds`, `isFavorite: false`) and renders `cards/Card` with a new `preview` prop. That prop hides favorite, share and lifecycle actions and renders category chips and the title as plain text (no links).
- Calc renders through the same lazy `CalcCard`.
- Layout: below 768 px, `EditorTabs` shows Edit / Preview tabs (`role="tablist"`). At 768 px and above both panes show side by side through CSS only. The tabs are hidden, and both panels stay mounted so the preview updates live.

**Rationale**:
- "Renders identically" holds by construction.
- The `preview` prop stops favorite/share firing against a fake id.

**Alternatives considered**:
- A separate preview component: it would drift from the list.
- Rendering `CardBody` only: it would miss the title/chips/age layout, which is exactly what members want to check.
- Live preview only on wide screens: phones are the main target.

## D137 — One draft model

**Decision**: `editor/draft.ts` contains:

```ts
type Draft = {
  type: ItemType;            // fixed after creation
  title: string;
  body: string;
  payload: DraftPayload;     // per-type union, see data-model.md
  categoryIds: string[];
  sourceUrl: string;         // '' = none
  entities: Entities | null; // remove-only
};
```

It exposes these functions:

| Function | Behaviour |
|----------|-----------|
| `emptyDraft(type, defaultCategoryId)` | Fresh draft for a new card. |
| `draftFromItem(item)` | Pads malformed table rows to the column count. |
| `toCreateBody(draft)` | Creates the POST body (`sourceUrl` omitted when empty). |
| `toPatch(original, draft)` | Sends only changed top-level fields. Compares `categoryIds` ignoring order. Sends the **whole** `payload` when any part changed (the service validates and replaces the full payload). Sends the **whole** `entities` when one was removed. Sends `sourceUrl: null` when cleared. Returns `null` when nothing changed. Never emits `type` or `status`. |

`ReviewEditForm` keeps its inline layout but uses `draftFromItem`/`toPatch` and the shared `TitleField`, `BodyField`, `LinkFields` and `CategoryChips`. `review/review-edit.ts` (`ReviewDraft`, `draftFromItem`, `buildReviewPatch`) is deleted; its tests move to `editor/draft.test.ts`.

**Rationale**:
- D107 proved the minimal PATCH. Two builders would drift.
- Code check: `buildReviewPatch` lives in `review-edit.ts`, not in the form as the phase plan says, so that file is what goes.

**Alternatives considered**:
- Keep `buildReviewPatch` for review only: the duplication would drift.
- Always PUT the whole item: this overwrites concurrent changes to fields the editor didn't touch and re-embeds needlessly.

## D138 — Field editors

**Decision**: there is a registry, `editor/fields/registry.ts`: `{ text, link, table: lazy(TableFields), calc: lazy(CalcFields), image: ReadOnlyImage }`. 008 replaces `image` with `ImageFields` and passes `previewSlot` into `LinkFields`.

| Field | Behaviour |
|-------|-----------|
| Title | ≤ 120 code points, with a counter. |
| Body | ≤ 600 code points, with a live counter (`LimitMeter`). Shown for every type; optional for non-text types, as the API allows. |
| Link | URL (`type="url"`, http/https check), preview title, preview description. The other `payload.preview` keys (e.g. `image` from ingest) are kept untouched. The `previewSlot?: ReactNode` render prop is where 008's "Fetch preview" button and status go. |
| Table (lazy) | Heading row plus a cell grid. Add or remove rows (≤ 12) and columns (≤ 6). Up/down buttons per row. Horizontal scroll. Byte meter showing `utf8Bytes(JSON.stringify(payload))` against 8192. Pure ops in `table-ops.ts`. |
| Calc (lazy) | Up to 6 fields: key (`^[a-zA-Z_][a-zA-Z0-9_]*$`, unique), label, unit, default. Plus the expression, the result label, and an inline `validateCalcExpression` message. The preview's `CalcCard` gives the live result. Pure ops in `calc-ops.ts`. |
| Categories | `CategoryChips`: toggle chips for the categories visible to the caller, with ≥ 1 required. "+ New category" appears only when `can(role, 'category.create')`. It posts `{ name }` (shared visibility by default) and selects the result. On a 409 conflict it selects the existing category with the same slug from the refreshed list, or shows the problem detail. |
| Source URL | Optional; cleared ⇒ `null`. |
| Entities | `cards/EntityChips` (moved from `review/`) with an optional `onRemove(kind, index)`. Remove only. |

**Rationale**:
- These are the master plan step 1 types and the P5 limits.
- Adding entities would need a per-kind form, and nobody has asked for one.
- The registry lets 008 add image editing without editing `CardEditor`.

**Alternatives considered**:
- One giant form with `switch(type)`: harder for 008 to extend and test.
- Drag-and-drop row reordering: needs a new dependency (R7), and buttons are more accessible on phones.

## D145 — Local drafts

**Decision**:
- `editor/drafts-store.ts` uses idb-keyval `createStore('gobbit-drafts', 'drafts')` behind a `DraftsKv` interface (`get/set/del/clear`), like `share/share-store.ts`, so tests use a Map.
- Keys: `new:<deckId>:<type>` or `edit:<itemId>`. The create route only knows the slug, so it reads `deckId` from `deckQuery(slug)`, which is cached or persisted offline.
- Value: `{ v: 1, draft, baseUpdatedAt: string | null, savedAt: string }`.
- `use-draft-autosave` writes 500 ms after the last change, and only once the draft differs from its base.
- On open with a stored draft, the editor shows "Restore unsaved draft?" (Restore / Discard). For edits, when `item.updatedAt > baseUpdatedAt` it adds "This card has changed since — restoring will overwrite those changes when you save."
- The draft is deleted on a successful save, on Discard, and by `clearDrafts()` from `api/session.ts` `signOut`.
- 008: image drafts store the uploaded `publicId`, never the file.

**Rationale**:
- Phones interrupt.
- Sign-out must not leave content on a shared phone.
- A separate store keeps drafts out of the persisted query cache (`gobbit:query-cache`).

**Alternatives considered**:
- `localStorage`: synchronous, around 5 MB, and string-only.
- Storing drafts in the persisted query cache: mixes server state with user input and is evicted with the cache.
- Server-side drafts: need a new table and fail offline.

## R6 — Client validation without zod or mathjs in the initial bundle

**Decision**:
- `editor/validate.ts` implements mirror checks returning `FieldErrors` (`Record<FieldPath, string>`). Paths match the server's `problem.errors[].path`, e.g. `title`, `payload.rows.3.1`, `categoryIds`.
- The numbers come from a new zod-free subpath `@pb/shared/card-limits` (`src/card-limits.ts` re-exports from `limits.ts` and `utils/utf8-bytes.ts`).
- Calc expressions are checked by `validateCalcExpression`, re-exported from the existing `@pb/shared/calc` subpath, and imported only by `CalcFields` (lazy), which shares the mathjs chunk with `CalcCard`.
- Server errors map through `problem-fields.ts`:
  - `/problems/validation` and `bad-request`: `errors[].path`.
  - `/problems/item-needs-category`: `categoryIds`.
  - `/problems/constraint-violation` (DB CHECK backstop for body/payload) and `/problems/payload-too-large` (the request-body limit in `middleware/body-limit.ts`, not the card budget): a form-level message.
  - Otherwise: a form-level message via `problemMessages`.

**Rationale**:
- Code check: `@pb/shared` item and payload schemas import zod, and `payloads.ts` imports mathjs. The web imports no zod today, and every web subpath (`/authz`, `/calc`, `/decks`, `/search`, `/ingest-constants`) is zod-free.
- The phase plan's "validateDraft uses the `@pb/shared` item schemas" would add zod (and, through `payloads.ts`, mathjs) to the editor chunk and risk the budget for no gain: the server stays authoritative.

**Alternatives considered**:
- Import the Zod schemas in the lazy editor chunk: about 15 KB+ gzip in the chunk, and mathjs in the text editor too.
- Server-only validation: this violates SC-003 (block before reaching the server) and is poor offline.

## R7 — No new dependencies

**Decision**: no new packages. `idb-keyval`, TanStack Router/Query and the existing `cards/` renderers cover the feature.

**Rationale**: Principle VII and the bundle budget.

**Alternatives considered**: a form library (react-hook-form), which isn't needed for a single form with a hand-rolled reducer; a DnD library (see D138).

## R8 — Who sees "Edit"

**Decision**: `cards/EditLink` renders only when `can(role, 'item.update')`. For a `proposed` item it additionally requires `can(role, 'item.publish')` or `item.createdBy === me.id` (`meQuery`). The role comes from the deck (`deckQuery(item.deckId).role`) on `/i/$itemId`, and from the deck layout on list cards. The link uses `/i/$itemId/edit`. The edit route re-checks the same rule and shows "card unavailable" when the API answers 404 or the rule fails.

**Rationale**: this mirrors `items.service` `loadItem(...,'item.update')` and `canSeeProposal` (D96). Readers never see the button.

**Alternatives considered**: always showing Edit and relying on a 403/404 gives a poor experience and leaks the fact that a hidden proposal exists.

## R9 — Cache updates after save

**Decision**:
- **Create**: `useCreateItem` invalidates `queryKeys.itemLists` (already) and `SEARCH_KEY` (new).
- **Edit**: `useUpdateItem` sets `queryKeys.item(id)` from the response and invalidates `itemLists` and `SEARCH_KEY`. When the item is `proposed` it also invalidates `REVIEW_KEY` (queue and count).
- **Inline category create**: invalidates `queryKeys.categories(deckId)`.
- **Navigation**: create goes to `deckHref(slug)` (006). Edit goes back to `/i/$itemId`, or to the review queue when the editor was opened from "Edit fully" (`?from=review`).

**Rationale**: these are the existing query-key conventions. Search results are not persisted, so invalidation is cheap.

**Alternatives considered**: optimistic list updates. Lists are paged and filtered per category, so invalidation is simpler and correct.
