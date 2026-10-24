import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { users, type DeckRow, type UserRow } from '@pb/db';
import { addMember, createAccountUser, createDeck } from '@pb/db/test';
import { createMembershipsRepo } from '../src/repositories/memberships.repo';
import { json, OTHER_EMAIL, setupApiTest } from './helpers';

/** 019 (D185): owners change an accepted member's role. */
describe('member role change (019)', () => {
  const ctx = setupApiTest();
  let coOwner: UserRow;
  let maintainer: UserRow;
  let editor: UserRow;
  let reader: UserRow;
  let pending: UserRow;
  let deck: DeckRow;

  beforeAll(async () => {
    coOwner = await createAccountUser(ctx.t.db);
    maintainer = await createAccountUser(ctx.t.db);
    editor = await createAccountUser(ctx.t.db);
    reader = await createAccountUser(ctx.t.db);
    pending = await createAccountUser(ctx.t.db);
    for (const user of [coOwner, maintainer, editor, reader]) await ctx.sessionFor(user);
  });

  beforeEach(async () => {
    deck = await createDeck(ctx.t.db, ctx.world.owner);
    await addMember(ctx.t.db, deck, coOwner, 'owner');
    await addMember(ctx.t.db, deck, maintainer, 'maintainer');
    await addMember(ctx.t.db, deck, editor, 'editor');
    await addMember(ctx.t.db, deck, reader, 'reader');
    await addMember(ctx.t.db, deck, pending, 'reader', { acceptedAt: null });
  });

  const patch = (target: string, role: string, email?: string, deckRef = deck.id) =>
    ctx.app.request(`/decks/${deckRef}/members/${target}`, {
      method: 'PATCH',
      headers: ctx.as(email),
      body: JSON.stringify({ role }),
    });

  it('the owner promotes a reader; the role applies on the next request', async () => {
    const forbidden = await ctx.app.request(`/decks/${deck.id}/categories`, {
      method: 'POST',
      headers: ctx.as(reader.email),
      body: JSON.stringify({ name: 'Nope' }),
    });
    expect(forbidden.status).toBe(403);

    const res = await patch(reader.id, 'maintainer');
    expect(res.status).toBe(200);
    expect(await json(res)).toMatchObject({
      userId: reader.id,
      email: reader.email,
      role: 'maintainer',
      implicit: false,
    });

    const allowed = await ctx.app.request(`/decks/${deck.id}/categories`, {
      method: 'POST',
      headers: ctx.as(reader.email),
      body: JSON.stringify({ name: 'Now allowed' }),
    });
    expect(allowed.status).toBe(201);
  });

  it('a co-owner can change roles too, also by slug', async () => {
    const res = await patch(editor.id, 'reader', coOwner.email, deck.slug);
    expect(res.status).toBe(200);
    expect((await json(res)).role).toBe('reader');
  });

  it('the same role is a 200 no-op', async () => {
    const res = await patch(editor.id, 'editor');
    expect(res.status).toBe(200);
    expect((await json(res)).role).toBe('editor');
  });

  it.each([
    ['maintainer', () => maintainer.email],
    ['editor', () => editor.email],
    ['reader', () => reader.email],
  ])('a %s gets 403', async (_role, email) => {
    expect((await patch(editor.id, 'reader', email())).status).toBe(403);
  });

  it('a non-member gets 404', async () => {
    expect((await patch(editor.id, 'reader', OTHER_EMAIL)).status).toBe(404);
  });

  it('refuses the caller’s own role (409 own-role)', async () => {
    const res = await patch(coOwner.id, 'reader', coOwner.email);
    expect(res.status).toBe(409);
    expect((await json(res)).type).toBe('/problems/own-role');
  });

  it('refuses an implicit owner (409 implicit-owner)', async () => {
    const res = await patch(ctx.world.owner.id, 'reader', coOwner.email);
    expect(res.status).toBe(409);
    expect((await json(res)).type).toBe('/problems/implicit-owner');
  });

  it('refuses a pending invite (409 invite-pending)', async () => {
    const res = await patch(pending.id, 'editor');
    expect(res.status).toBe(409);
    expect((await json(res)).type).toBe('/problems/invite-pending');
  });

  it('an unknown user is 404; a bad role or body is 400', async () => {
    expect((await patch(crypto.randomUUID(), 'reader')).status).toBe(404);
    expect((await patch(editor.id, 'admin')).status).toBe(400);
    const extra = await ctx.app.request(`/decks/${deck.id}/members/${editor.id}`, {
      method: 'PATCH',
      headers: ctx.as(),
      body: JSON.stringify({ role: 'reader', email: 'x@example.test' }),
    });
    expect(extra.status).toBe(400);
  });

  it('two co-owners demoting each other on an account with no users: one stays owner (409 last-owner)', async () => {
    const lone = await createAccountUser(ctx.t.db);
    const orphanDeck = await createDeck(ctx.t.db, lone);
    const second = await createAccountUser(ctx.t.db);
    await ctx.sessionFor(second);
    await addMember(ctx.t.db, orphanDeck, coOwner, 'owner');
    await addMember(ctx.t.db, orphanDeck, second, 'owner');
    await ctx.t.db.update(users).set({ deletedAt: new Date() }).where(eq(users.id, lone.id));

    const results = await Promise.all([
      patch(second.id, 'maintainer', coOwner.email, orphanDeck.id),
      patch(coOwner.id, 'maintainer', second.email, orphanDeck.id),
    ]);
    // The loser is refused under the lock (409 last-owner) or, if it arrives after the commit,
    // no longer has the permission (403). Either way one owner remains.
    const statuses = results.map((r) => r.status).sort();
    expect(statuses[0]).toBe(200);
    expect([403, 409]).toContain(statuses[1]);

    const { rows } = await ctx.t.pool.query(
      `SELECT count(*)::int AS n FROM memberships
       WHERE deck_id = $1 AND role = 'owner' AND deleted_at IS NULL`,
      [orphanDeck.id],
    );
    expect(rows[0].n).toBe(1);
  });

  it('updateRole with the guard refuses to demote the only owner membership', async () => {
    const lone = await createAccountUser(ctx.t.db);
    const orphanDeck = await createDeck(ctx.t.db, lone);
    const membership = await addMember(ctx.t.db, orphanDeck, coOwner, 'owner');
    const repo = createMembershipsRepo(ctx.t.db);
    expect(
      await repo.updateRole(membership.id, orphanDeck.id, 'reader', { guardLastOwner: true }),
    ).toBe('last-owner');
    const second = await createAccountUser(ctx.t.db);
    await addMember(ctx.t.db, orphanDeck, second, 'owner');
    expect(
      await repo.updateRole(membership.id, orphanDeck.id, 'reader', { guardLastOwner: true }),
    ).toMatchObject({ role: 'reader' });
  });
});
