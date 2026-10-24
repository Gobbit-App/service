import { describe, it, expect } from 'vitest';
import { categoryPatchSchema } from './category';

describe('categoryPatchSchema (D176)', () => {
  it('accepts a name or a visibility', () => {
    expect(categoryPatchSchema.safeParse({ name: 'Schools' }).success).toBe(true);
    expect(categoryPatchSchema.safeParse({ visibility: 'public' }).success).toBe(true);
  });

  it('rejects an empty patch', () => {
    expect(categoryPatchSchema.safeParse({}).success).toBe(false);
  });

  it('rejects unknown keys, including slug', () => {
    expect(categoryPatchSchema.safeParse({ slug: 'new' }).success).toBe(false);
  });

  it('rejects an unknown visibility and a blank name', () => {
    expect(categoryPatchSchema.safeParse({ visibility: 'secret' }).success).toBe(false);
    expect(categoryPatchSchema.safeParse({ name: '  ' }).success).toBe(false);
  });
});
