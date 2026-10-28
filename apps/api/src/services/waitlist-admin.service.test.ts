import { describe, expect, it, vi } from 'vitest';
import type { WaitlistEntryRow } from '@pb/db';
import { decodeCursor, encodeCursor, type AdminWaitlistQuery } from '@pb/shared';
import { captureLogger, expectDecision } from '../../test/capture-logger';
import { decisionLogger } from '../lib/decision-event';
import { hashToken } from '../lib/tokens';
import { HttpError, WAITLIST_PROBLEMS } from '../errors/http-errors';
import type { PlatformAdmin } from '../access/platform-admin';
import type { AdminListRow, NewWaitlistEvent } from '../repositories/waitlist.repo';
import { createWaitlistAdminService, toAdminEntry } from './waitlist-admin.service';
import {
  WAITLIST_ADMIN_DECISION_LEVELS,
  type WaitlistAdminDecisions,
} from './waitlist-admin.events';

const NOW = new Date('2026-10-28T09:00:00.000Z');
const DAY_MS = 86_400_000;
const ID = '00000000-0000-4000-8000-000000000001';
const ADMIN: PlatformAdmin = {
  id: '00000000-0000-4000-8000-0000000000aa',
  accountId: 'acc-admin',
  email: 'admin@example.test',
  displayName: 'Admin',
  platformAdmin: true,
};

function entry(v: Partial<WaitlistEntryRow> = {}): WaitlistEntryRow {
  return {
    id: ID,
    email: 'parent@example.test',
    kind: 'family',
    note: null,
    source: 'landing',
    utmSource: null,
    status: 'confirmed',
    confirmTokenHash: 'h',
    confirmExpiresAt: NOW,
    confirmedAt: new Date(NOW.getTime() - DAY_MS),
    invitedAt: null,
    invitedBy: null,
    userId: null,
    removedAt: null,
    removedBy: null,
    createdAt: new Date(NOW.getTime() - 2 * DAY_MS),
    updatedAt: NOW,
    ...v,
  } as WaitlistEntryRow;
}

function setup(
  opts: { seed?: WaitlistEntryRow | null; existingUser?: boolean; mailFails?: boolean } = {},
) {
  const capture = captureLogger();
  let row: WaitlistEntryRow | null = opts.seed === undefined ? entry() : opts.seed;
  const events: (NewWaitlistEvent & { inTx: boolean })[] = [];
  const links: { email: string; tokenHash: string; purpose: string; expiresAt: Date }[] = [];
  let inTx = false;
  const mailsInTx: boolean[] = [];

  const register = vi.fn(async (email: string) => ({
    user: { id: 'u-new', accountId: 'a', email, displayName: 'p' },
    created: !opts.existingUser,
  }));
  const tx = {
    waitlist: {
      lockById: vi.fn(async (id: string) => (row && row.id === id ? row : null)),
      markInvited: vi.fn(async (r: { invitedBy: string; userId: string; now: Date }) => {
        if (!row || row.status !== 'confirmed') return null;
        row = {
          ...row,
          status: 'invited',
          invitedAt: r.now,
          invitedBy: r.invitedBy,
          userId: r.userId,
        };
        return row;
      }),
      remove: vi.fn(async (r: { removedBy: string; now: Date }) => {
        if (!row) return null;
        row = { ...row, status: 'removed', removedAt: r.now, removedBy: r.removedBy };
        return row;
      }),
      insertEvent: vi.fn(async (v: NewWaitlistEvent) => {
        events.push({ ...v, inTx });
        return {} as never;
      }),
      findForAdmin: vi.fn(async (): Promise<AdminListRow | null> =>
        row ? { ...row, invitedByName: row.invitedBy ? 'Admin' : null } : null,
      ),
    },
    magicLinks: {
      create: vi.fn(async (v: (typeof links)[number]) => {
        links.push(v);
        return {} as never;
      }),
    },
    usersService: { register },
  };
  const send = vi.fn(async () => {
    mailsInTx.push(inTx);
    if (opts.mailFails) throw new TypeError('smtp down');
  });
  const listForAdmin = vi.fn(async (): Promise<AdminListRow[]> => []);
  const countsByStatus = vi.fn(async () => ({ pending: 1, confirmed: 2, invited: 3, removed: 4 }));
  const service = createWaitlistAdminService({
    env: { API_URL: 'https://api.example.test', WAITLIST_INVITE_TTL_DAYS: 7 },
    now: () => NOW,
    mailer: { send },
    waitlist: { listForAdmin, countsByStatus },
    transaction: async (fn) => {
      inTx = true;
      try {
        return await fn(tx as never);
      } finally {
        inTx = false;
      }
    },
    decisions: decisionLogger<WaitlistAdminDecisions>('waitlist-admin', {
      parent: capture.logger,
      levels: WAITLIST_ADMIN_DECISION_LEVELS,
    }),
  });
  return {
    ...capture,
    service,
    tx,
    register,
    send,
    events,
    links,
    mailsInTx,
    listForAdmin,
    countsByStatus,
    row: () => row,
  };
}

const ctx = { requestId: 'req-1' };

async function rejection(p: Promise<unknown>): Promise<HttpError> {
  const err = await p.then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(HttpError);
  return err as HttpError;
}

describe('waitlistAdmin.invite (032)', () => {
  it('confirmed → invited: registers the account, writes the event and link in the tx, mails after', async () => {
    const t = setup();
    const result = await t.service.invite(ADMIN, ID, ctx);

    expect(result.first).toBe(true);
    expect(result.mailSent).toBe(true);
    expect(result.entry).toMatchObject({
      status: 'invited',
      invitedBy: { id: ADMIN.id, displayName: 'Admin' },
    });
    expect(t.register).toHaveBeenCalledWith('parent@example.test', 'waitlist_invite', {
      requestId: 'req-1',
      actorId: ADMIN.id,
    });
    expect(t.events).toEqual([{ entryId: ID, action: 'invited', actorId: ADMIN.id, inTx: true }]);
    expect(t.links).toHaveLength(1);
    expect(t.links[0]).toMatchObject({ email: 'parent@example.test', purpose: 'sign_in' });
    expect(t.links[0].expiresAt.getTime()).toBe(NOW.getTime() + 7 * DAY_MS);
    expect(t.mailsInTx).toEqual([false]);

    const mail = (t.send.mock.calls[0] as unknown as [{ to: string; text: string }])[0];
    expect(mail.to).toBe('parent@example.test');
    const token = new URL(mail.text.match(/https:\/\/\S+/)![0]).searchParams.get('token')!;
    expect(hashToken(token)).toBe(t.links[0].tokenHash);
    expect(mail.text).toContain('https://api.example.test/auth/callback?token=');

    await t.flush();
    const line = expectDecision(t.lines, 'waitlist.admin', { outcome: 'invited' });
    expect(line).toMatchObject({ actorId: ADMIN.id, entryId: ID, userId: 'u-new', mailSent: true });
    expectDecision(t.lines, 'waitlist.mail', { outcome: 'sent' });
    expect(JSON.stringify(t.lines)).not.toContain('parent@example.test');
  });

  it('an address that already has an account is linked, not duplicated', async () => {
    const t = setup({ existingUser: true });
    const result = await t.service.invite(ADMIN, ID, ctx);
    expect(result.first).toBe(true);
    await t.flush();
    expectDecision(t.lines, 'waitlist.admin', { outcome: 'linked_existing' });
  });

  it('invited → resend: a fresh link and an invite_resent event, status unchanged', async () => {
    const t = setup({ seed: entry({ status: 'invited', invitedAt: NOW, invitedBy: ADMIN.id }) });
    const result = await t.service.invite(ADMIN, ID, ctx);
    expect(result.first).toBe(false);
    expect(t.tx.waitlist.markInvited).not.toHaveBeenCalled();
    expect(t.events.map((e) => e.action)).toEqual(['invite_resent']);
    expect(t.links).toHaveLength(1);
    await t.flush();
    expectDecision(t.lines, 'waitlist.admin', { outcome: 'resent' });
  });

  it('a failed mail keeps the invite and answers mailSent false', async () => {
    const t = setup({ mailFails: true });
    const result = await t.service.invite(ADMIN, ID, ctx);
    expect(result.mailSent).toBe(false);
    expect(t.row()?.status).toBe('invited');
    await t.flush();
    expect(expectDecision(t.lines, 'waitlist.mail', { outcome: 'failed' })).toMatchObject({
      errorName: 'TypeError',
      level: 'error',
    });
    expect(expectDecision(t.lines, 'waitlist.admin', { outcome: 'invited' }).mailSent).toBe(false);
  });

  it.each([
    ['pending', 409, WAITLIST_PROBLEMS.notConfirmed],
    ['removed', 409, WAITLIST_PROBLEMS.removed],
  ] as const)('refuses a %s entry (%i)', async (status, code, type) => {
    const t = setup({ seed: entry({ status, removedAt: status === 'removed' ? NOW : null }) });
    const err = await rejection(t.service.invite(ADMIN, ID, ctx));
    expect(err.status).toBe(code);
    expect(err.type).toBe(type);
    expect(t.register).not.toHaveBeenCalled();
    expect(t.send).not.toHaveBeenCalled();
    await t.flush();
    expect(
      expectDecision(t.lines, 'waitlist.admin', { outcome: 'refused', reason: status }),
    ).toMatchObject({
      level: 'warn',
      action: 'invite',
    });
  });

  it('refuses an unknown or malformed id with 404 and never logs the raw id', async () => {
    const t = setup({ seed: null });
    expect((await rejection(t.service.invite(ADMIN, ID, ctx))).status).toBe(404);
    expect((await rejection(t.service.invite(ADMIN, 'not-a-uuid@x', ctx))).status).toBe(404);
    expect(t.tx.waitlist.lockById).toHaveBeenCalledTimes(1);
    await t.flush();
    expectDecision(t.lines, 'waitlist.admin', { outcome: 'refused', reason: 'not_found' });
    expect(JSON.stringify(t.lines)).not.toContain('not-a-uuid');
  });
});

describe('waitlistAdmin.remove (032)', () => {
  it.each(['pending', 'confirmed'] as const)(
    'removes a %s entry with its event in the tx',
    async (status) => {
      const t = setup({ seed: entry({ status }) });
      await t.service.remove(ADMIN, ID, ctx);
      expect(t.row()).toMatchObject({ status: 'removed', removedBy: ADMIN.id, removedAt: NOW });
      expect(t.events).toEqual([{ entryId: ID, action: 'removed', actorId: ADMIN.id, inTx: true }]);
      await t.flush();
      expectDecision(t.lines, 'waitlist.admin', { outcome: 'removed' });
    },
  );

  it('an already removed entry is a no-op', async () => {
    const t = setup({ seed: entry({ status: 'removed', removedAt: NOW }) });
    await t.service.remove(ADMIN, ID, ctx);
    expect(t.tx.waitlist.remove).not.toHaveBeenCalled();
    expect(t.events).toEqual([]);
    await t.flush();
    expectDecision(t.lines, 'waitlist.admin', { outcome: 'unchanged' });
  });

  it('refuses an invited entry (409) and an unknown one (404)', async () => {
    const invited = setup({ seed: entry({ status: 'invited' }) });
    const err = await rejection(invited.service.remove(ADMIN, ID, ctx));
    expect(err.status).toBe(409);
    expect(err.type).toBe(WAITLIST_PROBLEMS.invited);
    await invited.flush();
    expectDecision(invited.lines, 'waitlist.admin', { outcome: 'refused', reason: 'invited' });

    const missing = setup({ seed: null });
    expect((await rejection(missing.service.remove(ADMIN, ID, ctx))).status).toBe(404);
  });
});

describe('waitlistAdmin.list (032)', () => {
  const q: AdminWaitlistQuery = { status: 'confirmed', limit: 2 };

  it('asks for one extra row and returns a cursor on the last sort value', async () => {
    const t = setup();
    const rows = [1, 2, 3].map((i) => ({
      ...entry({
        id: `00000000-0000-4000-8000-00000000000${i}`,
        confirmedAt: new Date(NOW.getTime() - i * 1000),
      }),
      invitedByName: null,
    }));
    t.listForAdmin.mockResolvedValueOnce(rows);
    const page = await t.service.list(ADMIN, q, ctx);
    expect(t.listForAdmin).toHaveBeenCalledWith({
      status: 'confirmed',
      kind: undefined,
      cursor: undefined,
      limit: 3,
    });
    expect(page.items.map((i) => i.id)).toEqual([rows[0].id, rows[1].id]);
    expect(page.counts).toEqual({ pending: 1, confirmed: 2, invited: 3, removed: 4 });
    const cursor = decodeCursor(page.nextCursor!);
    expect(cursor).toEqual({ createdAt: rows[1].confirmedAt!.toISOString(), id: rows[1].id });

    await t.flush();
    expect(expectDecision(t.lines, 'waitlist.admin_list', { outcome: 'listed' })).toMatchObject({
      actorId: ADMIN.id,
      status: 'confirmed',
      returned: 2,
      page: 'first',
    });
  });

  it('the last page has no cursor; a cursored request is logged as next', async () => {
    const t = setup();
    const first = await t.service.list(ADMIN, q, ctx);
    expect(first.nextCursor).toBeNull();
    await t.service.list(
      ADMIN,
      { ...q, kind: 'family', cursor: encodeCursor({ createdAt: NOW, id: ID }) },
      ctx,
    );
    expect(t.countsByStatus).toHaveBeenLastCalledWith('family');
    await t.flush();
    expect(t.lines.filter((l) => l.event === 'waitlist.admin_list').map((l) => l.page)).toEqual([
      'first',
      'next',
    ]);
  });
});

describe('toAdminEntry', () => {
  it('serialises dates and drops the inviter when their name is gone', () => {
    const dto = toAdminEntry({ ...entry({ invitedBy: ADMIN.id }), invitedByName: null });
    expect(dto.invitedBy).toBeNull();
    expect(dto.confirmedAt).toBe(new Date(NOW.getTime() - DAY_MS).toISOString());
    expect(dto).not.toHaveProperty('confirmTokenHash');
  });
});
