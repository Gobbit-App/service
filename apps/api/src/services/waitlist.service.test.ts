import { describe, expect, it, vi } from 'vitest';
import type { WaitlistEntryRow } from '@pb/db';
import { captureLogger, expectDecision } from '../../test/capture-logger';
import { decisionLogger } from '../lib/decision-event';
import { createLogHash } from '../lib/log-hash';
import { hashToken } from '../lib/tokens';
import { HttpError } from '../errors/http-errors';
import type { NewWaitlistEvent, WaitlistRepo } from '../repositories/waitlist.repo';
import { createWaitlistService, type WaitlistJoinInput } from './waitlist.service';
import { WAITLIST_DECISION_LEVELS, type WaitlistDecisions } from './waitlist.events';

const NOW = new Date('2026-10-25T12:00:00.000Z');
const EMAIL = 'parent@example.test';
const logHash = createLogHash('k'.repeat(32));

/** In-memory repo; `transaction` hands it out and counts calls so tests can see the boundary. */
function fakeRepo(seed: Partial<WaitlistEntryRow>[] = []) {
  const rows: WaitlistEntryRow[] = seed.map((s, i) => entry({ id: `e${i}`, ...s }));
  const events: (NewWaitlistEvent & { inTx: boolean })[] = [];
  let inTx = false;
  const repo = {
    findLiveByEmail: async (email: string) =>
      rows.find((r) => r.email === email && r.status !== 'removed') ?? null,
    findById: async (id: string) => rows.find((r) => r.id === id) ?? null,
    insertPending: async (v: Partial<WaitlistEntryRow>) => {
      const row = entry({ id: `e${rows.length}`, ...v, status: 'pending' });
      rows.push(row);
      return row;
    },
    refreshPending: async (
      id: string,
      v: { confirmTokenHash: string; confirmExpiresAt: Date; fields?: object },
    ) => {
      const row = rows.find((r) => r.id === id && r.status === 'pending');
      if (!row) return null;
      Object.assign(row, {
        confirmTokenHash: v.confirmTokenHash,
        confirmExpiresAt: v.confirmExpiresAt,
        ...v.fields,
      });
      return row;
    },
    confirmByTokenHash: async (hash: string, now: Date) => {
      const row = rows.find(
        (r) => r.confirmTokenHash === hash && r.status === 'pending' && r.confirmExpiresAt! > now,
      );
      if (!row) return null;
      Object.assign(row, { status: 'confirmed', confirmedAt: now });
      return row;
    },
    findByTokenHash: async (hash: string) => rows.find((r) => r.confirmTokenHash === hash) ?? null,
    insertEvent: async (v: NewWaitlistEvent) => {
      events.push({ ...v, inTx });
      return { id: `ev${events.length}`, createdAt: NOW, ...v } as never;
    },
  } as unknown as WaitlistRepo;
  const transaction = async <T>(fn: (r: WaitlistRepo) => Promise<T>): Promise<T> => {
    inTx = true;
    try {
      return await fn(repo);
    } finally {
      inTx = false;
    }
  };
  return { rows, events, repo, transaction };
}

function entry(v: Partial<WaitlistEntryRow>): WaitlistEntryRow {
  return {
    id: 'e0',
    email: EMAIL,
    kind: 'family',
    note: null,
    source: 'landing',
    utmSource: null,
    status: 'pending',
    confirmTokenHash: 'old-hash',
    confirmExpiresAt: new Date(NOW.getTime() + 86_400_000),
    confirmedAt: null,
    invitedAt: null,
    invitedBy: null,
    userId: null,
    removedAt: null,
    removedBy: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...v,
  } as WaitlistEntryRow;
}

function setup(
  opts: {
    seed?: Partial<WaitlistEntryRow>[];
    user?: boolean;
    allowed?: boolean;
    mailFails?: boolean;
  } = {},
) {
  const capture = captureLogger();
  const store = fakeRepo(opts.seed);
  const send = vi.fn(async () => {
    if (opts.mailFails) throw new TypeError('smtp down');
  });
  const check = vi.fn(async () => ({
    allowed: opts.allowed ?? true,
    retryAfterSeconds: opts.allowed === false ? 600 : 0,
  }));
  const service = createWaitlistService({
    env: {
      API_URL: 'https://api.example.test',
      APP_URL: 'https://app.example.test',
      WAITLIST_JOIN_PER_EMAIL_PER_HOUR: 3,
    },
    now: () => NOW,
    mailer: { send },
    waitlist: store.repo,
    transaction: store.transaction,
    users: { findByEmail: vi.fn(async () => (opts.user ? ({ id: 'u1' } as never) : null)) },
    rateLimits: { check },
    logHash,
    decisions: decisionLogger<WaitlistDecisions>('waitlist', {
      parent: capture.logger,
      levels: WAITLIST_DECISION_LEVELS,
    }),
  });
  return { ...capture, ...store, send, check, service };
}

const input = (over: Partial<WaitlistJoinInput> = {}): WaitlistJoinInput => ({
  email: ' Parent@Example.TEST ',
  kind: 'community',
  note: 'our street',
  source: 'landing',
  ip: '10.0.0.1',
  requestId: 'req-1',
  ...over,
});

function mailedToken(send: ReturnType<typeof setup>['send']): string {
  const mail = (send.mock.calls.at(-1) as unknown as [{ text: string }])[0];
  return /token=([A-Za-z0-9_-]+)/.exec(mail.text)![1];
}

describe('waitlist.join (D218, D219)', () => {
  it('creates a pending entry, one created audit row in the transaction, and one mail', async () => {
    const { service, rows, events, send, lines, flush } = setup();
    expect(await service.join(input())).toBe('created');

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ email: EMAIL, kind: 'community', status: 'pending' });
    expect(rows[0].confirmTokenHash).toBe(hashToken(mailedToken(send)));
    expect(events).toEqual([
      { entryId: rows[0].id, action: 'created', source: 'landing', inTx: true },
    ]);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]).toMatchObject([{ to: EMAIL }]);

    await flush();
    expect(expectDecision(lines, 'waitlist.join', { outcome: 'created' })).toMatchObject({
      emailHash: logHash('email', EMAIL),
      entryId: rows[0].id,
      requestId: 'req-1',
    });
    expectDecision(lines, 'waitlist.mail', { outcome: 'sent' });
    expect(JSON.stringify(lines)).not.toContain(EMAIL);
  });

  it('a landing re-join of a pending entry issues a new token and updates the form fields', async () => {
    const { service, rows, events, send } = setup({ seed: [{ kind: 'family', note: null }] });
    expect(await service.join(input({ kind: 'personal', note: 'class 3' }))).toBe('resent');

    expect(rows[0]).toMatchObject({ kind: 'personal', note: 'class 3' });
    expect(rows[0].confirmTokenHash).toBe(hashToken(mailedToken(send)));
    expect(events).toEqual([{ entryId: 'e0', action: 'resent', source: 'landing', inTx: true }]);
  });

  it('a sign_in re-join keeps the form fields', async () => {
    const { service, rows } = setup({ seed: [{ kind: 'family', note: 'keep me' }] });
    expect(await service.join(input({ source: 'sign_in', kind: 'other', note: undefined }))).toBe(
      'resent',
    );
    expect(rows[0]).toMatchObject({ kind: 'family', note: 'keep me' });
  });

  it.each([
    ['confirmed', 'already_confirmed'],
    ['invited', 'already_invited'],
  ] as const)('a %s entry sends nothing and writes nothing', async (status, reason) => {
    const { service, events, send, lines, flush } = setup({ seed: [{ status }] });
    expect(await service.join(input())).toBe(reason);
    expect(send).not.toHaveBeenCalled();
    expect(events).toEqual([]);
    await flush();
    expectDecision(lines, 'waitlist.join', { outcome: 'unchanged', reason });
  });

  it('an existing user gets the existing-user mail and no entry', async () => {
    const { service, rows, send, lines, flush } = setup({ user: true });
    expect(await service.join(input())).toBe('existing_user');
    expect(rows).toEqual([]);
    expect(send.mock.calls[0]).toMatchObject([
      { to: EMAIL, subject: 'You already have a Gobbit account' },
    ]);
    await flush();
    expectDecision(lines, 'waitlist.join', { outcome: 'unchanged', reason: 'existing_user' });
  });

  it('the honeypot drops silently before any counter or lookup', async () => {
    const { service, rows, send, check, lines, flush } = setup();
    expect(await service.join(input({ website: 'http://spam.example.test' }))).toBe('dropped');
    expect(rows).toEqual([]);
    expect(send).not.toHaveBeenCalled();
    expect(check).not.toHaveBeenCalled();
    await flush();
    expect(
      expectDecision(lines, 'waitlist.join', { outcome: 'dropped', reason: 'honeypot' }),
    ).toMatchObject({ ipHash: logHash('ip', '10.0.0.1') });
    expect(JSON.stringify(lines)).not.toContain('10.0.0.1');
  });

  it('a per-email refusal throws 429 with Retry-After and records it at warn', async () => {
    const { service, rows, check, lines, flush } = setup({ allowed: false });
    const err = await service.join(input()).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(HttpError);
    expect((err as HttpError).status).toBe(429);
    expect(check).toHaveBeenCalledWith(`waitlist:email:${hashToken(EMAIL)}`, 3);
    expect(rows).toEqual([]);
    await flush();
    expect(
      expectDecision(lines, 'waitlist.join', { outcome: 'refused', reason: 'per_email' }),
    ).toMatchObject({ level: 'warn', retryAfterSec: 600 });
  });

  it('skipRateLimits bypasses the per-email counter', async () => {
    const { service, check } = setup({ allowed: false });
    expect(await service.join(input({ skipRateLimits: true }))).toBe('created');
    expect(check).not.toHaveBeenCalled();
  });

  it('a mail failure is recorded at error level without the address and does not throw', async () => {
    const { service, rows, lines, flush } = setup({ mailFails: true });
    expect(await service.join(input())).toBe('created');
    expect(rows).toHaveLength(1);
    await flush();
    expect(expectDecision(lines, 'waitlist.mail', { outcome: 'failed' })).toMatchObject({
      level: 'error',
      template: 'confirm',
      errorName: 'TypeError',
    });
    expect(JSON.stringify(lines)).not.toContain(EMAIL);
  });
});

describe('waitlist.confirm (D218)', () => {
  async function joined() {
    const s = setup();
    await s.service.join(input());
    return { ...s, token: mailedToken(s.send) };
  }

  it('confirms with one confirmed audit row in the transaction', async () => {
    const { service, rows, events, token, lines, flush } = await joined();
    expect(await service.confirm(token, { requestId: 'req-2' })).toEqual({ confirmed: true });
    expect(rows[0]).toMatchObject({ status: 'confirmed', confirmedAt: NOW });
    expect(events.at(-1)).toEqual({ entryId: rows[0].id, action: 'confirmed', inTx: true });
    await flush();
    expectDecision(lines, 'waitlist.confirm', { outcome: 'confirmed' });
  });

  it.each([
    ['missing', undefined],
    ['unknown', 'not-a-real-token'],
  ])('reads %s as invalid', async (reason, token) => {
    const { service, lines, flush } = await joined();
    expect(await service.confirm(token, { requestId: 'r' })).toEqual({ confirmed: false });
    await flush();
    expectDecision(lines, 'waitlist.confirm', { outcome: 'invalid', reason });
  });

  it('reads a reused link as used', async () => {
    const { service, token, lines, flush } = await joined();
    await service.confirm(token, { requestId: 'r' });
    expect(await service.confirm(token, { requestId: 'r' })).toEqual({ confirmed: false });
    await flush();
    expectDecision(lines, 'waitlist.confirm', { outcome: 'invalid', reason: 'used' });
  });

  it('reads an expired link as expired', async () => {
    const { service, rows, token, lines, flush } = await joined();
    rows[0].confirmExpiresAt = new Date(NOW.getTime() - 1);
    expect(await service.confirm(token, { requestId: 'r' })).toEqual({ confirmed: false });
    expect(rows[0].status).toBe('pending');
    await flush();
    expectDecision(lines, 'waitlist.confirm', { outcome: 'invalid', reason: 'expired' });
  });
});
