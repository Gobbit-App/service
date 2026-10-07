import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { UserRow } from '@pb/db';
import { addMember, createAccountUser, createDeck } from '@pb/db/test';
import { json, OWNER_EMAIL, setupApiTest, tokenFromMail } from './helpers';

const APP_URL = 'http://app.test';
const DAY_MS = 86_400_000;

describe('invites (P2.5, D37)', () => {
  const ctx = setupApiTest({ env: { APP_URL, CLIENT_IP_HEADER: 'x-test-ip' } });
  let reader: UserRow;
  let ipSeq = 0;

  beforeAll(async () => {
    reader = await createAccountUser(ctx.t.db);
    await addMember(ctx.t.db, ctx.world.decks.family, reader, 'reader');
    await ctx.sessionFor(reader);
  });
  beforeEach(() => ctx.mailer.clear());
  afterEach(() => ctx.clock.reset());

  const invite = (deck: string, email: string, role?: string, as = OWNER_EMAIL) =>
    ctx.app.request(`/decks/${deck}/invites`, {
      method: 'POST',
      headers: ctx.as(as),
      body: JSON.stringify(role ? { email, role } : { email }),
    });
  const click = (token: string) =>
    ctx.app.request(`/auth/callback?token=${encodeURIComponent(token)}`, {
      headers: { 'x-test-ip': `10.2.0.${++ipSeq}` },
    });
  const failureReason = (res: Response) =>
    new URL(res.headers.get('Location') ?? '', APP_URL).searchParams.get('reason');

  async function userByEmail(email: string): Promise<UserRow> {
    const { rows } = await ctx.t.pool.query(
      'SELECT id, email, account_id FROM users WHERE email = $1',
      [email],
    );
    return { id: rows[0].id, email: rows[0].email, accountId: rows[0].account_id } as UserRow;
  }

  it('invites a new address end to end', async () => {
    const res = await invite('family', 'new@example.test', 'reader');
    expect(res.status).toBe(201);
    const { membership } = await json(res);
    expect(membership).toMatchObject({
      email: 'new@example.test',
      role: 'reader',
      acceptedAt: null,
    });

    const invitee = await userByEmail('new@example.test');
    const account = await ctx.t.pool.query('SELECT id FROM accounts WHERE id = $1', [
      invitee.accountId,
    ]);
    expect(account.rows).toHaveLength(1);

    expect(ctx.mailer.sent).toHaveLength(1);
    const mail = ctx.mailer.sent[0];
    expect(mail.to).toBe('new@example.test');
    expect(mail.text).toContain('/auth/callback?token=');
    expect(mail.text).toContain('Family');
    const token = tokenFromMail(ctx.mailer);

    await ctx.sessionFor(invitee);
    expect(
      (await ctx.app.request('/decks/family', { headers: ctx.as(invitee.email) })).status,
    ).toBe(404);

    const cb = await click(token);
    expect(cb.status).toBe(303);
    expect(cb.headers.get('Location')).toBe(`${APP_URL}/d/family`);
    const row = await ctx.t.pool.query('SELECT accepted_at FROM memberships WHERE id = $1', [
      membership.id,
    ]);
    expect(row.rows[0].accepted_at).not.toBeNull();

    const decks = await json(await ctx.app.request('/decks', { headers: ctx.as(invitee.email) }));
    expect(decks.data.map((d: { slug: string; role: string }) => [d.slug, d.role])).toEqual([
      ['family', 'reader'],
    ]);

    expect(failureReason(await click(token))).toBe('used');
  });

  it('resending to a pending member is 200 with a second email', async () => {
    expect((await invite('family', 'resend@example.test')).status).toBe(201);
    const res = await invite('family', 'resend@example.test');
    expect(res.status).toBe(200);
    expect(ctx.mailer.sent).toHaveLength(2);
  });

  it('a resend replaces the earlier invite: old link dead, new role applies', async () => {
    expect((await invite('family', 'reinvite@example.test', 'reader')).status).toBe(201);
    const firstToken = tokenFromMail(ctx.mailer);

    const res = await invite('family', 'reinvite@example.test', 'editor');
    expect(res.status).toBe(200);
    expect((await json(res)).membership.role).toBe('editor');
    const secondToken = tokenFromMail(ctx.mailer);
    expect(secondToken).not.toBe(firstToken);

    ctx.clock.advance(1000);
    expect(failureReason(await click(firstToken))).toBe('expired');

    const cb = await click(secondToken);
    expect(cb.status).toBe(303);
    expect(cb.headers.get('Location')).toBe(`${APP_URL}/d/family`);
    const invitee = await userByEmail('reinvite@example.test');
    await ctx.sessionFor(invitee);
    const decks = await json(await ctx.app.request('/decks', { headers: ctx.as(invitee.email) }));
    expect(decks.data.map((d: { slug: string; role: string }) => [d.slug, d.role])).toEqual([
      ['family', 'editor'],
    ]);
  });

  it('inviting an accepted member is 409', async () => {
    expect((await invite('family', reader.email)).status).toBe(409);
  });

  it('inviting yourself is 400', async () => {
    expect((await invite('family', OWNER_EMAIL)).status).toBe(400);
  });

  it('a reader cannot invite (403 member.invite)', async () => {
    const res = await invite('family', 'by-reader@example.test', 'reader', reader.email);
    expect(res.status).toBe(403);
    expect((await json(res)).permission).toBe('member.invite');
  });

  it('accepts the maintainer role and rejects unknown roles', async () => {
    const ok = await invite('family', 'maint@example.test', 'maintainer');
    expect(ok.status).toBe(201);
    expect((await json(ok)).membership.role).toBe('maintainer');
    expect((await invite('family', 'bogus-role@example.test', 'admin')).status).toBe(400);
  });

  it('an unused invite past its TTL is expired', async () => {
    await invite('family', 'late-invite@example.test');
    const token = tokenFromMail(ctx.mailer);
    ctx.clock.advance(8 * DAY_MS);
    expect(failureReason(await click(token))).toBe('expired');
  });

  it('an invite whose membership was removed is invalid', async () => {
    await invite('family', 'removed@example.test');
    const token = tokenFromMail(ctx.mailer);
    const invitee = await userByEmail('removed@example.test');

    const del = await ctx.app.request(`/decks/family/members/${invitee.id}`, {
      method: 'DELETE',
      headers: ctx.as(),
    });
    expect(del.status).toBe(204);
    expect(failureReason(await click(token))).toBe('invalid');
  });

  it('an invite to a deleted deck is invalid', async () => {
    const doomed = await createDeck(ctx.t.db, ctx.world.owner, { slug: 'doomed' });
    await invite('doomed', 'doomed@example.test');
    const token = tokenFromMail(ctx.mailer);

    const del = await ctx.app.request(`/decks/${doomed.id}`, {
      method: 'DELETE',
      headers: ctx.as(),
    });
    expect(del.status).toBe(204);
    expect(failureReason(await click(token))).toBe('invalid');
  });
});
