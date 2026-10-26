# Implementation notes: 022-editor-navigation

Plan: `specs/022-editor-navigation/plan.md`, tasks: `tasks.md`. Branch `feat/022-editor-navigation`. Web only: no API, schema, migration or route change, no new dependency. E2E tier: smoke (`e2e/tests/smoke/editor.spec.ts`: the editor goes back to its card; leaving with changes asks first) plus full (`e2e/tests/full/editor-navigation.spec.ts`: back matrix, deck list without back, browser back, Escape, draft flush, browser prompt, type switch and save without a prompt, review inline edit). Decisions D200–D204 (`research.md`); no ADR.

## Hook for 023-editor-inputs (instant category saves)

023 FR-010 needs category changes saved on an existing card not to count as unsaved. The editor's dirty state is "draft differs from a baseline snapshot", and the baseline can be moved:

```ts
// apps/web/src/editor/use-editor-baseline.ts
useEditorBaseline(initial: Draft | (() => Draft)): {
  baseline: Draft;
  isChanged: (draft: Draft) => boolean;
  rebaseline: (changes: Partial<Draft>) => void; // stable identity
};
```

In `CardEditor.tsx` the hook is already called as `const { baseline, isChanged } = useEditorBaseline(initial)`. 023 destructures `rebaseline` too and calls `rebaseline({ categoryIds: saved.categoryIds })` after the instant save succeeds (and again after an Undo). That one call updates everything that compares with the baseline: shown field errors, the guard (`useLeaveGuard({ when: changed || saving })`), and autosave (`useDraftAutosave({ …, baseline })`, which drops the stored draft once the draft equals the baseline again). The restore offer is checked against the opening snapshot only, so rebaselining never re-offers a draft. Other unsaved edits (title, body, …) still count.

## Decisions not specified by the plan

- **`historyNavigate(history)`** (`app/history-navigate.ts`) is the `NavigateContext` implementation `main.tsx` uses; it passes `ignoreBlocker` to `history.push/replace`. The test router uses the same function, so tests go through the real blocker.
- **`useLeaveGuard` keeps one stable `shouldBlockFn`** (callbacks in a ref), so the router keeps one blocker registered while `when` holds. If removing the draft fails on Discard, the error is logged and the navigation still continues (the left-over draft is offered next time).
- **`flush` skips** before the store has loaded, while a restore offer is open, after `clear()`, and when the draft equals the baseline; it cancels the pending debounced write.
- **Create editor `?type=` change** replaces the URL with `ignoreBlocker`, so switching type with changes never asks.
- **Sign-out**: `onArrival(history, '/sign-in', run)` runs `signOut()` only when the next navigation lands on `/sign-in`; any other next navigation cancels it, and a new click replaces a pending one. The button is disabled only once signing out actually starts, so Keep editing leaves it usable.
- **Review inline edit**: Cancel shows the same dialog when changed (Discard → `onCancel`); leaving the page with changes is held by `useLeaveGuard({ when: changed })`; "Edit fully" is a normal link and is held like any other navigation.

## Deviations from the plan

- **Browser back while asking**: the router holds a back/forward after the browser has moved, so the address bar shows the previous address while the dialog is open; Keep editing moves it back. The `@full` spec asserts the address after the answer, not during the dialog.
- **Dialog styles in `styles.css`**, not `editor/editor.css`: the review queue uses the dialog without loading the editor's stylesheet.
- **Sign-out helper** `app/on-arrival.ts` (own tests) instead of an inline history subscription in `AppHeader`.
- **Tests render guarded components in a real router** (`test/render-in-router.tsx`, memory history or the jsdom browser history for `beforeunload`); `CardEditor`, `ReviewEditForm` and `ReviewCard` tests moved to it. The new guard cases of `CardEditor` are in `CardEditor.guard.test.tsx` to keep the file small.
- **The review inline edit is guarded only while changed** (not while saving): its save continues after the form closes and there is no draft to lose.
- **Reload prompt in e2e**: `page.reload()` does not raise Chromium's prompt under Playwright, so the `@full` spec checks the prompt with `page.close({ runBeforeUnload: true })` and checks the flush by reloading after Keep editing (Escape).
