# Contract: Navigation and unsaved-work UI

UI contract for 022. No HTTP contract changes.

## 1. Header back control (D200)

- Rendered as a link (`<a>`, accessible name "Back") left of the title, on every signed-in screen except the deck list.
- On the deck list: no link; an `aria-hidden` spacer of the same size keeps the title in place.
- Target per [data-model `BackScreen`](../data-model.md). Never `history.back()`.

## 2. Editor Cancel (FR-004)

- A `type="button"` "Cancel" next to "Save card" in the save bar; never disabled.
- Click → navigate to the editor's back target (the guard applies).

## 3. "Discard changes?" dialog (D202, FR-006, FR-012)

| Part | Value |
|------|-------|
| Element | native `<dialog>` opened with `showModal()` |
| Accessible name | "Discard changes?" (`aria-labelledby`) |
| Description | "Your changes to this card haven't been saved." (`aria-describedby`) |
| Buttons | "Keep editing" (focused on open), "Discard" |
| Escape | same as Keep editing |
| Keep editing | dialog closes, navigation cancelled, address unchanged, focus returns to the element focused before |
| Discard | editor draft removed, then navigation continues (route guard) or the form closes (review Cancel) |

## 4. Editor programming interface for 023 (D203)

`CardEditor` (edit mode) uses `useEditorBaseline(initial)`:

```ts
const { baseline, isChanged, rebaseline } = useEditorBaseline(initial);
// after an instant category save succeeded:
rebaseline({ categoryIds: saved.categoryIds });
```

`rebaseline` merges the given fields into the baseline; the guard, autosave and "show errors once changed" all compare against the baseline, so the saved fields stop counting as unsaved.

## 5. Browser behaviour

- With unsaved changes, reload/close shows the browser's own leave-page prompt (`beforeunload`); the wording is the browser's.
- On `visibilitychange` (hidden), `pagehide` and `beforeunload`, the editor writes its draft at once.
