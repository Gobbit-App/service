---

description: "Task list for 022-editor-navigation"
---

# Tasks: Editor navigation and unsaved-work guard

**Input**: Design documents from `/specs/022-editor-navigation/`

**Prerequisites**: plan.md, spec.md, research.md (D200–D204), data-model.md, contracts/navigation-ui.md

**Tests**: REQUIRED (constitution V). Every row of the plan's traceability table maps to a test task below.

**Organization**: Tasks are grouped by user story.

## Format: `[ID] [P?] [Story] [Tier?] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: US1 back target, US2 Cancel, US3 unsaved-work guard
- **[Tier]**: `[unit]` `*.test.ts(x)` next to code, `[e2e:smoke]` `e2e/tests/smoke/`, `[e2e:full]` `e2e/tests/full/` (constitution V, ADR-053)

---

## Phase 1: Foundational (Blocking Prerequisites)

- [x] T001 `NavigateOptions.ignoreBlocker?: boolean` in apps/web/src/ui/NavLink.tsx; pass `{ ignoreBlocker }` as the third argument of `router.history.push/replace` in apps/web/src/main.tsx
- [x] T002 [P] `useEditorBaseline(initial)` → `{ baseline, isChanged(draft), rebaseline(changes: Partial<Draft>) }` in apps/web/src/editor/use-editor-baseline.ts; [unit] use-editor-baseline.test.ts (unchanged, changed, undone back to original, rebaseline merges only the given fields and keeps other edits dirty) (D203)

**Checkpoint**: navigation options and baseline available

---

## Phase 2: User Story 1 — Back goes one level up (Priority: P1) 🎯 MVP

**Goal**: contextual header back; none on the deck list.

**Independent Test**: from each screen in Story 1's table, back lands on the listed target; the deck list has no back control.

- [x] T003 [P] [US1] `backTarget(screen: BackScreen): string | null` in apps/web/src/app/back-target.ts per data-model `BackScreen` table; [unit] back-target.test.ts covering every row (home `null`; top and deck `/?all=true`; new-card and card `/d/:slug`; edit `/i/:id`, edit `from=review` `/d/:slug/review`; card by deck id before the deck loads) (D200)
- [x] T004 [US1] `AppHeader` required prop `back: string | null`: link "Back" (`◂`) to the target, or an `aria-hidden` spacer `app-header__back--none` of the same size, in apps/web/src/app/AppHeader.tsx + styles.css; [unit] AppHeader.test.tsx (link href, no link on null, spacer present)
- [x] T005 [US1] Wire every screen: routes/index.tsx `home`; routes/settings.tsx and routes/share.tsx `top`; routes/d.$slug.tsx `deck` or `new-card` when the path ends in `/new`; routes/i.$itemId.tsx `card` (deck slug, or deck id before load); routes/i.$itemId_.edit.tsx `edit` with `from`
- [x] T006 [US1] [e2e:full] back matrix in e2e/tests/full/editor-navigation.spec.ts: card page → deck; deck → deck list; deck list has no Back link; new card → deck; edit from review (`?from=review`) → review queue; add `editor-navigation` to `WEB_SPECS` in e2e/playwright.config.ts

**Checkpoint**: back goes one level up everywhere

---

## Phase 3: User Story 2 — Cancel an edit (Priority: P1)

**Goal**: explicit Cancel in the editor and review form, same target as back.

**Independent Test**: unchanged editor → Cancel → card, no prompt.

- [x] T007 [US2] `SaveBar` gains `onCancel` → "Cancel" `type="button"` ghost button after Save in apps/web/src/editor/SaveBar.tsx
- [x] T008 [US2] `CardEditor` takes `backHref: string` (edit: from `backTarget`; create: the deck) and Cancel navigates there in apps/web/src/editor/CardEditor.tsx; routes pass it (routes/i.$itemId_.edit.tsx, routes/d.$slug.new.tsx); [unit] CardEditor.test.tsx: Cancel with no changes navigates at once to the back target

**Checkpoint**: Cancel works (guard comes in US3)

---

## Phase 4: User Story 3 — Never lose work by accident (Priority: P1)

**Goal**: guard every way out of a changed editor; flush drafts.

**Independent Test**: type, then header back / link / browser back / reload: each asks; Keep editing keeps the text; after a forced reload the draft is offered.

- [x] T009 [P] [US3] `DiscardChangesDialog` (native `<dialog>`, `showModal()` with `open` fallback; title "Discard changes?", description "Your changes to this card haven't been saved."; "Keep editing" autofocus; `cancel` event → Keep editing; focus returns to the previously focused element) in apps/web/src/editor/DiscardChangesDialog.tsx + editor.css; [unit] DiscardChangesDialog.test.tsx (named, default focus, Escape/cancel → keep, discard callback, focus return) (D202)
- [x] T010 [P] [US3] `usePageHide(callback)` (visibilitychange→hidden, pagehide, beforeunload) in apps/web/src/editor/use-page-hide.ts; [unit] use-page-hide.test.ts
- [x] T011 [US3] `useDraftAutosave`: compare against the passed baseline for writes, check the stored-draft offer against the opening snapshot only, add `flush()` (immediate write when loaded, no pending offer, not cleared, differs) in apps/web/src/editor/use-draft-autosave.ts; [unit] use-draft-autosave.test.ts (flush writes before the debounce; no flush while the offer is unanswered or after clear; baseline change doesn't re-offer) (D204)
- [x] T012 [US3] `useLeaveGuard({ when, onAttempt?, onDiscard?, onKeep? })` wrapping `useBlocker({ shouldBlockFn, withResolver: true, enableBeforeUnload: true, disabled: !when })`, returning the dialog element in apps/web/src/editor/use-leave-guard.tsx; [unit] use-leave-guard.test.tsx with a memory-history router (unchanged → navigates; changed → dialog, Keep stays at the address, Discard runs `onDiscard` then navigates; `ignoreBlocker` push not held; beforeunload default prevented only when changed) (D201)
- [x] T013 [US3] `CardEditor`: baseline via `useEditorBaseline`, dirty = changed or saving, guard with `onAttempt = autosave.flush`, `onDiscard = autosave.clear`, `usePageHide(autosave.flush)`; `useSaveCard` navigates with `{ ignoreBlocker: true }` in apps/web/src/editor/CardEditor.tsx, use-save-card.ts; [unit] CardEditor.test.tsx (changed + Cancel → dialog; Keep → still editing; Discard → draft cleared + navigates; unanswered restore offer → leaves without prompt; save success not held)
- [x] T014 [US3] `ReviewEditForm`: baseline, Cancel confirms when changed (dialog, no navigation), route guard while changed, saving counts as changed in apps/web/src/review/ReviewEditForm.tsx; [unit] ReviewEditForm.test.tsx (unchanged Cancel closes; changed Cancel asks; Keep stays; Discard closes) (FR-011)
- [x] T015 [US3] Guarded sign-out: navigate to `/sign-in`, run `signOut()` only when the router location reaches `/sign-in` (history subscription), in apps/web/src/app/AppHeader.tsx; [unit] AppHeader.test.tsx (blocked → no sign-out; proceeds → sign-out)
- [x] T016 [US3] [e2e:smoke] journey in e2e/tests/smoke/editor.spec.ts: card → Edit → Cancel (unchanged) lands on the card; Edit → change title → header Back → dialog, Keep editing keeps text and URL; Cancel → Discard → card unchanged; update the existing draft/sign-out smoke test to answer the browser prompt and the Discard dialog
- [x] T017 [US3] [e2e:full] in e2e/tests/full/editor-navigation.spec.ts: browser back on a changed editor asks, Keep editing keeps the address; reload of a changed editor shows the browser prompt, accept → reopen offers the latest text (flush); review inline edit Cancel asks when changed; Escape keeps editing

**Checkpoint**: all three stories done

---

## Phase 5: Polish & Cross-Cutting Concerns

- [x] T018 Update specs/README.md decision reservation note (022-share-status D192–D199; 022-editor-navigation D200–D204, 023-editor-inputs D205–D209, 024-card-actions D210–D216)
- [x] T019 specs/022-editor-navigation/implementation-notes.md (decisions not in the plan, deviations, the `rebaseline` hook for 023); copy deviations into docs/design/card-editor.md "Deviations"; at most one line in docs/architecture.md
- [x] T020 Gates: `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm test:unit`, `pnpm build:web`, `pnpm budget`; run the e2e specs against the local stack
- [x] T021 PR with the template, "E2E tier: smoke — editing a card is a critical journey"

---

## Dependencies & Execution Order

- Phase 1 → US1 (T003–T006) and US2 (T007–T008) can run in parallel; US3 depends on T001, T002 and T008 (Cancel uses the guard).
- T009, T010, T011 in parallel; T012 before T013–T015; T016–T017 after T013–T015.

### Parallel example (US3)

```text
T009 DiscardChangesDialog   T010 usePageHide   T011 useDraftAutosave.flush
```

## Implementation Strategy

MVP = US1 (fixes the two broken back controls). US2 adds Cancel; US3 the guard. All three ship in one PR because Cancel without the guard would discard work silently.
