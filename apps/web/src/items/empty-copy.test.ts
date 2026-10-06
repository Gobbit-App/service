import { describe, expect, it } from 'vitest';
import { emptyListCopy } from './empty-copy';

describe('emptyListCopy', () => {
  it('has distinct copy for every view', () => {
    const titles = (['all', 'favorites', 'archived'] as const).map(
      (kind) => emptyListCopy({ kind }).title,
    );
    titles.push(emptyListCopy({ kind: 'category', slug: 'food' }).title);
    expect(new Set(titles).size).toBe(4);
  });
});
