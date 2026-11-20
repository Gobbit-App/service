/** D445 (Accountability, constitution VIII): a category address that fell back to a name hash. */
export type CategoryDecisions = {
  'categories.slug_derived': {
    outcome: 'derived';
    reason: 'hash_fallback';
    deckId: string;
    userId: string;
    categoryId: string;
  };
};
