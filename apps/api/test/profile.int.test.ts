import { beforeEach, describe, expect, it } from 'vitest';
import type { UserRow } from '@gobbit/db';
import { addMember, createAccountUser } from '@gobbit/db/test';
import { json, OWNER_EMAIL, setupApiTest } from './helpers';

/** 046 traceability: part 1 (profile, username, lookup, invite by username). */
describe('profile (046 part 1)', () => {
  const ctx = setupApiTest();
  const ingestToken = `ing_${'A'.repeat(43)}`;

  const req = (path: string, method: string, email: string, body?: unknown) =>
    ctx.app.request(path, {
      method,
      headers: ctx.as(email),
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  const patch = (u: UserRow, body: unknown) => req('/me/profile', 'PATCH', u.email, body);
  const me = async (u: UserRow) => (await json(await req('/me', 'GET', u.email))).profile;
  const check = (u: UserRow, username: string) =>
    req('/me/username/check', 'POST', u.email, { username });
  const lookup = (u: UserRow, query: string) => req('/members/lookup', 'POST', u.email, { query });
  const invite = (email: string, body: unknown) =>
    req('/decks/family/invites', 'POST', email, body);
  /** Problem body without the per-request fields. */
  const problem = async (res: Response) => {
    const body = await json(res);
    delete body.requestId;
    delete body.instance;
    return body;
  };
  const profileEvents = async (u: UserRow) =>
    (await ctx.t.pool.query('SELECT changes FROM profile_events WHERE user_id = $1', [u.id])).rows;

  async function member(opts: Parameters<typeof createAccountUser>[1] = {}): Promise<UserRow> {
    const u = await createAccountUser(ctx.t.db, opts);
    await ctx.sessionFor(u);
    return u;
  }

  describe('GET /me and PATCH /me/profile', () => {
    it('returns the profile on /me, round trips and persists', async () => {
      const u = await member();
      expect(await me(u)).toMatchObject({
        username: null,
        firstName: null,
        lastName: null,
        location: null,
        avatar: null,
      });

      const res = await patch(u, {
        username: 'Round.Trip',
        firstName: ' Ada ',
        lastName: 'Lovelace',
        location: 'London',
      });
      expect(res.status).toBe(200);
      const saved = await json(res);
      expect(saved).toMatchObject({
        username: 'Round.Trip',
        firstName: 'Ada',
        lastName: 'Lovelace',
        location: 'London',
      });
      expect(await me(u)).toMatchObject(saved);
    });

    it('clearing one field keeps the others', async () => {
      const u = await member({ firstName: 'Keep', lastName: 'Me', location: 'Here' });
      for (const body of [{ location: null }, { lastName: '   ' }]) {
        expect((await patch(u, body)).status).toBe(200);
      }
      expect(await me(u)).toMatchObject({ firstName: 'Keep', lastName: null, location: null });
    });

    it('422 over the limits', async () => {
      const u = await member();
      expect((await patch(u, { firstName: 'x'.repeat(61) })).status).toBe(422);
      expect((await patch(u, { location: 'y'.repeat(101) })).status).toBe(422);
      const ok = await patch(u, { firstName: 'x'.repeat(60), location: 'y'.repeat(100) });
      expect(ok.status).toBe(200);
    });

    it('422 with a reason for invalid, reserved and taken usernames', async () => {
      const taker = await member({ username: 'taken-name' });
      const u = await member();
      const invalid = await patch(u, { username: 'a b' });
      expect(invalid.status).toBe(422);
      expect(JSON.stringify(await json(invalid))).toContain('invalid');
      const reserved = await patch(u, { username: 'admin' });
      expect(reserved.status).toBe(422);
      expect(JSON.stringify(await json(reserved))).toContain('reserved');
      const taken = await patch(u, { username: 'TAKEN-name' });
      expect(taken.status).toBe(422);
      expect((await json(taken)).errors).toEqual([{ path: 'username', message: 'unavailable' }]);
      expect((await me(taker)).username).toBe('taken-name');
    });

    it('two members racing for one username: one 200, one 422', async () => {
      const [a, b] = [await member(), await member()];
      const res = await Promise.all([
        patch(a, { username: 'race-name' }),
        patch(b, { username: 'race-name' }),
      ]);
      expect(res.map((r) => r.status).sort()).toEqual([200, 422]);
    });

    it('a released name is held for others, allowed for the releaser, same 422 as taken', async () => {
      const a = await member({ username: 'held-old' });
      const b = await member();
      await member({ username: 'really-taken' });
      expect((await patch(a, { username: 'held-new' })).status).toBe(200);

      const held = await patch(b, { username: 'held-old' });
      const taken = await patch(b, { username: 'really-taken' });
      expect(held.status).toBe(422);
      expect(await problem(held)).toEqual(await problem(taken));

      expect((await patch(a, { username: 'held-old' })).status).toBe(200);
    });

    it('writes a profile_events row with field names only, in the same transaction', async () => {
      const u = await member({ firstName: 'Old' });
      const res = await patch(u, { firstName: 'Secret', location: 'Paris', username: 'evt-name' });
      expect(res.status).toBe(200);
      const rows = await profileEvents(u);
      expect(rows).toHaveLength(1);
      expect([...rows[0].changes].sort()).toEqual(['firstName', 'location', 'username']);
      expect(JSON.stringify(rows)).not.toMatch(/Secret|Paris|evt-name/);

      // a no-op writes nothing
      expect((await patch(u, { firstName: 'Secret' })).status).toBe(200);
      expect(await profileEvents(u)).toHaveLength(1);
    });

    it('a refused username leaves no event and no other change', async () => {
      await member({ username: 'rollback-taken' });
      const u = await member({ firstName: 'Before' });
      const res = await patch(u, { firstName: 'After', username: 'rollback-taken' });
      expect(res.status).toBe(422);
      expect((await me(u)).firstName).toBe('Before');
      expect(await profileEvents(u)).toHaveLength(0);
    });
  });

  describe('POST /me/username/check', () => {
    it('answers available, invalid, reserved and unavailable (taken and held alike)', async () => {
      await member({ username: 'chk-taken' });
      const a = await member({ username: 'chk-old' });
      await patch(a, { username: 'chk-new' });
      const u = await member();
      const answer = async (name: string) => json(await check(u, name));

      expect(await answer('chk-free')).toEqual({ available: true });
      expect(await answer('a b')).toEqual({ available: false, reason: 'invalid' });
      expect(await answer('admin')).toEqual({ available: false, reason: 'reserved' });
      const taken = await answer('chk-taken');
      expect(taken).toEqual({ available: false, reason: 'unavailable' });
      expect(await answer('chk-old')).toEqual(taken);
      // the releaser sees their own held name as available
      expect(await json(await check(a, 'chk-old'))).toEqual({ available: true });
    });
  });

  describe('POST /members/lookup', () => {
    it('finds by username (case-insensitive) without email or location', async () => {
      const target = await member({ username: 'Look.Up', location: 'Secret City' });
      const caller = await member();
      const res = await lookup(caller, 'look.UP');
      expect(res.status).toBe(200);
      const body = await json(res);
      expect(body.member).toMatchObject({ id: target.id, username: 'Look.Up' });
      expect(body.member).not.toHaveProperty('email');
      expect(body.member).not.toHaveProperty('location');
      expect(JSON.stringify(body)).not.toMatch(/Secret City|@/);
    });

    it('finds a deck mate by email; a stranger or unknown address is the same miss', async () => {
      const mate = await member();
      await addMember(ctx.t.db, ctx.world.decks.family, mate, 'reader');
      const stranger = await member();
      const caller = await member();
      await addMember(ctx.t.db, ctx.world.decks.family, caller, 'reader');

      const hit = await json(await lookup(caller, mate.email.toUpperCase()));
      expect(hit.member).toMatchObject({ id: mate.id });
      expect(hit.member).not.toHaveProperty('email');

      const miss = await json(await lookup(caller, stranger.email));
      const never = await json(await lookup(caller, 'never-existed@example.test'));
      expect(miss).toEqual({ member: null });
      expect(never).toEqual(miss);
    });

    it('a soft-deleted member is a miss', async () => {
      const gone = await member({ username: 'gone-user' });
      const caller = await member();
      await ctx.t.pool.query('UPDATE users SET deleted_at = now() WHERE id = $1', [gone.id]);
      expect(await json(await lookup(caller, 'gone-user'))).toEqual({ member: null });
    });

    it('the 31st call within the hour is 429', async () => {
      const caller = await member();
      for (let i = 0; i < 30; i++) {
        expect((await lookup(caller, `nobody-${i}`)).status).toBe(200);
      }
      const res = await lookup(caller, 'nobody-31');
      expect(res.status).toBe(429);
      expect(res.headers.get('Retry-After')).not.toBeNull();
    });
  });

  describe('invite by username', () => {
    beforeEach(() => ctx.mailer.clear());

    it('invites, mails the member, and never returns the address', async () => {
      const invitee = await member({ username: 'invite-me' });
      const res = await invite(OWNER_EMAIL, { username: 'Invite-Me', role: 'reader' });
      expect(res.status).toBe(201);
      expect(JSON.stringify(await json(res))).not.toContain(invitee.email);
      expect(ctx.mailer.sent).toHaveLength(1);
      expect(ctx.mailer.sent[0].to).toBe(invitee.email);
    });

    it('/members shows email null for a username holder to others, the real one to themselves', async () => {
      const u = await member({ username: 'masked-one' });
      await addMember(ctx.t.db, ctx.world.decks.family, u, 'reader');
      const emailOf = async (viewerEmail: string) =>
        (await json(await req('/decks/family/members', 'GET', viewerEmail))).data.find(
          (m: { userId: string }) => m.userId === u.id,
        ).email;
      expect(await emailOf(OWNER_EMAIL)).toBeNull();
      expect(await emailOf(u.email)).toBe(u.email);
    });

    it('unknown and released usernames answer the same 404', async () => {
      const a = await member({ username: 'rel-old' });
      await patch(a, { username: 'rel-new' });
      const unknown = await invite(OWNER_EMAIL, { username: 'no-such-member' });
      const released = await invite(OWNER_EMAIL, { username: 'rel-old' });
      expect(unknown.status).toBe(404);
      expect(await problem(released)).toEqual(await problem(unknown));
      expect(ctx.mailer.sent).toHaveLength(0);
    });
  });

  describe('session-only routes and owner-only location', () => {
    it('an ingest token is refused on every new route', async () => {
      const headers = {
        Authorization: `Bearer ${ingestToken}`,
        'Content-Type': 'application/json',
      };
      const calls: [string, string, unknown?][] = [
        ['GET', '/me'],
        ['PATCH', '/me/profile', { firstName: 'x' }],
        ['POST', '/me/username/check', { username: 'abc' }],
        ['POST', '/members/lookup', { query: 'abc' }],
        ['POST', '/decks/family/invites', { username: 'abc' }],
      ];
      for (const [method, path, body] of calls) {
        const res = await ctx.app.request(path, {
          method,
          headers,
          body: body === undefined ? undefined : JSON.stringify(body),
        });
        expect(res.status, `${method} ${path}`).toBe(401);
      }
    });

    it('location appears only on /me', async () => {
      const u = await member({ username: 'loc-user', location: 'Hidden Town' });
      await addMember(ctx.t.db, ctx.world.decks.family, u, 'reader');
      const viewer = await member();

      expect(await (await req('/me', 'GET', u.email)).text()).toContain('Hidden Town');
      const others = [
        await lookup(viewer, 'loc-user'),
        await req('/decks/family/members', 'GET', OWNER_EMAIL),
        await req('/decks/family/members', 'GET', u.email),
        await check(viewer, 'loc-user'),
      ];
      for (const res of others) {
        expect(res.status).toBe(200);
        expect(await res.text()).not.toMatch(/Hidden Town|"location"/);
      }
    });
  });
});
