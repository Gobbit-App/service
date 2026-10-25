import { describe, it, expect } from 'vitest';
import { deckCreateSchema, deckPatchSchema, deckSchema } from './deck';

const validDeckDto = {
  id: '11111111-1111-4111-8111-111111111111',
  kind: 'personal',
  slug: 'me',
  name: 'My deck',
  isPublic: false,
  isDefault: true,
  autoPublishShares: true,
  ownerAccountId: '22222222-2222-4222-8222-222222222222',
  createdAt: '2026-10-11T00:00:00.000Z',
  updatedAt: '2026-10-11T00:00:00.000Z',
  role: 'owner',
};

describe('deckSchema', () => {
  it('accepts a DTO with isDefault', () => {
    expect(deckSchema.safeParse(validDeckDto).success).toBe(true);
  });

  it('requires isDefault', () => {
    const { isDefault: _omitted, ...withoutFlag } = validDeckDto;
    expect(deckSchema.safeParse(withoutFlag).success).toBe(false);
  });

  it('requires autoPublishShares (D192)', () => {
    const { autoPublishShares: _omitted, ...withoutFlag } = validDeckDto;
    expect(deckSchema.safeParse(withoutFlag).success).toBe(false);
  });
});

describe('reserved deck slug "me"', () => {
  it('rejects slug "me" on create', () => {
    const result = deckCreateSchema.safeParse({ name: 'Me', slug: 'me' });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe('"me" is reserved');
  });

  it('rejects slug "me" on patch', () => {
    const result = deckPatchSchema.safeParse({ slug: 'me' });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe('"me" is reserved');
  });

  it('still accepts slugs that merely start with me', () => {
    expect(deckCreateSchema.safeParse({ name: 'Me', slug: 'me-too' }).success).toBe(true);
    expect(deckPatchSchema.safeParse({ slug: 'mexico' }).success).toBe(true);
  });
});

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

  it('accepts {autoPublishShares:false} and rejects a non-boolean (D192)', () => {
    expect(deckPatchSchema.safeParse({ autoPublishShares: false }).success).toBe(true);
    expect(deckPatchSchema.safeParse({ autoPublishShares: 'yes' }).success).toBe(false);
  });
});
