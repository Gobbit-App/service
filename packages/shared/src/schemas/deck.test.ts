import { describe, it, expect } from 'vitest';
import { deckCreateSchema, deckPatchSchema } from './deck';

describe('deckCreateSchema', () => {
  it('accepts {name:"Family"}', () => {
    const result = deckCreateSchema.safeParse({ name: 'Family' });
    expect(result.success).toBe(true);
  });

  it('accepts {name:"משפחה", slug:"family-he", kind:"shared", isPublic:true}', () => {
    const result = deckCreateSchema.safeParse({
      name: 'משפחה',
      slug: 'family-he',
      kind: 'shared',
      isPublic: true,
    });
    expect(result.success).toBe(true);
  });

  it('rejects unknown key', () => {
    const result = deckCreateSchema.safeParse({
      name: 'Family',
      unknownKey: 'value',
    });
    expect(result.success).toBe(false);
  });

  it('rejects bad kind', () => {
    const result = deckCreateSchema.safeParse({
      name: 'Family',
      kind: 'invalid',
    });
    expect(result.success).toBe(false);
  });
});

describe('deckPatchSchema', () => {
  it('rejects {}', () => {
    const result = deckPatchSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('rejects {ownerAccountId:"x"}', () => {
    const result = deckPatchSchema.safeParse({
      ownerAccountId: 'x',
    });
    expect(result.success).toBe(false);
  });

  it('accepts {isPublic:true}', () => {
    const result = deckPatchSchema.safeParse({
      isPublic: true,
    });
    expect(result.success).toBe(true);
  });
});
