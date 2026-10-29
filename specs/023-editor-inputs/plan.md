# Implementation Plan: Friendlier editor inputs

**Branch**: `feat/023-editor-inputs` | **Date**: 2026-10-26 | **Spec**: [spec.md](./spec.md) | **Roadmap**: `PLAN.md` § Usability pass (item 2)

**Input**: Feature specification from `/specs/023-editor-inputs/spec.md`

Project override of the core template. Written for outside readers: the repository is public.

## Summary

Three small editor changes, one PR.

**URL inputs (US1, D205).** A pure function `normalizeUrlInput(raw)` in `apps/web/src/lib/url-input.ts` trims, collapses a doubled scheme (`https://https://…`), lowercases an `http(s)` scheme, turns `//host` into `https://host`, leaves any other scheme (`mailto:`, `javascript:`) alone so validation refuses it, and adds `https://` to everything else. A hook `useUrlInput(value, onChange)` gives every URL input the same behaviour: `https://` on focus when empty (caret at the end), normalise on blur (scheme only → empty). Used by `TextInput type="url"` (link URL, source URL, review inline link) and the share form. On save the draft is normalised again (`toPayload`, `toCreateBody`, `toPatch`, `validateDraft`, share submit), so pressing Enter without leaving the field still stores `https://…`. The server's `httpUrlSchema` is unchanged.

**Optional alt (US2, D206).** `imagePayloadSchema.alt` becomes `z.string().optional()` (empty allowed). The editor labels the field "Description (optional)", stops requiring it and omits an empty alt from the payload. A zod-free helper `imageAlt({ alt, title, titleAdjacent })` in `@gobbit/shared/image-alt` decides the text alternative: the alt when set, otherwise empty (decorative) when the title is visibly next to the image, otherwise the title. Every renderer today (card list, card page, browse, review queue, editor preview, public pages) shows the title as the card's heading right above the image, so a card without alt renders `alt=""`; the card's `<article>` is already labelled by that heading. OG/share previews carry no `og:image:alt`, so nothing changes there. `pnpm api:openapi` regenerates the client.

**Instant categories (US3, D207, D208).** In the editor for an existing card, chip toggles no longer edit the draft. A small controller (`editor/category-saver.ts`, framework-free, unit-tested with fake timers) collects a burst of taps for 600 ms, sends one `PATCH /items/{id} { categoryIds }`, and on success shows the existing app toast "Categories saved" with Undo for 6 s (`UNDO_TOAST_MS`). Undo sends the set from before the burst. Saves are serialised; leaving the editor flushes a pending burst. A published card refuses to lose its last (visible) category before any request. A failure reverts the chips to the stored set and shows an error toast; other edits are untouched. After each confirmed save the editor calls `rebaselineCategories(ids)`, which moves both the draft's and the opening snapshot's `categoryIds` (and the stored-draft base time), so the change never counts as unsaved (FR-010, the seam 022's guard plugs into). New cards keep categories in the create request (FR-011). The existing PATCH already keeps categories the caller can't see and writes one 020 log line per save.

## Starting point

- `main @ 4062ead`. 020 (activity log), 021 and 022-share-status merged; 022-editor-navigation is built in parallel (unsaved-changes guard; dirty = content ≠ opening snapshot).
- URL inputs: `editor/fields/TextInput.tsx` (`type="url"`), used by `LinkFields` (link URL) and `SourceUrlField`; `share/ShareForm.tsx` has its own `<input type="url">`. Client checks: `editor/validate.ts isHttpUrl` (mirrors `httpUrlSchema`: `startsWith('http://'|'https://')` + `new URL`), `share-payload.ts isHttpUrl`.
- Alt: `imagePayloadSchema.alt = z.string().min(1)`; `validate.ts` `ALT_REQUIRED`; `ImageFields` "Alt text"; renderers `cards/ImageCard.tsx` → `CloudImage alt`, `apps/api/src/public/render-item.ts renderImage`. No DB CHECK on alt (only payload bytes). Search text includes alt when present (`item_search_text`, `coalesce`-safe).
- Categories: `CategoryChips` (+ inline `NewCategory`) edit `draft.categoryIds`; saved with the form through `toPatch`. `items.service.update` replaces the visible set and re-adds `hiddenCategoryIds` (tested in `visibility.int.test.ts`); D6 (`/problems/item-needs-category`) applies to published cards; one `updated` event with `changes: ['categories']` per PATCH (020).
- Web toast: `ui/toast-store.ts` (`showToast`, one app-wide toast, survives navigation) + `ui/UndoToast.tsx` (`UNDO_TOAST_MS = 6000`), used by archive/delete Undo (D146).
- Drafts: `use-draft-autosave.ts` (D145) stores the draft while it differs from `initial`; the read-on-open effect depends on `initial`.

## Technical Context

**Language/Version**: TypeScript (strict, ESM, no build step) on Node ≥ 22; React 19

**Primary Dependencies**: Hono + `@hono/zod-openapi`, Drizzle, React + Vite + TanStack Router/Query. Nothing new.

**Storage**: PostgreSQL 17. No migration: alt has no DB constraint; payload byte CHECK unchanged.

**Testing**: Vitest unit (normaliser table, hook, saver with fake timers, alt rule, validate/draft, components), integration with Testcontainers (image alt optional; category PATCH sequence = save + undo log lines, hidden category kept), Playwright smoke + full

**E2E tier**: smoke + full — creating and editing a card is a critical journey (constitution V). Smoke: a link card typed as `example.org` is stored as `https://example.org`; an image card's Save is enabled without alt and the field is "Description (optional)" (the actual image save stays behind the existing `CLOUDINARY_API_SECRET` skip); an existing card re-filed by one chip tap and left without Save keeps the new category. Full: Undo restores, a published card refuses to drop its last category, a failed save reverts the chips, source URL and share URL prefixes, `http://` kept, invalid address refused.

**Target Platform**: PWA (Android Chrome, iOS Safari); Docker Compose on Dokploy

**Project Type**: pnpm monorepo — API, PWA, shared packages

**Performance Goals**: one PATCH per burst of taps; Undo notice within 1 s of the last tap on a normal connection

**Constraints**: editor validation stays zod-free; `@gobbit/shared` value imports only via subpaths (`/image-alt` is zod-free); initial bundle ≤ 150 KB gzip (editor is lazy); server URL rule unchanged (FR-003)

**Scale/Scope**: per-card edits; a handful of category taps per edit

## Constitution Check

| Principle | How this plan complies |
|-----------|------------------------|
| I. Layered API | No new route or service; the existing `PATCH /items/{id}` → `items.service.update` keeps every rule (D6, visibility, events). |
| II. One source of truth | `imagePayloadSchema` in `@gobbit/shared` is the only contract change; `pnpm api:openapi` regenerates `@gobbit/api-client`; the alt rule is one shared helper used by web and API. |
| III. Invariants in the DB | No schema change. Payload byte CHECK still applies; D6 (published needs a category) stays a DB trigger + service rule; the client refusal only avoids a doomed request. |
| IV. Private by default | Category saves go through the same PATCH, which re-adds hidden categories (`hiddenCategoryIds`); an int test pins it for the save/undo sequence. |
| V. Tests at the right tier | Unit next to code for every piece of logic; int for the contract and the PATCH sequence; e2e smoke (critical journey) + full (variants, negatives). Traceability below. |
| VI. Lean web | No new dependency; the editor is already lazy; `@gobbit/shared/image-alt` is a few lines and zod-free; the toast is the existing one. `pnpm budget` checked. |
| VII. Simple, optional, deployable | No env, no migration, no AI. Old clients keep sending alt; old cards keep theirs. |

Post-design re-check: no violations.

## Decisions this plan pins down

| ID | Decision | ADR? |
|----|----------|------|
| D205 | One URL-input rule (`normalizeUrlInput` + `useUrlInput`) for every URL input: prefill on focus, normalise on blur and on save, lowercase `http(s)` scheme, other schemes left for validation to refuse; server unchanged | no |
| D206 | Alt is optional (`z.string().optional()`, empty allowed); empty alt omitted by the editor; `imageAlt()` fallback: alt → decorative when the title is adjacent → title | no |
| D207 | Instant category saves: 600 ms burst → one PATCH; Undo (6 s, existing toast) to the pre-burst set; serialised; flushed on leave; published-last-category refused client-side; failure reverts chips | no |
| D208 | Edit-mode chips are held outside the draft; confirmed saves call `rebaselineCategories(ids)` (draft + opening snapshot + draft base); restored drafts take the saved categories; the review inline form keeps Save/Cancel | no |
| D209 | E2E tier smoke + full (split above) | no |

## Project Structure

### Documentation (this feature)

```text
specs/023-editor-inputs/
├── spec.md
├── plan.md                  # this file
├── research.md              # D205–D209
├── data-model.md            # image payload change, editor state
├── contracts/editor-inputs.md
├── quickstart.md
├── tasks.md
└── implementation-notes.md
```

### Source Code (repository root)

```text
packages/shared/src/
├── schemas/payloads.ts                 # alt optional
├── media/image-alt.ts (+ .test.ts)     # NEW imageAlt(); subpath `@gobbit/shared/image-alt`
└── package.json                        # + "./image-alt" export
packages/api-client/src/schema.d.ts     # regenerated

apps/api/src/public/render-item.ts      # imageAlt() in renderImage (+ test)
apps/api/test/items.int.test.ts         # image card with no / empty alt (create, update)
apps/api/test/item-events.int.test.ts   # save + undo = two `categories` lines; hidden category kept

apps/web/src/
├── lib/url-input.ts (+ .test.ts)       # NEW normalizeUrlInput, collapse, prefill constant
├── ui/use-url-input.ts (+ .test.tsx)   # NEW focus/blur/paste behaviour
├── editor/fields/TextInput.tsx         # url type → useUrlInput
├── editor/fields/ImageFields.tsx       # "Description (optional)" + hint
├── editor/validate.ts, draft.ts        # alt not required; normalise URLs on save
├── editor/category-saver.ts (+ .test.ts)      # NEW burst/undo/serialise controller
├── editor/use-instant-categories.ts (+ .test.tsx) # NEW hook: PATCH, toast, refusal, revert
├── editor/rebaseline.ts (+ .test.ts)   # NEW withCategories / withSavedCategories
├── editor/CardEditor.tsx               # wiring; baseline state
├── editor/use-draft-autosave.ts        # open-snapshot read; rebase()
├── cards/ImageCard.tsx, CardBody.tsx, payload-guards.ts   # alt optional + imageAlt
└── share/ShareForm.tsx                 # useUrlInput + normalise on submit

e2e/tests/smoke/editor.spec.ts          # https prefix, optional alt, one-tap re-file
e2e/tests/full/editor-inputs.spec.ts    # NEW undo, last category, failure, other URL fields
```

**Structure Decision**: the URL rule is web-only (all URL inputs live in the PWA; the server rule stays strict), so it lives in `apps/web/src/lib`. The alt rule is needed by the PWA and the API's HTML pages, so it lives in `@gobbit/shared` behind a zod-free subpath.

## Invariant → test traceability

| Invariant / rule | Enforced in | Test (file, tier) |
|------------------|-------------|-------------------|
| FR-001 prefill / clear on blur | `useUrlInput` | `use-url-input.test.tsx` (unit); `TextInput`/`ShareForm` tests (unit); `editor.spec.ts` (e2e:smoke) |
| FR-002 add scheme, keep http(s) | `normalizeUrlInput` | `url-input.test.ts` (unit, table); `editor-inputs.spec.ts` http kept (e2e:full) |
| FR-003 one function, server unchanged | `url-input.ts` used by all; `httpUrlSchema` untouched | `draft.test.ts`, `validate.test.ts`, `ShareForm` test (unit); existing schema tests |
| FR-004 save without alt (editor + API) | `imagePayloadSchema`, `validate.ts` | `validate.test.ts`, `draft.test.ts` (unit); `items.int.test.ts` no/empty alt create + update (int); `editor.spec.ts` (e2e:smoke) |
| FR-005 alt fallback | `imageAlt()` | `image-alt.test.ts` (unit); `ImageCard.test.tsx`, `CardBody.test.tsx` (unit); `render-item.test.ts` (unit) |
| FR-006 instant save | `use-instant-categories` | `use-instant-categories.test.tsx` (unit); `editor.spec.ts` one-tap re-file (e2e:smoke) |
| FR-007 Undo ~6 s, burst base | `category-saver` + toast | `category-saver.test.ts` (unit, fake timers); `editor-inputs.spec.ts` undo (e2e:full) |
| FR-008 published needs ≥ 1 | hook refusal; D6 server | `use-instant-categories.test.tsx` (unit); `editor-inputs.spec.ts` (e2e:full); existing D6 int tests |
| FR-009 failure reverts | `category-saver` | `category-saver.test.ts`, `use-instant-categories.test.tsx` (unit); `editor-inputs.spec.ts` routed 500 (e2e:full) |
| FR-010 not unsaved | `rebaselineCategories` | `CardEditor.test.tsx` (unit: no draft stored after a category save); `rebaseline.test.ts` |
| FR-011 new card unchanged | `CardEditor` create mode | `CardEditor.test.tsx` (unit) |
| Edge: hidden categories kept, one log line per save + undo | `items.service.update` | `item-events.int.test.ts` (int) |
| Edge: other fields stay unsaved | separate chip state; `toPatch` | `CardEditor.test.tsx` (unit) |

## Rollout

- **Migrations**: none.
- **Env / config**: none.
- **API client**: `pnpm api:openapi` (alt optional in the image payload).
- **Deploy order / flags**: normal. Old web clients still send alt; new clients may omit it, which the new API accepts. API deploys before web in the same rollout.

## Risks

| Risk | Likelihood / impact | Mitigation |
|------|---------------------|------------|
| Instant save races the form's Save | L / M | Chips never touch the draft; `toPatch` compares against the refreshed item, so a full Save never resends categories |
| Leaving during the 600 ms burst loses the change | M / M | Flush on unmount; the request runs outside React (query client), the toast store is global |
| `https://` prefill surprises a user who wants to paste | M / L | Pasting a full address collapses the doubled scheme; blur with only the scheme clears |
| Decorative alt everywhere feels like "no alt" | L / L | The article is labelled by the title heading; a future renderer without the title gets the title via `imageAlt` |

## Settle before starting

- [x] Scope of instant saves: the full editor only; the review inline form keeps Save/Cancel (D208).
- [x] Debounce length: 600 ms (D207).

## Complexity Tracking

None.
