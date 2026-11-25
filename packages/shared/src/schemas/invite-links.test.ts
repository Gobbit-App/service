import { describe, expect, it } from 'vitest';
import { INVITE_LINK_NAME_MAX } from '../limits';
import { inviteLinkCreateSchema } from './invite-links';

describe('inviteLinkCreateSchema', () => {
  it('trims the name', () => {
    expect(inviteLinkCreateSchema.parse({ name: '  Gran  ', role: 'reader' }).name).toBe('Gran');
  });

  it('refuses an empty or too long name', () => {
    for (const name of ['   ', 'a'.repeat(INVITE_LINK_NAME_MAX + 1)])
      expect(inviteLinkCreateSchema.safeParse({ name, role: 'reader' }).success).toBe(false);
    expect(
      inviteLinkCreateSchema.safeParse({ name: 'a'.repeat(INVITE_LINK_NAME_MAX), role: 'editor' })
        .success,
    ).toBe(true);
  });

  it('refuses the owner role', () => {
    expect(inviteLinkCreateSchema.safeParse({ name: 'x', role: 'owner' }).success).toBe(false);
  });

  it('refuses extra keys', () => {
    expect(inviteLinkCreateSchema.safeParse({ name: 'x', role: 'reader', y: 1 }).success).toBe(
      false,
    );
  });
});
