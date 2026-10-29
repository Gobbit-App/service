# Implementation Plan: Card editor (create and edit)

**Branch**: `007-card-editor` | **Date**: 2026-10-20 | **Spec**: [spec.md](spec.md) | **Roadmap**: `PLAN.md` § Phase 6 (step 1, with [008-card-media](../008-card-media/spec.md))

**Input**: Feature specification from `/specs/007-card-editor/spec.md`

## Summary

This feature replaces the Phase 3B create-only form (`items/CardEditor.tsx`: text and link only, one category `<select>`) with an editor in a new `apps/web/src/editor/` folder that both creates and edits cards. It covers:

- Two routes: `/d/$slug/new?type=` and `/i/$itemId/edit`.
- A preview drawn by the real `cards/*` renderers.
- One draft model (`editor/draft.ts`) shared with the review queue's inline form.
- Per-type field editors: text, link, table, calc. Image fields come in 008.
- Multi-category chips with inline create.
- Local drafts in IndexedDB.

**Web only:**

- No API, schema or migration changes. Every endpoint already exists; see `contracts/api-reuse.md`.
- Server Zod stays authoritative. The client runs zod-free mirror checks so neither zod nor mathjs lands in the initial bundle (research R6).

## Starting point

main @ `10b0e2a` + [specs/006-card-lifecycle](../006-card-lifecycle/spec.md).

- **Migrations:** the latest is `0010_mcp_readiness`, and this feature adds none.
- **Deployed:** Phases 0–5 plus P5.9.
- **Relevant decisions:** D95 (published ⇒ ≥ 1 category, deferred trigger, 422 `/problems/item-needs-category`), D96 (proposal visibility), D97 (entities jsonb) and D107 (minimal PATCH from review). ADR-044 is not touched.
- **Existing code:**
  - `items/CardEditor.tsx`, `items/card-input.ts`, `routes/d.$slug.new.tsx`.
  - `review/ReviewEditForm.tsx`, plus `review/review-edit.ts` (`ReviewDraft`, `draftFromItem`, `buildReviewPatch`, with tests).
  - `review/EntityChips.tsx`, `api/create-item.ts`, `api/review.ts` (`useUpdateProposal`).
  - `api/session.ts` (`signOut`), `share/share-store.ts` (the idb-keyval `ShareKv` pattern).
- **From 006:** `deckHref` (D143) and the `CardActions` slot on `/i/$itemId` and list cards (archive, restore, delete). 007 adds Edit to that slot. If 006 isn't merged yet, Edit goes into `Card`'s actions and moves later.

## Technical Context

**Language/Version**: TypeScript (strict, ESM, no build step) on Node ≥ 22

**Primary Dependencies**: React + Vite + TanStack Router/Query (web); `idb-keyval` (already a dependency). No new dependencies (R7).

**Storage**: none on the server. Browser IndexedDB store `gobbit-drafts` (data-model.md).

**Testing**: Vitest unit (draft, validate, fields, drafts-store), existing API integration tests extended for edit rules, Playwright `@smoke` `editor.spec.ts`

**Target Platform**: PWA on Android Chrome and iOS Safari

**Project Type**: pnpm monorepo, web package (plus a zod-free subpath in `@gobbit/shared`)

**Performance Goals**:
- Typing stays responsive with a 12×6 table.
- Draft autosave is debounced at 500 ms.
- Calc re-evaluation runs on each change of a field or the expression.

**Constraints**:
- Card body ≤ 600 code points; title ≤ 120; payload ≤ 8192 bytes.
- Initial bundle ≤ 150 KB gzip. Editor code only in lazy route chunks; the initial bundle grows by ≤ 3 KB (SC-006).
- Same origin.

**Scale/Scope**: one editor screen, two routes, five field components (four in 007 + image in 008)

## Constitution Check

| Principle | How this plan complies (or "N/A") |
|-----------|-----------------------------------|
| I. Layered API | No API change. The rules already live in `items.service` (type immutable, proposal visibility via `canSeeProposal`, D95, private categories kept via `hiddenCategoryIds`) and `categories.service.create`. The UI only mirrors them for feedback. A hidden proposal answers 404, and the editor shows "card unavailable". |
| II. One source of truth for contracts | The limits come from `@gobbit/shared/limits.ts`, re-exported through a new zod-free subpath `@gobbit/shared/card-limits`, with no copied numbers. Calc validation reuses `validateCalcExpression` through the existing `@gobbit/shared/calc` subpath. Requests use the `@gobbit/api-client` types. No `api:openapi` change. |
| III. Invariants live in the database | Unchanged: the D95 trigger and the body/payload CHECKs stay the backstop. The editor maps the 422 to the category field. |
| IV. Private by default | The editor only lists categories from `categoriesQuery` (already visibility-filtered). The service keeps hidden categories on rewrite. Drafts are wiped on sign-out (D145). No new fetches; "Fetch preview" is 008, through `safe-fetch`. |
| V. Tests at the right tier | Unit for `draft.ts`/`validate.ts`/`drafts-store.ts`/field reducers; int for edit/proposal rules (extend existing tests); e2e `editor.spec.ts`. Traceability table below. |
| VI. Lean, offline-first web | Editor routes are lazy (`autoCodeSplitting`). Table and calc fields are lazy inside the editor. Calc shares the mathjs chunk with `CalcCard`. No zod in the client. Drafts in IndexedDB, not the service worker. Value imports via subpaths only (`/card-limits`, `/calc`, `/authz`). `pnpm budget` before and after. |
| VII. Simple, optional, deployable | No new dependency (row reorder uses buttons, not a DnD library). Works without AI keys. Deploy is unchanged. |

## Decisions this plan pins down

| ID | Decision | ADR? |
|----|----------|------|
| D135 | Routes: create `/d/$slug/new?type=` (existing path, `type` search param defaulting to `text`); edit `/i/$itemId/edit` as file `routes/i.$itemId_.edit.tsx` (not nested under the Outlet-less `i.$itemId.tsx`). Both render `editor/CardEditor`. There is no type picker on edit. | no |
| D136 | The preview renders the draft through `cards/Card` in `preview` mode (no favorite/share/actions, no links), so list and preview share the renderer. Phones get Edit/Preview tabs; ≥ 768 px is side by side (CSS only). | no |
| D137 | One draft model, `editor/draft.ts`: `Draft`, `emptyDraft(type, defaultCategoryId)`, `draftFromItem(item)`, `toCreateBody(draft)`, `toPatch(original, draft)` (minimal diff; whole `payload`/`entities` when changed; null when unchanged). Validation is in `editor/validate.ts` with zod-free mirror checks. `review/review-edit.ts` (`ReviewDraft`, `draftFromItem`, `buildReviewPatch`) is removed, and `ReviewEditForm` uses `draft.ts` and the shared fields. | no |
| D138 | Field editors through a registry `editor/fields/registry.ts` (type → lazy component). 007 covers text, link (URL + preview title/description + `previewSlot` seam for 008), table (lazy grid 12×6, up/down reorder, byte meter) and calc (lazy, ≤ 6 fields, live result, inline errors). Shared fields are title, `CategoryChips` (≥ 1, inline create when `category.create`), source URL, and `EntityChips` (moved to `cards/`, with `onRemove`) for remove-only entities. Image: read-only until 008 registers `ImageFields`. | no |
| D145 | Drafts: `editor/drafts-store.ts` on idb-keyval `createStore('gobbit-drafts','drafts')`, behind a `DraftsKv` interface. Key `new:<deckId>:<type>` or `edit:<itemId>`. Value `{ draft, baseUpdatedAt, savedAt }`. Debounced 500 ms. Restore offer on open, "card changed since" when the server `updatedAt` > `baseUpdatedAt`. Cleared on save and in `signOut` (`clearDrafts`). | no |

No ADR: these are web-internal choices inside existing ADRs (D57 budget, the persisted query cache, D107).

## Project Structure

### Documentation (this feature)

```text
specs/007-card-editor/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── editor-ui.md     # routes, components, props, field seams for 008
│   └── api-reuse.md     # endpoints + problem types the editor relies on
├── checklists/requirements.md
└── tasks.md
```

### Source Code (repository root)

```text
packages/shared/
├── package.json                 # + "./card-limits" export
└── src/card-limits.ts           # NEW zod-free: CARD_* / PAYLOAD_MAX_BYTES / TABLE_* / CALC_MAX_FIELDS / NAME_MAX, codePointLength, utf8Bytes
    src/calc/evaluate.ts         # + `export { validateCalcExpression }` (imported there today, not re-exported; mathjs-only, no zod)

apps/web/src/
├── editor/                      # NEW
│   ├── CardEditor.tsx           # form shell: fields + preview + save; create & edit modes
│   ├── EditorTabs.tsx           # Edit / Preview tabs (< 768 px), side by side above
│   ├── EditorPreview.tsx        # draft → Item-like → <Card preview>
│   ├── draft.ts (+ .test.ts)    # D137
│   ├── validate.ts (+ .test.ts) # mirror checks → FieldErrors
│   ├── problem-fields.ts (+ .test.ts) # problem+json → FieldErrors (path → field; 422 item-needs-category → categoryIds)
│   ├── drafts-store.ts (+ .test.ts)   # D145
│   ├── use-draft-autosave.ts    # debounce + restore offer state
│   ├── use-save-card.ts         # create / update mutation + cache updates
│   ├── fields/
│   │   ├── registry.ts          # type → field component (lazy for table/calc)
│   │   ├── TitleField.tsx, BodyField.tsx, SourceUrlField.tsx
│   │   ├── LinkFields.tsx       # url + preview title/description + previewSlot
│   │   ├── TableFields.tsx      # lazy; table-ops.ts (+ .test.ts)
│   │   ├── CalcFields.tsx       # lazy; calc-ops.ts (+ .test.ts)
│   │   ├── CategoryChips.tsx    # multi-select + inline create
│   │   ├── LimitMeter.tsx       # code points / bytes counter
│   │   └── ReadOnlyImage.tsx    # until 008 ImageFields
│   └── editor.css
├── cards/
│   ├── Card.tsx                 # + `preview` prop (no actions, no links)
│   ├── EntityChips.tsx          # MOVED from review/, + optional onRemove
│   └── EditLink.tsx             # NEW: gated "Edit" (can(item.update) + proposal rule)
├── api/
│   ├── update-item.ts           # NEW useUpdateItem (PATCH /items/{id}) + cache updates
│   ├── create-category.ts       # NEW useCreateCategory (POST /decks/{id}/categories)
│   ├── create-item.ts           # + invalidate SEARCH_KEY
│   └── session.ts               # signOut also clears drafts
├── items/                       # CardEditor.tsx, card-input.ts REMOVED (→ editor/); AddCardLink uses deckHref
├── review/                      # ReviewEditForm uses editor/draft.ts; review-edit.ts REMOVED; "Edit fully" link in ReviewCard
└── routes/
    ├── d.$slug.new.tsx          # → editor (create), validateSearch { type }
    ├── i.$itemId.tsx            # + EditLink; back link via deckHref
    └── i.$itemId_.edit.tsx      # NEW → editor (edit)

e2e/tests/smoke/editor.spec.ts   # extended
apps/api/test/items.int.test.ts, proposal-visibility.int.test.ts  # edit-rule cases (existing behaviour, now relied on by UI)
```

**Structure Decision**: The web gains `editor/` and `items/` loses the old form. `@gobbit/shared` gains one zod-free subpath. The API, DB and api-client are unchanged.

## Invariant → test traceability

| Invariant / rule (spec FR or D-number) | Enforced in (DB / service / route / UI) | Test (file, tier) |
|----------------------------------------|------------------------------------------|-------------------|
| FR-002 type immutable | service `update` (400) + UI (no picker on edit) | `items.int.test.ts` (int, existing → assert); `draft.test.ts` `toPatch` never emits `type` (unit) |
| FR-003 proposal edit = creator or publisher, stays proposed | service `canSeeProposal` + `update` status rules; UI `EditLink` | `proposal-visibility.int.test.ts` (int: creator PATCH ok and status stays `proposed`; other editor 404); `EditLink.test.tsx` (unit); `editor.spec.ts` (e2e) |
| FR-005 limits (120/600 cp, 8192 B, 12×6, 6 fields) | DB CHECK + shared Zod + UI `validate.ts` | `validate.test.ts` (unit, incl. emoji/Hebrew/combining); `editor.spec.ts` 601-char refused (e2e) |
| FR-006 / D95 ≥ 1 category | DB trigger + UI | `validate.test.ts` (unit); `problem-fields.test.ts` 422 → `categoryIds` (unit); `items.int.test.ts` existing 422 (int) |
| FR-007 inline create only with `category.create`; existing name reused | service `categories.create` (409 on slug) + UI | `CategoryChips.test.tsx` (unit: hidden for reader/contributor, 409 → select existing); `categories.int.test.ts` existing (int) |
| FR-008 minimal PATCH; hidden categories kept | UI `toPatch` + service `hiddenCategoryIds` | `draft.test.ts` (unit); `items.int.test.ts` editor rewrite keeps private category (int) |
| FR-009 table ops within 12×6, rows aligned | UI `table-ops.ts` + shared schema | `table-ops.test.ts` (unit) |
| FR-010 calc ≤ 6 fields, expression validated | UI `calc-ops.ts` + `validateCalcExpression` + shared schema | `calc-ops.test.ts`, `validate.test.ts` (unit) |
| FR-012 entities remove-only | UI | `draft.test.ts` (whole `entities` in patch after removal), `EntityChips.test.tsx` (unit) |
| FR-013 / D145 drafts restore, stale warning, cleared on save and sign-out | UI `drafts-store.ts`, `session.ts` | `drafts-store.test.ts`, `session.test.ts` (unit); `editor.spec.ts` reload → restore (e2e) |
| FR-014 server errors → fields, draft kept | UI `problem-fields.ts` | `problem-fields.test.ts` (unit) |
| FR-015 Edit visible only when allowed | UI `EditLink` (`can()` + proposal rule) | `EditLink.test.tsx` (unit); `editor.spec.ts` (e2e) |
| FR-016 review inline edit uses `toPatch` | UI `ReviewEditForm` | `ReviewEditForm.test.tsx` / `draft.test.ts` (unit, ported from `review-edit.test.ts`) |
| D136 preview = list renderer | UI `EditorPreview` → `Card preview` | `editor.spec.ts` preview text = list text per type (e2e) |
| SC-006 initial bundle +≤ 3 KB | build | `pnpm budget` (gate) + note in implementation-notes |

## Rollout

- **Migrations**: none.
- **Env / config**: none.
- **API client**: no `pnpm api:openapi` change, because no routes change.
- **Deploy order / flags**: the normal CI → Dokploy flow. Merge after 006 (needs `deckHref`). 008 builds on this (image fields, Fetch preview). The PLAN.md Phase 6 demo 1 is ticked only after 008 ships and has been run on the deployed instance.

## Risks

| Risk | Likelihood / impact | Mitigation |
|------|---------------------|------------|
| Client checks drift from server Zod | M / L (server still refuses) | Limits imported from `@gobbit/shared` (not copied); a unit test feeds the same fixtures to `validate.ts` and the shared Zod schemas and compares the verdicts (the test runs in Node, so zod is fine there) |
| zod/mathjs leaks into the initial bundle | M / M | Only subpath imports; `pnpm budget` in CI; calc fields lazy; review `vite build` manifest |
| Removing `buildReviewPatch` regresses review edit | L / M | Port `review-edit.test.ts` cases to `draft.test.ts` first, then switch |
| `Card` `preview` mode diverges from the list | L / M | One component with a prop, not a copy; e2e compares text |
| Draft restore on a shared phone exposes content | L / H | Cleared in `signOut`; drafts keyed per deck/item and readable only by the same browser profile |
| iOS Safari evicts IndexedDB | M / L | Drafts are best-effort; save is the durable path; no data loss on the server |

## Settle before starting

- [ ] **Q1**: should cards an `editor` creates in the full editor publish directly (today: `create` defaults to `published`) or go to review as `proposed`? This plan assumes **direct publish (unchanged)**. Changing it would be a service rule (Principle I) and would also touch 006/009.
- [ ] 006-card-lifecycle merged, or at least `deckHref` and the `CardActions` slot available.
- [ ] Record the current `pnpm budget` figure (P6.0 measure-first) as the baseline for SC-006.

## Complexity Tracking

None. There are no constitution violations.
