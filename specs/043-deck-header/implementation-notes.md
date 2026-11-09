# Implementation notes: Deck header (043)

## Deviations

- The spec was written after the change, not through the full spec-kit flow: it's a UI rework with no API or data change.
- Search no longer runs as you type: Enter submits. `useDebounced` had no other user and was deleted with `SearchBox`.
- The view crumb's menu button is named "Category: <view>" for every view (All, Favorites, Archived, Search).
- On search results the view menu has nothing checked; picking a view leaves search.
- `items/first-visible.ts` measures the chrome bottom from `.app-header`, since the sticky chip row is gone.
- `.search-box` lost its padding; it's used only inside the sheet now.

## Known limits

- On iOS the bottom sheet can sit partly behind the on-screen keyboard (the viewport meta doesn't use `interactive-widget=resizes-content`). The box is at the top of the sheet, so it stays visible; recent searches may be covered. Left as is.
- The e2e specs were updated but not run locally (no seeded smoke session in the worktree); CI runs `@smoke` on the PR.
