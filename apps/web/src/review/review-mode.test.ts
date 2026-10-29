import type { ReviewEntry } from '@gobbit/shared';
import { describe, expect, it } from 'vitest';
import { makeItem } from '../test/fixtures';
import { reviewMode, suggestedCategory } from './review-mode';

type Target = NonNullable<ReviewEntry['target']>;
type Action = 'new' | 'possible_duplicate' | 'update';

/** Builds a ReviewEntry for tests; dedup is null when no action is given. */
function entry(
  opts: { action?: Action; target?: Target | null; newCategory?: string | null } = {},
): ReviewEntry {
  const { action, target = null, newCategory = null } = opts;
  return {
    item: makeItem({ id: 'p' }),
    target,
    job: {
      id: 'j',
      channel: 'pwa',
      sharedBy: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      dedup: action ? { action, itemId: target?.id ?? null, similarity: null, via: 'title' } : null,
      newCategory,
      sourcePreview: null,
    },
  } as unknown as ReviewEntry;
}

const TARGET = { id: 't1', title: 'Old card' } as unknown as Target;

describe('reviewMode (D106)', () => {
  it('returns new when job is null', () => {
    const e = { item: makeItem({ id: 'p' }), target: TARGET, job: null } as unknown as ReviewEntry;
    expect(reviewMode(e)).toEqual({ kind: 'new' });
  });

  it('returns new when dedup is null', () => {
    expect(reviewMode(entry({ target: TARGET }))).toEqual({ kind: 'new' });
  });

  it('returns new for action new even with a target', () => {
    expect(reviewMode(entry({ action: 'new', target: TARGET }))).toEqual({ kind: 'new' });
  });

  it('returns update with the target for action update', () => {
    expect(reviewMode(entry({ action: 'update', target: TARGET }))).toEqual({
      kind: 'update',
      target: TARGET,
    });
  });

  it('returns duplicate for action possible_duplicate with a target', () => {
    const mode = reviewMode(entry({ action: 'possible_duplicate', target: TARGET }));
    expect(mode.kind).toBe('duplicate');
    expect(mode).toEqual({ kind: 'duplicate', target: TARGET });
  });

  it('returns new for action update when target is null', () => {
    expect(reviewMode(entry({ action: 'update', target: null }))).toEqual({ kind: 'new' });
  });
});

describe('suggestedCategory (D106)', () => {
  it('returns the suggested name when canCreate is true', () => {
    expect(suggestedCategory(entry({ newCategory: 'Recipes' }), true)).toBe('Recipes');
  });

  it('returns null when canCreate is false', () => {
    expect(suggestedCategory(entry({ newCategory: 'Recipes' }), false)).toBeNull();
  });

  it('returns null for a blank suggestion', () => {
    expect(suggestedCategory(entry({ newCategory: '  ' }), true)).toBeNull();
  });

  it('trims the suggested name', () => {
    expect(suggestedCategory(entry({ newCategory: ' Recipes ' }), true)).toBe('Recipes');
  });

  it('returns null when job is null', () => {
    const e = { item: makeItem({ id: 'p' }), target: null, job: null } as unknown as ReviewEntry;
    expect(suggestedCategory(e, true)).toBeNull();
  });
});
