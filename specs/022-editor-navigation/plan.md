# Implementation Plan: Editor navigation and unsaved-work guard

**Branch**: `feat/022-editor-navigation` | **Date**: 2026-10-26 | **Spec**: [spec.md](./spec.md) | **Roadmap**: `PLAN.md` § Usability pass (item 1)

**Input**: Feature specification from `/specs/022-editor-navigation/spec.md`

Project override of the core template. Written for outside readers: the repository is public.

## Summary

Web-only change. No API, schema, migration or env change.

**Back.** A pure function `backTarget(screen)` (`app/back-target.ts`) returns the header's back address for every screen, or `null` on the deck list (D200). `AppHeader` takes a required `back` prop instead of always linking to the deck list; with `null` it renders a same-size spacer so the title stays in place. The edit screen reads `?from=review` (already in its address) to go back to the review queue.

**Cancel.** The editor's save bar gets a Cancel button next to Save; it navigates to the same back target, so the same guard applies.

**Guard.** `useLeaveGuard` wraps TanStack Router's `useBlocker({ withResolver: true, enableBeforeUnload })` (D201). Every in-app navigation (links, header back, Cancel, browser or gesture back) already goes through the router's history, so one blocker covers them all; reload and tab close get the browser's own prompt. A blocked navigation opens `DiscardChangesDialog`, a native modal `<dialog>` with "Keep editing" (focused, and the result of Escape) and "Discard" (D202). Navigation after a successful save passes `ignoreBlocker`.

**Dirty state.** "Unsaved" means the current draft differs from a *baseline* snapshot taken when the editor opened, or a save is in flight (D203). `useEditorBaseline` exposes `rebaseline(changes)` so 023's instant category saves can move the baseline without counting as unsaved changes.

**Drafts.** `useDraftAutosave` gains `flush()`, which writes the current draft at once. It runs when the page is hidden (`visibilitychange`, `pagehide`), on `beforeunload`, and when a navigation is blocked. "Discard" clears the draft before navigation continues (D204).

**Review inline edit.** `ReviewEditForm` uses the same baseline, guard and dialog: Cancel asks when changed, and leaving the page while the form is changed asks too. It has no draft store (D107), so flush and draft removal don't apply (D204).

## Starting point

- `main @ 4062ead`: 021 (bulk import) and 022-share-status merged; latest decision D199.
- `AppHeader` always renders `◂` → `/?all=true` (deck list), including on the deck list itself (backlog items 4, 8).
- `CardEditor` (007): `initial` is a `useState` snapshot; `isDirty(draft, initial)` gates client errors and autosave. `useDraftAutosave` writes 500 ms after the last change (D145), offers a stored draft on open and `clear()`s after a save. No warning before leaving.
- `useSaveCard` navigates with `useNavigateHref()` (`router.history.push`) after a save; `afterSaveHref` already sends `from=review` proposals back to the queue.
- `/i/$itemId/edit` validates `?from=review`; the editor lives outside the deck layout (D135). `/d/$slug/new` renders inside the deck layout, whose header is shared by all deck screens.
- Sign-out (`AppHeader`) navigates to `/sign-in` and then calls `signOut()` unconditionally.
- TanStack Router 1.170.41 / `@tanstack/history` 1.162.4: `useBlocker` supports `shouldBlockFn`, `withResolver`, `enableBeforeUnload` and `disabled`; `history.push(path, state, { ignoreBlocker })`.

## Technical Context

**Language/Version**: TypeScript (strict, ESM, no build step) on Node ≥ 22; React 19

**Primary Dependencies**: React + Vite + TanStack Router (`useBlocker`). No new dependency.

**Storage**: none on the server. Drafts stay in IndexedDB `gobbit-drafts` (D145), unchanged keys.

**Testing**: Vitest unit + Testing Library (back target, baseline, guard, dialog, editor, review form); Playwright `@smoke` / `@full`

**E2E tier**: smoke — editing a card is a critical journey (constitution V): one smoke journey (Cancel from an unchanged editor lands on the card without a prompt; a changed editor asks on header back, "Keep editing" keeps the text, "Discard" lands on the unchanged card). Full (`e2e/tests/full/editor-navigation.spec.ts`) covers the rest of Story 1's table, the deck list without back, browser back, reload with the browser prompt and the draft, and the review inline edit.

**Target Platform**: PWA on Android Chrome (iOS Safari where stated); Docker Compose on Dokploy

**Project Type**: pnpm monorepo — web only

**Performance Goals**: N/A (no network work added)

**Constraints**: web initial bundle ≤ 150 KB gzip (the guard and dialog are in the editor/review route chunks, the back function and header in the initial chunk); plain CSS; `@gobbit/shared` subpath imports only

**Scale/Scope**: every signed-in screen's header; the editor and the review inline edit

## Constitution Check

| Principle | How this plan complies |
|-----------|------------------------|
| I. Layered API | N/A — no API change |
| II. One source of truth | N/A — no DTO change; `pnpm api:openapi` not needed |
| III. Invariants in the DB | N/A — no schema change |
| IV. Private by default | Unchanged; back targets only link to screens that apply their own access checks (deck "unavailable" state) |
| V. Tests at the right tier | Unit for every piece of logic (back target, baseline, guard, flush, dialog); e2e smoke for the edit journey, full for the matrix and negatives; traceability below |
| VI. Lean web | Plain CSS; native `<dialog>`, no UI kit; guard code lives in lazy route chunks; budget gate |
| VII. Simple, optional | Router's own blocker instead of history hacks; no new dependency; no deploy impact |

## Decisions this plan pins down

| ID | Decision | ADR? |
|----|----------|------|
| D200 | Back target is a pure function of screen + loaded data; `AppHeader.back` is required (`string \| null`); deck list `null`; browse keeps its own Close | no |
| D201 | Guard = TanStack `useBlocker` (resolver + beforeunload), enabled only while dirty; post-save navigation `ignoreBlocker`; sign-out runs only after the guarded navigation lands | no |
| D202 | One `DiscardChangesDialog` on native `<dialog>.showModal()`; Keep editing default and Escape; used by the route guard and the review form's Cancel | no |
| D203 | Dirty = draft ≠ baseline snapshot, or saving; `rebaseline(changes)` for out-of-band saves (023); an unanswered restore offer alone is not dirty | no |
| D204 | `flush()` on hide / pagehide / beforeunload / blocked navigation; Discard clears the draft before proceeding; review inline edit has no draft store | no |

None outlives the feature as an architecture rule beyond what `docs/design/card-editor.md` records, so no ADR.

## Project Structure

### Documentation (this feature)

```text
specs/022-editor-navigation/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/navigation-ui.md
├── tasks.md
└── implementation-notes.md
```

### Source Code (repository root)

```text
apps/web/src/
├── app/back-target.ts (+ .test.ts)          # NEW: backTarget(screen) (D200)
├── app/AppHeader.tsx (+ .test.tsx)          # `back` prop, spacer, guarded sign-out
├── routes/index.tsx, settings.tsx, share.tsx, d.$slug.tsx, i.$itemId.tsx, i.$itemId_.edit.tsx
├── ui/NavLink.tsx                            # NavigateOptions.ignoreBlocker
├── main.tsx                                  # pass ignoreBlocker to history.push/replace
├── editor/use-editor-baseline.ts (+ test)    # NEW: baseline + rebaseline (D203)
├── editor/use-leave-guard.tsx (+ test)       # NEW: useBlocker wrapper + dialog element (D201)
├── editor/DiscardChangesDialog.tsx (+ test)  # NEW: native modal dialog (D202)
├── editor/use-page-hide.ts (+ test)          # NEW: visibilitychange/pagehide/beforeunload → callback
├── editor/use-draft-autosave.ts (+ test)     # flush(); opening snapshot for the offer
├── editor/use-save-card.ts                   # navigate with ignoreBlocker
├── editor/SaveBar.tsx                        # Cancel
├── editor/CardEditor.tsx (+ test)            # wire baseline, guard, flush, Cancel
├── review/ReviewEditForm.tsx (+ test)        # baseline, guard, Cancel confirm
└── styles.css / editor/editor.css            # spacer, dialog

e2e/tests/smoke/editor.spec.ts                # + smoke journey; existing draft test answers the prompt
e2e/tests/full/editor-navigation.spec.ts      # NEW @full
e2e/playwright.config.ts                      # WEB_SPECS + editor-navigation
```

**Structure Decision**: web only. The back function sits in `app/` next to the header (initial chunk, tiny). Guard, baseline and dialog live in `editor/` because only the editor and the review form (which already imports editor fields) use them, keeping them out of the initial chunk.

## Invariant → test traceability

| Invariant / rule | Enforced in | Test (file, tier) |
|------------------|-------------|-------------------|
| FR-001/FR-002 back table, no history | `backTarget` | `back-target.test.ts` (unit: every row of Story 1's table, deep link) |
| FR-001 deck list has no back, title stays | `AppHeader` | `AppHeader.test.tsx` (unit); `editor-navigation.spec.ts` (e2e:full) |
| FR-003 edit from review → queue | `backTarget` + edit route | `back-target.test.ts` (unit); `editor-navigation.spec.ts` (e2e:full) |
| FR-004 Cancel = back target + guard | `SaveBar`, `CardEditor` | `CardEditor.test.tsx` (unit); `editor.spec.ts` (e2e:smoke) |
| FR-005 dirty = ≠ baseline or saving; rebaseline | `useEditorBaseline`, `CardEditor` | `use-editor-baseline.test.ts`, `CardEditor.test.tsx` (unit) |
| FR-006 in-app navigation held, dialog | `useLeaveGuard` | `use-leave-guard.test.tsx` (unit, memory history); `editor.spec.ts` (e2e:smoke); browser back in `editor-navigation.spec.ts` (e2e:full) |
| FR-007 beforeunload | `useBlocker` `enableBeforeUnload` | `use-leave-guard.test.tsx` (unit: event default prevented only when dirty); `editor-navigation.spec.ts` reload (e2e:full) |
| FR-008 flush on hide/leave | `flush()`, `usePageHide` | `use-draft-autosave.test.ts`, `use-page-hide.test.ts` (unit); reload journey (e2e:full) |
| FR-009 discard removes draft; save removes draft | `CardEditor` discard → `autosave.clear()` | `CardEditor.test.tsx` (unit) |
| FR-010 post-save navigation not held | `useSaveCard` `ignoreBlocker` | `use-leave-guard.test.tsx` (unit); existing editor smoke saves (e2e:smoke) |
| FR-011 review inline edit | `ReviewEditForm` | `ReviewEditForm.test.tsx` (unit); `editor-navigation.spec.ts` (e2e:full) |
| FR-012 dialog a11y | `DiscardChangesDialog` | `DiscardChangesDialog.test.tsx` (unit: label, default focus, Escape, focus return) |
| Edge: sign-out from dirty editor | `AppHeader` | `AppHeader.test.tsx` (unit); `editor.spec.ts` draft test (e2e:smoke) |
| Edge: unanswered restore offer not dirty | `CardEditor` | `CardEditor.test.tsx` (unit) |

## Rollout

- **Migrations**: none.
- **Env / config**: none.
- **API client**: no.
- **Deploy order / flags**: normal web deploy.

## Risks

| Risk | Likelihood / impact | Mitigation |
|------|---------------------|------------|
| A navigation path bypasses the router history (e.g. `window.location`) | L / M | All in-app navigation goes through `NavigateContext` → `router.history`; `beforeunload` covers full-page loads |
| IndexedDB write on `pagehide` doesn't finish before the page dies | M / L | Flush also on `visibilitychange` (fires earlier on mobile) and when a leave starts; autosave still runs every 500 ms |
| Existing smoke tests that reload or sign out a dirty editor hang on the prompt | M / L | Update them to answer the dialog / browser prompt (that is the new behaviour) |
| Multiple open review forms each block → dialogs shown one after another | L / L | Accepted; rare, and each form guards its own changes (spec: each editor guards its own) |

## Settle before starting

- [x] No open questions; remaining choices are recorded as D200–D204.

## Complexity Tracking

None.
