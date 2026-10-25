# Research: Editor navigation and unsaved-work guard

Decisions continue the project-wide D numbering. The Usability pass gives this feature **D200–D204** (022-share-status uses D192–D199). None needs an ADR. `/speckit-clarify` was skipped (the spec is detailed); the open points it would have raised are settled here.

## What exists today

- `AppHeader` renders a `◂` link to `/?all=true` on every signed-in screen, the deck list included.
- Navigation in the app goes through `NavigateContext` → `router.history.push/replace` (`main.tsx`), and `<NavLink>` anchors call it on plain clicks. TanStack Router's history runs registered blockers on push, replace, back/go and `popstate`, and handles `beforeunload` for blockers that ask for it.
- The editor keeps an opening snapshot (`initial`) and autosaves drafts to IndexedDB 500 ms after the last change (D145); nothing is written while a restore offer is unanswered.

## D200 — Back target

- **Decision**: `backTarget(screen)` in `apps/web/src/app/back-target.ts`, a pure function of a small `BackScreen` union. It returns an address or `null`:
  - `home` → `null`
  - `deck` (list, categories, favourites, search, review, archived, links, settings, log, import, shares) → `/?all=true`
  - `new-card` → the deck (`/d/:slug`)
  - `card` → the card's deck (`/d/:slug`, or the deck id before the deck loads; the deck route accepts both)
  - `edit` → `/d/:slug/review` when opened with `?from=review`, else the card page `/i/:id`
  - `top` (settings, share) → `/?all=true`

  `AppHeader` takes a required `back: string | null`, so every screen must decide. With `null` it renders an empty spacer the size of the back control, so the title keeps its place (Story 1 scenario 5). The deck list address stays `/?all=true` because `/` redirects to the last deck.
- **Browse**: Browse is full screen without the app header (D139); its Close (✕) already returns to the deck list it came from. It is left as is; 024 restyles it.
- **Rationale**: a pure function is unit-testable over the whole table and never depends on history (FR-002), so deep links behave the same.
- **Alternatives considered**: `history.back()` when there is in-app history (rejected: the spec forbids history-dependent targets and it fails on deep links); route `staticData` per file route (rejected: the targets need loaded data such as the deck slug and `from`, and a single table is easier to review).

## D201 — Guard on the router's blocker

- **Decision**: `useLeaveGuard({ when, onAttempt, onDiscard })` wraps `useBlocker({ shouldBlockFn, withResolver: true, enableBeforeUnload: true, disabled: !when })`.
  - Enabled only while dirty, so an unchanged editor never prompts (FR-005, SC-003) and `beforeunload` is registered only then (FR-007).
  - `shouldBlockFn` calls `onAttempt` (draft flush, D204) and blocks.
  - The resolver drives the dialog: Keep editing → `reset()` (the router restores the address on `popstate`), Discard → `await onDiscard()` then `proceed()`.
  - `NavigateOptions` gains `ignoreBlocker`; `main.tsx` passes it to `history.push/replace`. `useSaveCard` uses it after a successful save (FR-010).
  - Sign-out: the header navigates to `/sign-in` and subscribes to the router history; `signOut()` runs only when the location actually reaches `/sign-in`. A Keep editing leaves the session alone (spec edge case).
- **Rationale**: the router's own blocker sees every history navigation the app makes, including browser and gesture back (popstate), with no hand-written history patching. `withResolver` lets the app render its own dialog instead of `window.confirm`.
- **Alternatives considered**: `window.confirm` in `shouldBlockFn` (rejected: not styleable, Keep editing can't be the focused default, blocks the main thread); wrapping `NavigateContext` with a check (rejected: misses popstate and router `<Link>`s).

## D202 — The dialog

- **Decision**: `DiscardChangesDialog` renders a native `<dialog>` opened with `showModal()`: title "Discard changes?", body "Your changes to this card haven't been saved.", buttons "Keep editing" (`autoFocus`) and "Discard". The `cancel` event (Escape) is prevented and treated as Keep editing; on Keep editing focus returns to the element focused before the dialog opened. `aria-labelledby`/`aria-describedby` name it. The same component is used by the route guard and by the review form's Cancel.
- **Rationale**: a modal `<dialog>` makes the rest of the page inert (focus trapped, FR-012) and is supported by every browser the PWA targets, with no library. jsdom lacks `showModal`, so the component falls back to the `open` attribute there (tests only).
- **Alternatives considered**: a `role="dialog"` div like `PublicSwitchDialog` (rejected: no focus trap); a UI kit dialog (rejected: constitution VI).

## D203 — Dirty state and baseline

- **Decision**: `useEditorBaseline(initial)` holds the baseline snapshot and returns `{ baseline, isChanged(draft), rebaseline(changes: Partial<Draft>) }`. The editor is dirty when `isDirty(draft, baseline) || saving` (FR-005, scenario 8). `rebaseline` merges changes into the baseline: after an out-of-band save (023's instant category save calls `rebaseline({ categoryIds })`), those fields no longer count as unsaved, while other edits still do. Autosave compares against the same baseline; the stored-draft offer is still checked against the opening snapshot only, so rebaselining never re-offers a draft.
- **Restore offer**: an unanswered restore banner does not by itself make the editor dirty; the on-screen draft still equals the baseline, so nothing is lost by leaving (the stored draft stays). Typing while the offer is open does make it dirty.
- **Rationale**: one comparison everywhere (errors shown, autosave, guard); the baseline API is the hook 023 needs (023 FR-010).
- **Alternatives considered**: a "touched" flag (rejected: undoing a change back to the original must not prompt, scenario 7).

## D204 — Draft flush and discard

- **Decision**: `useDraftAutosave` gains `flush()`, which writes the current draft immediately when it may (loaded, no unanswered offer, not cleared, differs from baseline) and cancels the pending debounce. `usePageHide(callback)` calls it on `visibilitychange` → hidden, `pagehide` and `beforeunload`; the guard calls it when a navigation is attempted (FR-008). Discard calls `autosave.clear()` (removes every key the editor wrote and stops autosave) before navigation continues (FR-009).
- **Review inline edit**: it never had a draft store (D107: a few fields on a proposal). It gets the baseline, guard, Cancel confirmation and `beforeunload`; flush and draft removal don't apply. Adding drafts there is out of scope.
- **Rationale**: `visibilitychange` is the last reliable event on mobile; `beforeunload` gives the write time while the browser prompt is open.
- **Alternatives considered**: `navigator.sendBeacon` (rejected: drafts are local, not sent to the server); synchronous `localStorage` mirror (rejected: a second store for the same drafts).
