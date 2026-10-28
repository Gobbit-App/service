import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { asc, eq } from 'drizzle-orm';
import {
  adminWaitlistInviteResultSchema,
  adminWaitlistPageSchema,
  meSchema,
  problemSchema,
  type WaitlistKind,
  type WaitlistStatus,
} from '@pb/shared';
import { waitlistEntries, waitlistEvents, type UserRow, type WaitlistEntryRow } from '@pb/db';
import { addMember, createAccountUser, createDeck } from '@pb/db/test';
import { SESSION_COOKIE } from '../src/lib/cookies';
import { createLogHash } from '../src/lib/log-hash';
import { createPruneWaitlist } from '../src/jobs/prune-waitlist';
import { createWaitlistRepo } from '../src/repositories/waitlist.repo';
import { adminTxRepos } from '../src/services/admin-wiring';
import { createWaitlistAdminService } from '../src/services/waitlist-admin.service';
import type { PlatformAdmin } from '../src/access/platform-admin';
import { captureLogger, expectDecision } from './capture-logger';
import { json, sessionTokenFromSetCookie, setupApiTest, tokenFromMail } from './helpers';

const ADMIN_EMAIL = 'platform-admin@example.test';
const DAY_MS = 86_400_000;
const MISSING_ID = '00000000-0000-4000-8000-00000000dead';

let emailSeq = 0;
const nextEmail = () => `admin-wl-${++emailSeq}@example.test`;

describe('admin waitlist (032)', () => {
  const capture = captureLogger();
  const ctx = setupApiTest({
    env: { PLATFORM_ADMINS: ` ${ADMIN_EMAIL.toUpperCase()} , `, WAITLIST_INVITE_TTL_DAYS: '5' },
    logger: capture.logger,
  });
  let admin: UserRow;
  const members: Record<'reader' | 'editor' | 'coOwner', UserRow> = {} as never;

  beforeAll(async () => {
    admin = await createAccountUser(ctx.t.db, { email: ADMIN_EMAIL, displayName: 'Admin' });
    await ctx.sessionFor(admin);
    const deck = await createDeck(ctx.t.db, ctx.world.owner);
    for (const [key, role] of [
      ['reader', 'reader'],
      ['editor', 'editor'],
      ['coOwner', 'owner'],
    ] as const) {
      members[key] = await createAccountUser(ctx.t.db);
      await addMember(ctx.t.db, deck, members[key], role);
      await ctx.sessionFor(members[key]);
    }
  });

  beforeEach(async () => {
    ctx.mailer.clear();
    capture.lines.length = 0;
    // Each test owns its entries; the list assertions read whole statuses.
    await ctx.t.db.delete(waitlistEvents);
    await ctx.t.db.delete(waitlistEntries);
  });

  /** An entry in any status, with the timestamps its CHECKs need. */
  async function seed(
    status: WaitlistStatus,
    over: Partial<typeof waitlistEntries.$inferInsert> = {},
  ): Promise<WaitlistEntryRow> {
    const at = ctx.clock.now();
    const [row] = await ctx.t.db
      .insert(waitlistEntries)
      .values({
        email: nextEmail(),
        kind: 'family',
        source: 'landing',
        status,
        confirmTokenHash: status === 'pending' ? `h-${emailSeq}` : null,
        confirmExpiresAt: status === 'pending' ? new Date(at.getTime() + DAY_MS) : null,
        confirmedAt: status === 'pending' || status === 'removed' ? null : at,
        invitedAt: status === 'invited' ? at : null,
        removedAt: status === 'removed' ? at : null,
        ...over,
      })
      .returning();
    return row;
  }

  const list = (query = '', email = ADMIN_EMAIL) =>
    ctx.app.request(`/admin/waitlist${query}`, { headers: ctx.as(email) });
  const invite = (id: string, email = ADMIN_EMAIL) =>
    ctx.app.request(`/admin/waitlist/${id}/invite`, { method: 'POST', headers: ctx.as(email) });
  const remove = (id: string, email = ADMIN_EMAIL) =>
    ctx.app.request(`/admin/waitlist/${id}`, { method: 'DELETE', headers: ctx.as(email) });
  const entry = async (id: string) =>
    (await ctx.t.db.select().from(waitlistEntries).where(eq(waitlistEntries.id, id)))[0];
  const events = async (id: string) =>
    ctx.t.db
      .select({ action: waitlistEvents.action, actorId: waitlistEvents.actorId })
      .from(waitlistEvents)
      .where(eq(waitlistEvents.entryId, id))
      .orderBy(asc(waitlistEvents.createdAt));
  const userRow = async (email: string) =>
    (
      await ctx.t.pool.query(
        'SELECT id, registered_via, registered_by FROM users WHERE email = $1',
        [email],
      )
    ).rows as { id: string; registered_via: string; registered_by: string | null }[];

  describe('who may see it (D234)', () => {
    it('GET /me says whether the caller is a platform admin', async () => {
      const mine = meSchema.parse(
        await json(await ctx.app.request('/me', { headers: ctx.as(ADMIN_EMAIL) })),
      );
      expect(mine.isPlatformAdmin).toBe(true);
      const owner = meSchema.parse(await json(await ctx.app.request('/me', { headers: ctx.as() })));
      expect(owner.isPlatformAdmin).toBe(false);
    });

    it('signed out → 401 on every admin route', async () => {
      const e = await seed('confirmed');
      for (const [method, path] of [
        ['GET', '/admin/waitlist'],
        ['POST', `/admin/waitlist/${e.id}/invite`],
        ['DELETE', `/admin/waitlist/${e.id}`],
      ]) {
        expect((await ctx.app.request(path, { method, headers: ctx.anon() })).status).toBe(401);
      }
      await capture.flush();
      expectDecision(capture.lines, 'admin.denied', { outcome: 'denied', reason: 'signed_out' });
    });

    it('deck roles do not count: reader, editor, owner and co-owner get the unknown-route 404', async () => {
      const e = await seed('confirmed');
      const unknown = await json(await ctx.app.request('/no-such-route', { headers: ctx.as() }));
      const callers = [
        members.reader.email,
        members.editor.email,
        members.coOwner.email,
        ctx.world.owner.email,
      ];
      for (const email of callers) {
        for (const res of [
          await list('?limit=999', email),
          await invite(e.id, email),
          await remove(e.id, email),
        ]) {
          expect(res.status).toBe(404);
          expect(await json(res)).toEqual(unknown);
        }
      }
      expect((await entry(e.id)).status).toBe('confirmed');
      await capture.flush();
      const denied = capture.lines.filter((l) => l.event === 'admin.denied');
      expect(denied).toHaveLength(callers.length * 3);
      expect(denied.map((l) => l.route)).toContain(`POST /admin/waitlist/{id}/invite`);
      expect(JSON.stringify(denied)).not.toContain(e.id);
      expect(JSON.stringify(denied)).not.toContain('@example.test');
    });
  });

  describe('list', () => {
    it('defaults to confirmed, oldest-confirmed first, pages by keyset, counts follow the kind', async () => {
      const t0 = ctx.clock.now().getTime();
      const confirmed = [];
      for (let i = 0; i < 3; i++) {
        confirmed.push(await seed('confirmed', { confirmedAt: new Date(t0 - (3 - i) * 60_000) }));
      }
      await seed('confirmed', { kind: 'community', confirmedAt: new Date(t0) });
      await seed('pending');
      await seed('removed');

      const first = adminWaitlistPageSchema.parse(await json(await list('?kind=family&limit=2')));
      expect(first.items.map((i) => i.id)).toEqual([confirmed[0].id, confirmed[1].id]);
      expect(first.counts).toEqual({ pending: 1, confirmed: 3, invited: 0, removed: 1 });
      expect(first.items[0]).not.toHaveProperty('confirmTokenHash');
      const next = adminWaitlistPageSchema.parse(
        await json(await list(`?kind=family&limit=2&cursor=${first.nextCursor}`)),
      );
      expect(next.items.map((i) => i.id)).toEqual([confirmed[2].id]);
      expect(next.nextCursor).toBeNull();

      const all = adminWaitlistPageSchema.parse(await json(await list()));
      expect(all.items).toHaveLength(4);
      expect(all.counts.confirmed).toBe(4);
      const pending = adminWaitlistPageSchema.parse(await json(await list('?status=pending')));
      expect(pending.items.map((i) => i.status)).toEqual(['pending']);

      await capture.flush();
      const line = expectDecision(capture.lines, 'waitlist.admin_list', { outcome: 'listed' });
      expect(line).toMatchObject({ actorId: admin.id, status: 'pending', returned: 1 });
      expect(
        JSON.stringify(capture.lines.filter((l) => l.event === 'waitlist.admin_list')),
      ).not.toContain('@example.test');
    });

    it('limit over the max and a bad cursor are 400', async () => {
      expect((await list('?limit=101')).status).toBe(400);
      expect((await list('?cursor=nope')).status).toBe(400);
    });
  });

  describe('invite', () => {
    it('confirmed → invited with an account and a sign-in link that opens a personal deck', async () => {
      const e = await seed('confirmed', { kind: 'community' as WaitlistKind });
      const res = await invite(e.id);
      expect(res.status).toBe(201);
      const body = adminWaitlistInviteResultSchema.parse(await json(res));
      expect(body.mailSent).toBe(true);
      expect(body.entry).toMatchObject({
        status: 'invited',
        invitedBy: { id: admin.id, displayName: 'Admin' },
      });

      const [user] = await userRow(e.email);
      expect(user).toMatchObject({ registered_via: 'waitlist_invite', registered_by: admin.id });
      expect(await entry(e.id)).toMatchObject({
        status: 'invited',
        invitedBy: admin.id,
        userId: user.id,
      });
      expect(await events(e.id)).toEqual([{ action: 'invited', actorId: admin.id }]);
      const decks = await ctx.t.pool.query('SELECT 1 FROM memberships WHERE user_id = $1', [
        user.id,
      ]);
      expect(decks.rowCount).toBe(0);

      const [link] = (
        await ctx.t.pool.query('SELECT purpose, expires_at FROM magic_links WHERE email = $1', [
          e.email,
        ])
      ).rows as { purpose: string; expires_at: Date }[];
      expect(link.purpose).toBe('sign_in');
      expect(link.expires_at.getTime() - ctx.clock.now().getTime()).toBeGreaterThan(
        5 * DAY_MS - 60_000,
      );
      expect(link.expires_at.getTime() - ctx.clock.now().getTime()).toBeLessThanOrEqual(5 * DAY_MS);

      const mail = ctx.mailer.last()!;
      expect(mail.to).toBe(e.email);
      expect(mail.subject).toBe("You're in — welcome to Gobbit");
      const callback = await ctx.app.request(`/auth/callback?token=${tokenFromMail(ctx.mailer)}`);
      const session = sessionTokenFromSetCookie(callback);
      expect(session).toBeTruthy();
      const me = meSchema.parse(
        await json(
          await ctx.app.request('/me', { headers: { Cookie: `${SESSION_COOKIE}=${session}` } }),
        ),
      );
      expect(me.decks).toHaveLength(1);
      expect(me.decks[0]).toMatchObject({ kind: 'personal', role: 'owner' });
      const cats = await ctx.t.pool.query('SELECT slug FROM categories WHERE deck_id = $1', [
        me.decks[0].id,
      ]);
      expect(cats.rows).toEqual([{ slug: 'general' }]);

      await capture.flush();
      expect(expectDecision(capture.lines, 'waitlist.admin', { outcome: 'invited' })).toMatchObject(
        {
          actorId: admin.id,
          entryId: e.id,
          userId: user.id,
          mailSent: true,
        },
      );
      expectDecision(capture.lines, 'waitlist.mail', { outcome: 'sent' });
      expect(
        JSON.stringify(capture.lines.filter((l) => String(l.event).startsWith('waitlist.'))),
      ).not.toContain(e.email);
    });

    it('invited → 200 resend with a new link, still one user', async () => {
      const e = await seed('confirmed');
      expect((await invite(e.id)).status).toBe(201);
      const again = await invite(e.id);
      expect(again.status).toBe(200);
      expect(await userRow(e.email)).toHaveLength(1);
      expect((await events(e.id)).map((r) => r.action)).toEqual(['invited', 'invite_resent']);
      const links = await ctx.t.pool.query('SELECT 1 FROM magic_links WHERE email = $1', [e.email]);
      expect(links.rowCount).toBe(2);
      await capture.flush();
      expectDecision(capture.lines, 'waitlist.admin', { outcome: 'resent' });
    });

    it('an address that already has an account is linked, not duplicated', async () => {
      const existing = await createAccountUser(ctx.t.db, { email: nextEmail() });
      const e = await seed('confirmed', { email: existing.email });
      expect((await invite(e.id)).status).toBe(201);
      expect(await userRow(existing.email)).toHaveLength(1);
      expect((await entry(e.id)).userId).toBe(existing.id);
      await capture.flush();
      expectDecision(capture.lines, 'waitlist.admin', { outcome: 'linked_existing' });
    });

    it('two concurrent invites → one 201 and one 200, one user, invited once', async () => {
      const e = await seed('confirmed');
      const statuses = (await Promise.all([invite(e.id), invite(e.id)]))
        .map((r) => r.status)
        .sort();
      expect(statuses).toEqual([200, 201]);
      expect(await userRow(e.email)).toHaveLength(1);
      expect((await events(e.id)).map((r) => r.action)).toEqual(['invited', 'invite_resent']);
    });

    it.each([
      ['pending', '/problems/waitlist-not-confirmed'],
      ['removed', '/problems/waitlist-removed'],
    ] as const)('refuses a %s entry with 409 %s', async (status, type) => {
      const e = await seed(status);
      const res = await invite(e.id);
      expect(res.status).toBe(409);
      expect(problemSchema.parse(await json(res)).type).toBe(type);
      expect(await userRow(e.email)).toHaveLength(0);
      expect(ctx.mailer.sent).toHaveLength(0);
      await capture.flush();
      expectDecision(capture.lines, 'waitlist.admin', { outcome: 'refused', reason: status });
    });

    it('unknown and malformed ids are 404', async () => {
      expect((await invite(MISSING_ID)).status).toBe(404);
      expect((await invite('not-a-uuid')).status).toBe(404);
    });

    it('a failure after markInvited rolls back the entry, its event, the account and the link', async () => {
      const e = await seed('confirmed');
      const service = createWaitlistAdminService({
        env: ctx.env,
        now: ctx.clock.now,
        mailer: ctx.mailer,
        waitlist: createWaitlistRepo(ctx.t.db),
        transaction: (fn) =>
          ctx.t.db.transaction((tx) =>
            fn({
              ...adminTxRepos(tx, {
                mode: 'waitlist',
                logHash: createLogHash(ctx.env.LOG_HASH_KEY),
              }),
              magicLinks: {
                create: async () => {
                  throw new Error('forced');
                },
              },
            }),
          ),
      });
      const asAdmin: PlatformAdmin = { ...admin, platformAdmin: true };
      await expect(service.invite(asAdmin, e.id, { requestId: 'r-1' })).rejects.toThrow('forced');
      expect((await entry(e.id)).status).toBe('confirmed');
      expect(await events(e.id)).toEqual([]);
      expect(await userRow(e.email)).toHaveLength(0);
      expect(ctx.mailer.sent).toHaveLength(0);
    });
  });

  describe('remove', () => {
    it.each(['pending', 'confirmed'] as const)(
      '%s → 204 removed with who and when',
      async (status) => {
        const e = await seed(status);
        expect((await remove(e.id)).status).toBe(204);
        const row = await entry(e.id);
        expect(row).toMatchObject({ status: 'removed', removedBy: admin.id });
        expect(row.removedAt).toBeInstanceOf(Date);
        expect(await events(e.id)).toEqual([{ action: 'removed', actorId: admin.id }]);
        await capture.flush();
        expectDecision(capture.lines, 'waitlist.admin', { outcome: 'removed' });
      },
    );

    it('already removed → 204 no-op without an event', async () => {
      const e = await seed('removed');
      expect((await remove(e.id)).status).toBe(204);
      expect(await events(e.id)).toEqual([]);
      await capture.flush();
      expectDecision(capture.lines, 'waitlist.admin', { outcome: 'unchanged' });
    });

    it('invited → 409 waitlist-invited; unknown → 404', async () => {
      const e = await seed('invited');
      const res = await remove(e.id);
      expect(res.status).toBe(409);
      expect(problemSchema.parse(await json(res)).type).toBe('/problems/waitlist-invited');
      expect((await remove(MISSING_ID)).status).toBe(404);
      await capture.flush();
      expectDecision(capture.lines, 'waitlist.admin', { outcome: 'refused', reason: 'invited' });
    });

    it('removed without removed_at violates the CHECK', async () => {
      const e = await seed('confirmed');
      await expect(
        ctx.t.pool.query(`UPDATE waitlist_entries SET status = 'removed' WHERE id = $1`, [e.id]),
      ).rejects.toThrow(/waitlist_removed_has_time/);
    });

    it('the removed event outlives the entry after the prune', async () => {
      const e = await seed('confirmed');
      expect((await remove(e.id)).status).toBe(204);
      const prune = createPruneWaitlist({
        waitlist: createWaitlistRepo(ctx.t.db),
        now: () => new Date(ctx.clock.now().getTime() + 31 * DAY_MS),
      });
      expect((await prune('job-1')).removedDeleted).toBe(1);
      expect(await entry(e.id)).toBeUndefined();
      expect((await events(e.id)).map((r) => r.action)).toEqual(['removed']);
    });
  });
});
