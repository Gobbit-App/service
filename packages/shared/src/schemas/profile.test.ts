import { describe, expect, it } from 'vitest';
import {
  cardCreatorSchema,
  displayNameOf,
  MEMBER_NAME,
  memberLookupRequest,
  memberSummarySchema,
  profilePatchSchema,
} from './profile';

const id = '3f2b8c1e-5d4a-4e7b-9a10-2c6d8e0f1a2b';

describe('profilePatchSchema', () => {
  it('checks types only; the service enforces trim, limits and username shape', () => {
    const long = { firstName: 'x'.repeat(200), username: 'a b' };
    expect(profilePatchSchema.parse(long)).toEqual(long);
    expect(profilePatchSchema.safeParse({ firstName: 5 }).success).toBe(false);
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
  it('passes a chain-built displayName through', () => {
    expect(MEMBER_NAME).toBe('Member');
    const none = { firstName: null, lastName: null };
    expect(displayNameOf({ ...none, displayName: 'alice' })).toBe('alice');
    expect(displayNameOf({ ...none, displayName: MEMBER_NAME })).toBe('Member');
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
