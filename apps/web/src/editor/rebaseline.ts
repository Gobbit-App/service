import type { Draft } from './draft';

/** The draft with `ids` as its categories. */
export function withCategories(draft: Draft, ids: readonly string[]): Draft {
  return { ...draft, categoryIds: [...ids] };
}

/** D208: a restored IndexedDB draft takes the saved categories; it can't bring back old ones. */
export function withSavedCategories(restored: Draft, savedIds: readonly string[] | null): Draft {
  return savedIds ? withCategories(restored, savedIds) : restored;
}
