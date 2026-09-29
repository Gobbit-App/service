import { beforeAll, describe, expect, it } from 'vitest';
import type { MemberRole } from '@pb/shared';
import type { UserRow } from '@pb/db';
import { addMember, createAccountUser } from '@pb/db/test';
import { json, setupApiTest } from './helpers';

describe('memberships and the permission matrix (P2.4, D33–D36)', () => {
  const ctx = setupApiTest();
  let reader: UserRow;
  let pending: UserRow;
  let outsider: UserRow;

  /** A user with a membership on `family` and live test sessions. */
  async function member(role: MemberRole, acceptedAt: Date | null = new Date()): Promise<UserRow> {
    const user = await createAccountUser(ctx.t.db);
    await addMember(ctx.t.db, ctx.world.decks.family, user, role, { acceptedAt });
    await ctx.sessionFor(user);
    return user;
  }

  beforeAll(async () => {
    reader = await member('reader');
    pending = await member('reader', null);
    outsider = await createAccountUser(ctx.t.db);
    await ctx.sessionFor(outsider);
  });

  const get = (path: string, email: string) => ctx.app.request(path, { headers: ctx.as(email) });
  const send = (method: string, path: string, email: string, body?: unknown) =>
    ctx.app.request(path, {
      method,
      headers: ctx.as(email),
      body: body === undefined ? undefined : JSON.stringify(body),
    });

  describe('reader', () => {
    it('lists family with role reader and not the owner’s other decks', async () => {
      const body = await json(await get('/decks', reader.email));
      expect(body.data.map((d: { slug: string; role: string }) => [d.slug, d.role])).toEqual([
        ['family', 'reader'],
      ]);
    });

    it('reads items', async () => {
      expect((await get('/decks/family/items', reader.email)).status).toBe(200);
    });

    it('cannot create items (403 naming the permission)', async () => {
      const res = await send('POST', '/decks/family/items', reader.email, {
        type: 'text',
        title: 'Nope',
        payload: {},
      });
      expect(res.status).toBe(403);
      const body = await json(res);
      expect(body).toMatchObject({
        type: '/problems/forbidden',
        permission: 'item.create',
        role: 'reader',
      });
    });

    it('can favorite an item', async () => {
      const itemId = Object.values(ctx.world.cards)[0].id;
      expect((await send('POST', `/items/${itemId}/favorite`, reader.email)).status).toBe(204);
    });

    it('cannot delete the deck', async () => {
      const res = await send('DELETE', '/decks/family', reader.email);
      expect(res.status).toBe(403);
      expect((await json(res)).permission).toBe('deck.delete');
    });

    it('can list members but not remove the owner', async () => {
      expect((await get('/decks/family/members', reader.email)).status).toBe(200);
      const res = await send('DELETE', `/decks/family/members/${ctx.world.owner.id}`, reader.email);
      expect(res.status).toBe(403);
    });
  });

  it('a pending member gets 404', async () => {
    expect((await get('/decks/family', pending.email)).status).toBe(404);
    expect((await get('/decks/family/items', pending.email)).status).toBe(404);
  });

  it('an outsider gets 404', async () => {
    expect((await get('/decks/family', outsider.email)).status).toBe(404);
  });

  describe('owner', () => {
    it('lists the implicit owner, the reader and the pending member', async () => {
      const body = await json(await get('/decks/family/members', ctx.world.owner.email));
      const byId = new Map(body.data.map((m: { userId: string }) => [m.userId, m]));

      expect(byId.get(ctx.world.owner.id)).toMatchObject({ role: 'owner', implicit: true });
      expect(byId.get(reader.id)).toMatchObject({ role: 'reader', implicit: false });
      expect(byId.get(pending.id)).toMatchObject({ role: 'reader', acceptedAt: null });
      expect(body.data[0].userId).toBe(ctx.world.owner.id);
    });

    it('removes a member, who then gets 404', async () => {
      const gone = await member('editor');
      expect((await get('/decks/family', gone.email)).status).toBe(200);

      const res = await send('DELETE', `/decks/family/members/${gone.id}`, ctx.world.owner.email);
      expect(res.status).toBe(204);
      expect((await get('/decks/family', gone.email)).status).toBe(404);
    });

    it('cannot remove themselves', async () => {
      const res = await send(
        'DELETE',
        `/decks/family/members/${ctx.world.owner.id}`,
        ctx.world.owner.email,
      );
      expect(res.status).toBe(400);
    });

    it('removing a non-member is 404', async () => {
      const res = await send(
        'DELETE',
        `/decks/family/members/${outsider.id}`,
        ctx.world.owner.email,
      );
      expect(res.status).toBe(404);
    });
  });
});
