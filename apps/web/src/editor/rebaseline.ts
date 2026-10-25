import type { Draft } from './draft';

/** The draft with `ids` as its categories. */
export function withCategories(draft: Draft, ids: readonly string[]): Draft {
  return { ...draft, categoryIds: [...ids] };
}

export type EditorSnapshot = { draft: Draft; baseline: Draft };

/**
 * D208: after an instant category save (or its Undo) the saved set is both what the editor shows
 * and what counts as saved, so the save never reads as an unsaved change (022's guard, draft
 * autosave). Other unsaved edits in the draft are kept.
 */
export function rebaselineCategories(
  snapshot: EditorSnapshot,
  ids: readonly string[],
): EditorSnapshot {
  return {
    draft: withCategories(snapshot.draft, ids),
    baseline: withCategories(snapshot.baseline, ids),
  };
}

/** D208: a restored IndexedDB draft takes the saved categories; it can't bring back old ones. */
export function withSavedCategories(restored: Draft, savedIds: readonly string[] | null): Draft {
  return savedIds ? withCategories(restored, savedIds) : restored;
}
