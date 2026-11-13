import { describe, expect, it } from 'vitest';
import { canEditEventNotify, eventAudience, type EventAudienceInput } from './audience';

const members = [
  { userId: 'owner', role: 'owner' as const },
  { userId: 'editor', role: 'editor' as const },
  { userId: 'reader', role: 'reader' as const },
];

const base: EventAudienceInput = {
  mode: 'everyone',
  userIds: [],
  createdBy: 'editor',
  members,
  categoryVisibilities: ['shared'],
  personalDeck: false,
};

describe('eventAudience', () => {
  it('everyone = every member who can read the card', () => {
    expect(eventAudience(base).sort()).toEqual(['editor', 'owner', 'reader']);
  });

  it('drops members who cannot see a private-only card', () => {
    const r = eventAudience({ ...base, categoryVisibilities: ['private'] });
    expect(r).not.toContain('reader');
    expect(r).toContain('owner');
  });

  it('people = the creator plus the picked members who are still members', () => {
    expect(eventAudience({ ...base, mode: 'people', userIds: ['reader', 'gone'] }).sort()).toEqual([
      'editor',
      'reader',
    ]);
  });

  it('me = the creator only, nobody = no one (no owner fallback)', () => {
    expect(eventAudience({ ...base, mode: 'me' })).toEqual(['editor']);
    expect(eventAudience({ ...base, mode: 'nobody' })).toEqual([]);
    expect(eventAudience({ ...base, mode: 'me', createdBy: 'gone' })).toEqual([]);
  });

  it('forces me on a personal deck', () => {
    expect(eventAudience({ ...base, personalDeck: true })).toEqual(['editor']);
  });
});

describe('canEditEventNotify', () => {
  const input = {
    userId: 'editor',
    role: 'editor' as const,
    createdBy: 'editor',
    creatorIsMember: true,
    status: 'published' as const,
  };

  it('lets the creator change notify', () => {
    expect(canEditEventNotify(input)).toBe(true);
  });

  it('refuses others while the creator is a member', () => {
    expect(canEditEventNotify({ ...input, userId: 'owner', role: 'owner' })).toBe(false);
  });

  it('lets owners take over once the creator left', () => {
    expect(
      canEditEventNotify({ ...input, userId: 'owner', role: 'owner', creatorIsMember: false }),
    ).toBe(true);
    expect(
      canEditEventNotify({ ...input, userId: 'other', role: 'editor', creatorIsMember: false }),
    ).toBe(false);
  });

  it('lets publishers edit a proposal', () => {
    expect(
      canEditEventNotify({ ...input, userId: 'owner', role: 'owner', status: 'proposed' }),
    ).toBe(true);
    expect(
      canEditEventNotify({
        ...input,
        userId: 'reader',
        role: 'reader',
        createdBy: null,
        status: 'proposed',
      }),
    ).toBe(false);
  });
});
