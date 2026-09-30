import { describe, it, expect } from 'vitest';
import { inviteCreateSchema } from './membership';

describe('inviteCreateSchema', () => {
  it('defaults the role to reader', () => {
    expect(inviteCreateSchema.parse({ email: 'a@b.co' })).toEqual({
      email: 'a@b.co',
      role: 'reader',
    });
  });

  it('accepts maintainer', () => {
    expect(inviteCreateSchema.parse({ email: 'a@b.co', role: 'maintainer' }).role).toBe(
      'maintainer',
    );
  });

  it('rejects unknown roles', () => {
    expect(inviteCreateSchema.safeParse({ email: 'a@b.co', role: 'admin' }).success).toBe(false);
  });

  it.each(['nope', 'a@', '@b.co', ''])('rejects malformed email %j', (email) => {
    expect(inviteCreateSchema.safeParse({ email }).success).toBe(false);
  });

  it('rejects unknown keys', () => {
    expect(inviteCreateSchema.safeParse({ email: 'a@b.co', extra: 1 }).success).toBe(false);
  });
});
