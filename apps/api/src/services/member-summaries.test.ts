import { describe, expect, it, vi } from 'vitest';
import type { UserSummaryRow } from '../repositories/users.repo';
import { createMemberSummaries } from './member-summaries';

const ID = '11111111-1111-4111-8111-111111111111';
const ID2 = '22222222-2222-4222-8222-222222222222';
const row = (o: Partial<UserSummaryRow>): UserSummaryRow => ({
  id: ID,
  firstName: null,
  lastName: null,
  username: null,
  avatar: null,
  ...o,
});
const make = (rows: UserSummaryRow[]) => {
  const summariesByIds = vi.fn(async (ids: string[]) => rows.filter((r) => ids.includes(r.id)));
  return { svc: createMemberSummaries({ users: { summariesByIds } }), summariesByIds };
};

describe('member summaries', () => {
  it('builds profile name, initials and photo; one call for duplicate ids', async () => {
    const { svc, summariesByIds } = make([
      row({
        firstName: 'Dana',
        lastName: 'Levi',
        username: 'dana',
        avatar: { publicId: 'p', width: 4, height: 5 },
      }),
      row({ id: ID2, firstName: ' ', lastName: 'Cohen' }),
    ]);
    const map = await svc.summaries([ID, ID2, ID, ID2]);
    expect(summariesByIds).toHaveBeenCalledTimes(1);
    expect(summariesByIds.mock.calls[0]![0]).toEqual([ID, ID2]);
    expect(map.get(ID)).toEqual({
      id: ID,
      name: 'Dana Levi',
      username: 'dana',
      initials: 'DL',
      photo: { publicId: 'p', width: 4, height: 5 },
    });
    expect(map.get(ID2)!.name).toBe('Cohen');
  });

  it('initials come from the username with no names, and are empty with neither; no email is read', async () => {
    const { svc } = make([row({ username: 'dana' }), row({ id: ID2 })]);
    const map = await svc.summaries([ID, ID2]);
    expect(map.get(ID)).toMatchObject({ name: null, initials: 'D', photo: null });
    expect(map.get(ID2)).toMatchObject({ name: null, username: null, initials: '' });
    expect(JSON.stringify([...map.values()])).not.toMatch(/"(email|location)"/);
  });

  it('cardCreator: personal -> null; null/unknown/deleted creator -> placeholder; else summary', async () => {
    const { svc } = make([row({ firstName: 'Dana' })]);
    const map = await svc.summaries([ID, ID2]);
    const placeholder = { id: null, name: null, username: null, initials: '', photo: null };
    expect(svc.cardCreator(ID, 'personal', map)).toBeNull();
    expect(svc.cardCreator(null, 'shared', map)).toEqual(placeholder);
    expect(svc.cardCreator(ID2, 'communal', map)).toEqual(placeholder);
    expect(svc.cardCreator(ID, 'shared', map)).toBe(map.get(ID));
  });
});
