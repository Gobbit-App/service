# Data Model: Editor navigation and unsaved-work guard

No migration, DTO or stored-data change. The draft store (IndexedDB `gobbit-drafts`, `StoredDraft v1`, keys `new:<deckId>:<type>` and `edit:<itemId>`) is unchanged (D145).

## Client-side entities

### `BackScreen` (`apps/web/src/app/back-target.ts`, D200)

| Kind | Fields | Back target |
|------|--------|-------------|
| `home` | — | `null` (no control) |
| `top` | — | `/?all=true` |
| `deck` | — | `/?all=true` |
| `new-card` | `deckSlug` | `/d/:deckSlug` |
| `card` | `deckSlug` (slug or deck id) | `/d/:deckSlug` |
| `edit` | `itemId`, `deckSlug`, `from?: 'review'` | `from === 'review'` → `/d/:deckSlug/review`, else `/i/:itemId` |

### Editor baseline (`use-editor-baseline.ts`, D203)

- `baseline: Draft` — starts as the opening draft (`draftFromItem` or `emptyDraft`).
- `rebaseline(changes: Partial<Draft>)` — merges `changes` into the baseline (out-of-band save).
- `isChanged(draft): boolean` — `!jsonEqual(draft, baseline)`.

### Unsaved-changes state (per open editor)

`dirty = isChanged(draft) || saving`

| State | Leaves without prompt? |
|-------|------------------------|
| draft = baseline, not saving | yes |
| draft ≠ baseline | no — dialog / browser prompt |
| saving | no |
| save succeeded → navigation with `ignoreBlocker` | yes |
| restore offer unanswered, nothing typed | yes |

### Guard dialog state (`useLeaveGuard`, D201)

`idle` → (blocked navigation) → `asking` → Keep editing → `idle` (address restored) | Discard → clear draft → navigation proceeds.
