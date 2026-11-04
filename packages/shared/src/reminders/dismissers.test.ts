import { describe, expect, it } from 'vitest';
import { canChangeDismissers, reminderDismissers, type DismissersInput } from './dismissers';

const members: DismissersInput['members'] = [
  { userId: 'owner', role: 'owner' },
  { userId: 'maint', role: 'maintainer' },
  { userId: 'ed1', role: 'editor' },
  { userId: 'ed2', role: 'editor' },
  { userId: 'reader', role: 'reader' },
];

const base: DismissersInput = {
  mode: 'me',
  userIds: [],
  createdBy: 'ed1',
  members,
  categoryVisibilities: ['shared'],
  personalDeck: false,
};

const sorted = (ids: string[]) => [...ids].sort();

describe('reminderDismissers', () => {
  it('"me" is the creator', () => {
    expect(reminderDismissers(base)).toEqual(['ed1']);
  });

  it('"writers" is every writer, never readers', () => {
    expect(sorted(reminderDismissers({ ...base, mode: 'writers' }))).toEqual(
      sorted(['owner', 'maint', 'ed1', 'ed2']),
    );
  });

  it('"people" is the listed writers plus the creator; readers in the list are dropped', () => {
    expect(
      sorted(reminderDismissers({ ...base, mode: 'people', userIds: ['ed2', 'reader'] })),
    ).toEqual(sorted(['ed1', 'ed2']));
  });

  it('drops people who left the deck', () => {
    expect(reminderDismissers({ ...base, mode: 'people', userIds: ['ghost'] })).toEqual(['ed1']);
  });

  it('drops editors who cannot see a card in private categories only', () => {
    const r = reminderDismissers({
      ...base,
      mode: 'writers',
      categoryVisibilities: ['private'],
    });
    expect(sorted(r)).toEqual(sorted(['owner', 'maint']));
  });

  it('falls back to the owners when nobody is left', () => {
    expect(reminderDismissers({ ...base, createdBy: 'ghost' })).toEqual(['owner']);
    expect(reminderDismissers({ ...base, createdBy: null })).toEqual(['owner']);
    const demoted = members.map((m) =>
      m.userId === 'ed1' ? { ...m, role: 'reader' as const } : m,
    );
    expect(reminderDismissers({ ...base, members: demoted })).toEqual(['owner']);
  });

  it('forces "me" on a personal deck', () => {
    expect(reminderDismissers({ ...base, mode: 'writers', personalDeck: true })).toEqual(['ed1']);
  });
});

describe('canChangeDismissers', () => {
  it('lets the creator change the rule', () => {
    expect(
      canChangeDismissers({
        userId: 'ed1',
        role: 'editor',
        createdBy: 'ed1',
        creatorIsMember: true,
      }),
    ).toBe(true);
  });

  it('refuses others while the creator is a member', () => {
    expect(
      canChangeDismissers({
        userId: 'own',
        role: 'owner',
        createdBy: 'ed1',
        creatorIsMember: true,
      }),
    ).toBe(false);
  });

  it('lets owners (only) change it once the creator left', () => {
    expect(
      canChangeDismissers({
        userId: 'own',
        role: 'owner',
        createdBy: 'ed1',
        creatorIsMember: false,
      }),
    ).toBe(true);
    expect(
      canChangeDismissers({
        userId: 'm',
        role: 'maintainer',
        createdBy: null,
        creatorIsMember: false,
      }),
    ).toBe(false);
  });
});
