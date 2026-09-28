import { describe, it, expect } from 'vitest';
import { pocketbookCreateSchema, pocketbookPatchSchema } from './pocketbook';

describe('pocketbookCreateSchema', () => {
  it('accepts {name:"Family"}', () => {
    const result = pocketbookCreateSchema.safeParse({ name: 'Family' });
    expect(result.success).toBe(true);
  });

  it('accepts {name:"משפחה", slug:"family-he", kind:"shared", isPublic:true}', () => {
    const result = pocketbookCreateSchema.safeParse({
      name: 'משפחה',
      slug: 'family-he',
      kind: 'shared',
      isPublic: true,
    });
    expect(result.success).toBe(true);
  });

  it('rejects unknown key', () => {
    const result = pocketbookCreateSchema.safeParse({
      name: 'Family',
      unknownKey: 'value',
    });
    expect(result.success).toBe(false);
  });

  it('rejects bad kind', () => {
    const result = pocketbookCreateSchema.safeParse({
      name: 'Family',
      kind: 'invalid',
    });
    expect(result.success).toBe(false);
  });
});

describe('pocketbookPatchSchema', () => {
  it('rejects {}', () => {
    const result = pocketbookPatchSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('rejects {ownerAccountId:"x"}', () => {
    const result = pocketbookPatchSchema.safeParse({
      ownerAccountId: 'x',
    });
    expect(result.success).toBe(false);
  });

  it('accepts {isPublic:true}', () => {
    const result = pocketbookPatchSchema.safeParse({
      isPublic: true,
    });
    expect(result.success).toBe(true);
  });
});
