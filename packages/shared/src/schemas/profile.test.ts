import { describe, expect, it } from 'vitest';
import {
  cardCreatorSchema,
  displayNameOf,
  memberLookupRequest,
  memberSummarySchema,
  profilePatchSchema,
} from './profile';

const id = '3f2b8c1e-5d4a-4e7b-9a10-2c6d8e0f1a2b';

describe('profilePatchSchema', () => {
  it('trims and turns blank into null', () => {
    const r = profilePatchSchema.parse({ firstName: '  Dana ', lastName: '   ', location: '' });
    expect(r).toEqual({ firstName: 'Dana', lastName: null, location: null });
  });
  it('counts names in code points (60/61)', () => {
    expect(profilePatchSchema.safeParse({ firstName: '😀'.repeat(60) }).success).toBe(true);
    expect(profilePatchSchema.safeParse({ firstName: '😀'.repeat(61) }).success).toBe(false);
    expect(profilePatchSchema.safeParse({ lastName: '😀'.repeat(61) }).success).toBe(false);
  });
  it('counts location in code points (100/101)', () => {
    expect(profilePatchSchema.safeParse({ location: '😀'.repeat(100) }).success).toBe(true);
    expect(profilePatchSchema.safeParse({ location: '😀'.repeat(101) }).success).toBe(false);
  });
  it('reports username reasons', () => {
    const msg = (u: string) => {
      const r = profilePatchSchema.safeParse({ username: u });
      return r.success ? 'ok' : r.error.issues[0]!.message;
    };
    expect(msg('dana')).toBe('ok');
    expect(msg('a@b')).toBe('invalid');
    expect(msg('admin')).toBe('reserved');
  });
  it('accepts avatar null and { publicId }', () => {
    expect(profilePatchSchema.parse({ avatar: null }).avatar).toBeNull();
    expect(profilePatchSchema.parse({ avatar: { publicId: 'x' } }).avatar).toEqual({
      publicId: 'x',
    });
  });
});

describe('displayNameOf', () => {
  const displayName = 'stored';
  it('joins names and falls back', () => {
    expect(displayNameOf({ firstName: 'A', lastName: 'B', displayName })).toBe('A B');
    expect(displayNameOf({ firstName: 'A', lastName: null, displayName })).toBe('A');
    expect(displayNameOf({ firstName: null, lastName: 'B', displayName })).toBe('B');
    expect(displayNameOf({ firstName: ' ', lastName: null, displayName })).toBe('stored');
  });
});

describe('summaries', () => {
  const base = { id, name: null, username: null, initials: 'D', photo: null };
  it('parse and strip email', () => {
    expect(memberSummarySchema.parse({ ...base, email: 'a@b.c' })).toEqual(base);
    expect(cardCreatorSchema.parse({ ...base, id: null, email: 'a@b.c' })).not.toHaveProperty(
      'email',
    );
  });
  it('lookup query bounds', () => {
    expect(memberLookupRequest.safeParse({ query: '' }).success).toBe(false);
    expect(memberLookupRequest.safeParse({ query: 'x'.repeat(255) }).success).toBe(false);
  });
});
