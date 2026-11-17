import { beforeEach, describe, expect, it } from 'vitest';
import type { ProfilePatch } from '@gobbit/shared';
import type { AssetRow } from '@gobbit/db';
import { createLogHash } from '../lib/log-hash';
import type { ProfileRow } from '../repositories/users.repo';
import { createProfileService, type ProfileTxRepos } from './profile.service';

const user = { id: 'u1', accountId: 'a1', email: 'ann.lee@example.com', displayName: 'ann.lee' };
const NOW = new Date('2026-01-01T00:00:00.000Z');

const world = {
  limited: false,
  usernames: {} as Record<string, { id: string }>,
  emails: {} as Record<string, { id: string }>,
  holds: {} as Record<string, { releasedBy: string }>,
  mates: [] as string[],
  assets: {} as Record<string, AssetRow>,
};

function setup(initial: Partial<ProfileRow> = {}, failWith?: unknown) {
  let row: ProfileRow = {
    id: 'u1',
    email: user.email,
    displayName: 'ann.lee',
    username: null,
    firstName: null,
    lastName: null,
    location: null,
    avatar: null,
    ...initial,
  };
  const calls: string[] = [];
  const holds: { usernameLower: string; releasedBy: string; holdUntil: Date }[] = [];
  const events: { userId: string; changes: string[]; requestId: string }[] = [];
  const logged: { event: string; fields: Record<string, unknown> }[] = [];
  let inTx = false;
  const repos: ProfileTxRepos = {
    users: {
      profileById: async () => {
        calls.push(inTx ? 'read:tx' : 'read');
        return row;
      },
      updateProfile: async (_id, patch) => {
        calls.push(inTx ? 'update:tx' : 'update');
        if (failWith) throw failWith;
        row = { ...row, ...patch };
        return row;
      },
    },
    profile: {
      insertHold: async (h) => void (inTx ? holds.push(h) : calls.push('hold:outside')),
      insertProfileEvent: async (e) => void (inTx ? events.push(e) : calls.push('event:outside')),
    },
  };
  const svc = createProfileService({
    usernameHoldDays: 30,
    now: () => NOW,
    logHash: createLogHash('k'),
    decisions: {
      record: (event: string, fields: Record<string, unknown>) =>
        void logged.push({ event, fields }),
    } as never,
    lookupRatePerHour: 30,
    rateLimits: { check: async () => ({ allowed: !world.limited, retryAfterSeconds: 7 }) },
    summaries: {
      summaries: async (ids) =>
        new Map(
          [...ids].map((id) => [
            id,
            { id, name: 'Dana Levi', username: 'dana', initials: 'DL', photo: null },
          ]),
        ),
    },
    findByUsername: async (l) => world.usernames[l] ?? null,
    findByEmail: async (e) => world.emails[e] ?? null,
    activeHold: async (l) => world.holds[l] ?? null,
    sharesDeckWith: async (_a, b) => world.mates.includes(b),
    profileById: async () => row,
    assetByPublicId: async (id) => world.assets[id] ?? null,
    transaction: async (fn) => {
      inTx = true;
      try {
        return await fn(repos);
      } finally {
        inTx = false;
      }
    },
  });
  const update = (patch: ProfilePatch) => svc.update(user, patch, 'req1');
  return { svc, update, calls, holds, events, logged, row: () => row };
}

const pgErr = (code: string, extra: object) => Object.assign(new Error('pg'), { code, ...extra });

describe('profile.service', () => {
  it('get returns the DTO with initials and no email', async () => {
    const { svc } = setup({ firstName: 'Ann', lastName: 'Lee' });
    const p = await svc.get(user);
    expect(p.initials).toBe('AL');
    expect(JSON.stringify(p)).not.toContain('example.com');
  });

  it('stores trimmed values and clears blanks', async () => {
    const t = setup({ location: 'Paris' });
    const p = await t.update({ firstName: '  Ann ', location: '   ' });
    expect(p.firstName).toBe('Ann');
    expect(p.location).toBeNull();
    expect(t.events[0]!.changes).toEqual(['firstName', 'location']);
  });

  it.each([
    ['firstName', 61],
    ['lastName', 61],
    ['location', 101],
  ] as const)('refuses %s over its limit (code points) with 422', async (field, n) => {
    const t = setup();
    await expect(t.update({ [field]: '😀'.repeat(n) })).rejects.toMatchObject({
      status: 422,
      errors: [{ path: field }],
    });
    await t.update({ [field]: '😀'.repeat(n - 1) });
    expect(t.calls).toContain('update:tx');
  });

  it('writes and logs nothing when nothing changed', async () => {
    const t = setup({ username: 'ann', firstName: 'Ann' });
    await t.update({ firstName: ' Ann ', lastName: null, username: 'ann' });
    await t.update({});
    expect(t.calls.filter((c) => c.startsWith('update'))).toEqual([]);
    expect(t.events).toEqual([]);
    expect(t.holds).toEqual([]);
    expect(t.logged).toEqual([]);
  });

  it('claims a username without a hold; decision carries a hash, not the text', async () => {
    const t = setup();
    await t.update({ username: 'Annie' });
    expect(t.holds).toEqual([]);
    expect(t.logged).toHaveLength(1);
    expect(t.logged[0]).toMatchObject({
      event: 'profile.username',
      fields: { outcome: 'claimed', requestId: 'req1', userId: 'u1' },
    });
    expect(t.logged[0]!.fields.usernameHash).toBe(createLogHash('k')('username', 'annie'));
    expect(JSON.stringify(t.logged)).not.toMatch(/annie/i);
    expect(t.events[0]!.changes).toEqual(['username']);
  });

  it('change holds the old name for the configured days', async () => {
    const t = setup({ username: 'Annie' });
    await t.update({ username: 'annabel' });
    expect(t.holds).toEqual([
      { usernameLower: 'annie', releasedBy: 'u1', holdUntil: new Date('2026-01-31T00:00:00.000Z') },
    ]);
    expect(t.logged.map((l) => [l.event, l.fields.outcome])).toEqual([
      ['profile.username', 'changed'],
      ['profile.username_hold', 'held'],
    ]);
    expect(t.logged[1]!.fields.holdUntil).toBe('2026-01-31T00:00:00.000Z');
    expect(JSON.stringify(t.logged)).not.toMatch(/annie|annabel/i);
  });

  it('clear holds the old name', async () => {
    const t = setup({ username: 'annie' });
    await t.update({ username: null });
    expect(t.holds).toHaveLength(1);
    expect(t.logged[0]).toMatchObject({ fields: { outcome: 'cleared' } });
    expect(t.row().username).toBeNull();
  });

  it('a case-only change is a change without a hold', async () => {
    const t = setup({ username: 'annie' });
    await t.update({ username: 'Annie' });
    expect(t.holds).toEqual([]);
    expect(t.logged[0]).toMatchObject({ fields: { outcome: 'changed' } });
  });

  it.each([
    ['ab', 'invalid'],
    ['Admin', 'reserved'],
  ])('refuses %s as %s and records the reason', async (name, reason) => {
    const t = setup();
    await expect(t.update({ username: name })).rejects.toMatchObject({
      status: 422,
      errors: [{ path: 'username', message: reason }],
    });
    expect(t.logged[0]).toMatchObject({ fields: { outcome: 'refused', reason } });
    expect(t.calls).toEqual([]);
    expect(JSON.stringify(t.logged)).not.toContain(name);
  });

  it.each([
    ['taken', pgErr('23505', { constraint: 'users_username_lower_uq' })],
    ['held', pgErr('P0001', { message: 'username_held' })],
  ])('maps a %s conflict to 422 unavailable and records the real reason', async (reason, err) => {
    const t = setup({}, err);
    await expect(t.update({ username: 'annie' })).rejects.toMatchObject({
      status: 422,
      errors: [{ path: 'username', message: 'unavailable' }],
    });
    expect(t.logged).toHaveLength(1);
    expect(t.logged[0]).toMatchObject({ fields: { outcome: 'refused', reason } });
    expect(t.events).toEqual([]);
  });

  it('rethrows other errors without a decision', async () => {
    const t = setup({}, new Error('boom'));
    await expect(t.update({ firstName: 'A' })).rejects.toThrow('boom');
    expect(t.logged).toEqual([]);
  });

  it('runs reads, hold, update and event inside the transaction; events hold field names only', async () => {
    const t = setup({ username: 'annie', location: 'Paris' });
    await t.update({ username: 'bob99', location: 'Rome' });
    expect(t.calls).toEqual(['read:tx', 'update:tx']);
    expect(t.holds).toHaveLength(1);
    expect(t.events).toEqual([
      { userId: 'u1', changes: ['username', 'location'], requestId: 'req1' },
    ]);
    expect(JSON.stringify(t.events)).not.toMatch(/bob99|Rome|Paris/);
  });

  describe('avatar', () => {
    const asset = (over: Partial<AssetRow> = {}) =>
      ({
        publicId: 'gobbit/profiles/u1/a',
        scope: 'profile',
        ownerUserId: 'u1',
        deckId: null,
        kind: 'image',
        width: 300,
        height: 200,
        rejectedAt: null,
        ...over,
      }) as AssetRow;
    beforeEach(() => {
      world.assets = {};
    });

    it('sets the photo with the asset dimensions and lists avatar in the event', async () => {
      world.assets['gobbit/profiles/u1/a'] = asset();
      const t = setup();
      const p = await t.update({ avatar: { publicId: 'gobbit/profiles/u1/a' } });
      expect(p.avatar).toEqual({ publicId: 'gobbit/profiles/u1/a', width: 300, height: 200 });
      expect(t.events[0]!.changes).toEqual(['avatar']);
    });

    it('replaces and removes; the same photo again changes nothing', async () => {
      world.assets['gobbit/profiles/u1/a'] = asset();
      world.assets['gobbit/profiles/u1/b'] = asset({ publicId: 'gobbit/profiles/u1/b' });
      const t = setup({ avatar: { publicId: 'gobbit/profiles/u1/a', width: 300, height: 200 } });
      await t.update({ avatar: { publicId: 'gobbit/profiles/u1/a' } });
      expect(t.events).toEqual([]);
      await t.update({ avatar: { publicId: 'gobbit/profiles/u1/b' } });
      expect(t.row().avatar?.publicId).toBe('gobbit/profiles/u1/b');
      expect((await t.update({ avatar: null })).avatar).toBeNull();
      expect(t.events.map((e) => e.changes)).toEqual([['avatar'], ['avatar']]);
    });

    it.each([
      ['unknown', undefined],
      ['foreign', asset({ ownerUserId: 'u2' })],
      ['foreign', asset({ scope: 'deck', deckId: 'd1', ownerUserId: null })],
      ['foreign', asset({ ownerUserId: null })],
      ['rejected', asset({ rejectedAt: NOW })],
    ])('refuses a %s asset with 422 and a decision', async (reason, a) => {
      if (a) world.assets[a.publicId] = a;
      const t = setup();
      await expect(
        t.update({ avatar: { publicId: 'gobbit/profiles/u1/a' } }),
      ).rejects.toMatchObject({ errors: [{ path: 'avatar.publicId', message: 'Unknown image' }] });
      expect(t.logged).toEqual([
        {
          event: 'profile.avatar',
          fields: { outcome: 'refused', reason, requestId: 'req1', userId: 'u1' },
        },
      ]);
      expect(t.events).toEqual([]);
    });
  });

  describe('lookup and checkUsername', () => {
    const dana = { id: '11111111-1111-4111-8111-111111111111' };
    beforeEach(() => {
      world.limited = false;
      world.usernames = { dana };
      world.emails = { 'dana@example.com': dana };
      world.holds = { old: { releasedBy: 'other' }, mine: { releasedBy: 'u1' } };
      world.mates = [];
    });

    it('finds by username, case-insensitively, with no email key', async () => {
      const t = setup();
      const r = await t.svc.lookup(user, ' DANA ', 'r');
      expect(r.member?.id).toBe(dana.id);
      expect(JSON.stringify(r)).not.toMatch(/email|example\.com/);
      expect(t.logged.at(-1)).toMatchObject({
        event: 'profile.lookup',
        fields: { outcome: 'found', kind: 'username', targetId: dana.id },
      });
      expect(JSON.stringify(t.logged)).not.toContain('dana"');
    });

    it('email hits only for a deck mate; a stranger gets the never-existed miss', async () => {
      const t = setup();
      expect(await t.svc.lookup(user, 'dana@example.com', 'r')).toEqual({ member: null });
      world.mates = [dana.id];
      expect((await t.svc.lookup(user, 'dana@example.com', 'r')).member?.id).toBe(dana.id);
      expect(await t.svc.lookup(user, 'nobody@example.com', 'r')).toEqual({ member: null });
      expect(await t.svc.lookup(user, 'released', 'r')).toEqual({ member: null });
    });

    it('rate limited: 429 and a refused decision', async () => {
      const t = setup();
      world.limited = true;
      await expect(t.svc.lookup(user, 'dana', 'r')).rejects.toMatchObject({ status: 429 });
      expect(t.logged.at(-1)?.fields).toMatchObject({ outcome: 'refused', reason: 'rate_limited' });
      await expect(t.svc.checkUsername(user, 'dana', 'r')).rejects.toMatchObject({ status: 429 });
    });

    it('checkUsername answers invalid, reserved, taken, held, own and free', async () => {
      const t = setup();
      const check = (n: string) => t.svc.checkUsername(user, n, 'r');
      expect(await check('a b')).toEqual({ available: false, reason: 'invalid' });
      expect(await check('admin')).toEqual({ available: false, reason: 'reserved' });
      expect(await check('Dana')).toEqual({ available: false, reason: 'unavailable' });
      expect(await check('old')).toEqual({ available: false, reason: 'unavailable' });
      expect(await check('mine')).toEqual({ available: true });
      world.usernames = { dana: { id: 'u1' } };
      expect(await check('dana')).toEqual({ available: true });
      expect(await check('brand-new')).toEqual({ available: true });
      expect(t.logged.at(-1)?.fields).toMatchObject({ outcome: 'available' });
    });
  });
});
