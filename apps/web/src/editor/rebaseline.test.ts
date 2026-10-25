import { describe, expect, it } from 'vitest';
import { emptyDraft, isDirty } from './draft';
import { rebaselineCategories, withCategories, withSavedCategories } from './rebaseline';

const base = { ...emptyDraft('text', 'a'), title: 'Plumber' };

describe('rebaseline (D208)', () => {
  it('withCategories replaces only the categories and copies the ids', () => {
    const ids = ['b'];
    const next = withCategories(base, ids);
    expect(next).toEqual({ ...base, categoryIds: ['b'] });
    ids.push('c');
    expect(next.categoryIds).toEqual(['b']);
  });

  it('a saved category change is not an unsaved change', () => {
    const { draft, baseline } = rebaselineCategories({ draft: base, baseline: base }, ['b']);
    expect(draft.categoryIds).toEqual(['b']);
    expect(isDirty(draft, baseline)).toBe(false);
  });

  it('keeps other unsaved edits dirty', () => {
    const edited = { ...base, title: 'Plumber (new number)' };
    const { draft, baseline } = rebaselineCategories({ draft: edited, baseline: base }, ['b']);
    expect(draft.title).toBe('Plumber (new number)');
    expect(isDirty(draft, baseline)).toBe(true);
    expect(isDirty({ ...draft, title: 'Plumber' }, baseline)).toBe(false);
  });

  it('a restored draft takes the saved categories, not its own', () => {
    const stored = { ...base, title: 'Draft', categoryIds: ['old'] };
    expect(withSavedCategories(stored, ['b']).categoryIds).toEqual(['b']);
    expect(withSavedCategories(stored, null)).toBe(stored);
  });
});
