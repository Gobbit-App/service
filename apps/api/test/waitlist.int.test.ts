import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { asc, eq } from 'drizzle-orm';
import { WAITLIST_JOIN_PER_EMAIL_PER_HOUR, WAITLIST_JOIN_PER_IP_PER_HOUR } from '@gobbit/shared';
import { waitlistEntries, waitlistEvents, type WaitlistEntryRow } from '@gobbit/db';
import { createWaitlistRepo } from '../src/repositories/waitlist.repo';
import { buildServices } from '../src/services';
import { createPruneWaitlist } from '../src/jobs/prune-waitlist';
import { hashToken } from '../src/lib/tokens';
import { RATE_WINDOW_MS, windowStart } from '../src/lib/rate-window';
import { decisionLogger } from '../src/lib/decision-event';
import type { WaitlistDecisions } from '../src/services/waitlist.events';
import { captureLogger, expectDecision } from './capture-logger';
import {
  json,
  OTHER_EMAIL,
  OWNER_EMAIL,
  setupApiTest,
  tokenFromMail,
  type ApiTestContext,
} from './helpers';

const IP_HEADER = 'x-test-ip';
const APP_URL = 'http://app.test';
const DAY_MS = 86_400_000;

let ipSeq = 0;
const nextIp = () => `10.2.${Math.floor(++ipSeq / 250)}.${ipSeq % 250}`;
let emailSeq = 0;
const nextEmail = () => `waiter-${++emailSeq}@example.test`;

function harness(ctx: ApiTestContext) {
  const join = (body: Record<string, unknown>, ip = nextIp()) =>
    ctx.app.request('/waitlist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', [IP_HEADER]: ip },
      body: JSON.stringify({ kind: 'family', ...body }),
    });
  const confirm = (token?: string, ip = nextIp()) =>
    ctx.app.request(`/waitlist/confirm${token === undefined ? '' : `?token=${token}`}`, {
      headers: { [IP_HEADER]: ip },
    });
  const entries = (email: string): Promise<WaitlistEntryRow[]> =>
    ctx.t.db.select().from(waitlistEntries).where(eq(waitlistEntries.email, email));
  const events = async (entryId: string) =>
    (
      await ctx.t.db
        .select()
        .from(waitlistEvents)
        .where(eq(waitlistEvents.entryId, entryId))
        .orderBy(asc(waitlistEvents.createdAt))
    ).map((e) => e.action);
  return { join, confirm, entries, events };
}

/** Start each test just after a rate window boundary so a run never straddles two windows. */
function alignWindow(ctx: ApiTestContext) {
  beforeEach(() => {
    ctx.mailer.clear();
    const at = ctx.clock.now();
    ctx.clock.advance(windowStart(at).getTime() + RATE_WINDOW_MS - at.getTime() + 1_000);
  });
  afterEach(() => ctx.clock.reset());
}

describe('waitlist join and confirm (D218, D219, D240)', () => {
  const capture = captureLogger();
  const ctx = setupApiTest({
    env: { APP_URL, CLIENT_IP_HEADER: IP_HEADER },
    logger: capture.logger,
  });
  const { join, confirm, entries, events } = harness(ctx);
  alignWindow(ctx);

  async function joinAndToken(email: string): Promise<string> {
    expect((await join({ email })).status).toBe(202);
    return tokenFromMail(ctx.mailer);
  }

  it('join → 202, one pending row storing sha256 of the mailed token, one mail', async () => {
    const email = nextEmail();
    const res = await join({ email, note: 'our street', utmSource: 'Flyer' });
    expect(res.status).toBe(202);
    expect(await json(res)).toEqual({ ok: true });

    const [row] = await entries(email);
    const token = tokenFromMail(ctx.mailer);
    expect(row).toMatchObject({ status: 'pending', kind: 'family', utmSource: 'flyer' });
    expect(row.confirmTokenHash).toBe(hashToken(token));
    expect(row.confirmTokenHash).not.toBe(token);
    expect(ctx.mailer.sent).toHaveLength(1);
    expect(ctx.mailer.last()?.to).toBe(email);
    expect(await events(row.id)).toEqual(['created']);

    await capture.flush();
    expectDecision(capture.lines, 'waitlist.join', { outcome: 'created' });
    expectDecision(capture.lines, 'waitlist.mail', { outcome: 'sent' });
    expect(JSON.stringify(capture.lines)).not.toContain(email);
  });

  it('a padded upper-case address matches the same row (resent, new token)', async () => {
    const email = nextEmail();
    const first = await joinAndToken(email);
    expect((await join({ email: `  ${email.toUpperCase()} ` })).status).toBe(202);

    const rows = await entries(email);
    expect(rows).toHaveLength(1);
    expect(rows[0].confirmTokenHash).toBe(hashToken(tokenFromMail(ctx.mailer)));
    expect(rows[0].confirmTokenHash).not.toBe(hashToken(first));
    expect(await events(rows[0].id)).toEqual(['created', 'resent']);
    await capture.flush();
    expectDecision(capture.lines, 'waitlist.join', { outcome: 'resent' });
  });

  it('confirm → 303 to /welcome?confirmed=1, row confirmed, no-store and no-referrer', async () => {
    const email = nextEmail();
    const token = await joinAndToken(email);

    const res = await confirm(token);
    expect(res.status).toBe(303);
    expect(res.headers.get('Location')).toBe(`${APP_URL}/welcome?confirmed=1`);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(res.headers.get('Referrer-Policy')).toBe('no-referrer');

    const [row] = await entries(email);
    expect(row.status).toBe('confirmed');
    expect(row.confirmedAt).toBeInstanceOf(Date);
    expect(await events(row.id)).toEqual(['created', 'confirmed']);
    await capture.flush();
    expectDecision(capture.lines, 'waitlist.confirm', { outcome: 'confirmed' });
  });

  it.each([
    ['missing', undefined],
    ['unknown', 'not-a-real-token'],
  ] as const)('a %s token → 303 ?confirm=invalid', async (reason, token) => {
    const res = await confirm(token);
    expect(res.status).toBe(303);
    expect(res.headers.get('Location')).toBe(`${APP_URL}/welcome?confirm=invalid`);
    await capture.flush();
    expectDecision(capture.lines, 'waitlist.confirm', { outcome: 'invalid', reason });
  });

  it('a reused link reads as used and leaves the row unchanged', async () => {
    const email = nextEmail();
    const token = await joinAndToken(email);
    await confirm(token);
    const [before] = await entries(email);

    const res = await confirm(token);
    expect(res.headers.get('Location')).toBe(`${APP_URL}/welcome?confirm=invalid`);
    const [after] = await entries(email);
    expect(after.confirmedAt).toEqual(before.confirmedAt);
    await capture.flush();
    expectDecision(capture.lines, 'waitlist.confirm', { outcome: 'invalid', reason: 'used' });
  });

  it('a link older than 7 days reads as expired; the row stays pending', async () => {
    const email = nextEmail();
    const token = await joinAndToken(email);
    ctx.clock.advance(7 * DAY_MS + 1_000);

    const res = await confirm(token);
    expect(res.headers.get('Location')).toBe(`${APP_URL}/welcome?confirm=invalid`);
    expect((await entries(email))[0].status).toBe('pending');
    await capture.flush();
    expectDecision(capture.lines, 'waitlist.confirm', { outcome: 'invalid', reason: 'expired' });
  });

  it('two parallel confirms: exactly one succeeds', async () => {
    const email = nextEmail();
    const token = await joinAndToken(email);

    const results = await Promise.all([confirm(token), confirm(token)]);
    const locations = results.map((r) => r.headers.get('Location')).sort();
    expect(locations).toEqual([
      `${APP_URL}/welcome?confirm=invalid`,
      `${APP_URL}/welcome?confirmed=1`,
    ]);
    const [row] = await entries(email);
    expect(await events(row.id)).toEqual(['created', 'confirmed']);
  });

  it('bad input → 400 problem, nothing stored', async () => {
    const res = await join({ email: 'not-an-email' });
    expect(res.status).toBe(400);
    expect(res.headers.get('Content-Type')).toContain('application/problem+json');
    expect(ctx.mailer.sent).toHaveLength(0);
  });

  it('new, pending, confirmed and existing-user joins answer identically', async () => {
    const pending = nextEmail();
    await joinAndToken(pending);
    const confirmed = nextEmail();
    await confirm(await joinAndToken(confirmed));

    const answers = await Promise.all(
      [nextEmail(), pending, confirmed, OWNER_EMAIL].map(async (email) => {
        const res = await join({ email });
        const headers = Object.fromEntries(res.headers);
        delete headers['x-request-id'];
        return { status: res.status, headers, body: await res.text() };
      }),
    );
    for (const answer of answers.slice(1)) expect(answer).toEqual(answers[0]);

    expect(await entries(OWNER_EMAIL)).toEqual([]);
    const existingMail = ctx.mailer.sent.filter((m) => m.to === OWNER_EMAIL);
    expect(existingMail.map((m) => m.subject)).toEqual(['You already have a Gobbit account']);
    await capture.flush();
    expectDecision(capture.lines, 'waitlist.join', {
      outcome: 'unchanged',
      reason: 'already_confirmed',
    });
    expectDecision(capture.lines, 'waitlist.join', {
      outcome: 'unchanged',
      reason: 'existing_user',
    });
  });

  it('honeypot → same 202 body, no row, no audit row, no mail', async () => {
    const email = nextEmail();
    const ip = nextIp();
    const res = await join({ email, website: 'http://spam.example.test' }, ip);
    expect(res.status).toBe(202);
    expect(await json(res)).toEqual({ ok: true });
    expect(await entries(email)).toEqual([]);
    expect(ctx.mailer.sent).toHaveLength(0);

    await capture.flush();
    expectDecision(capture.lines, 'waitlist.join', { outcome: 'dropped', reason: 'honeypot' });
    const logged = JSON.stringify(capture.lines);
    expect(logged).not.toContain(email);
    expect(logged).not.toContain(ip);
  });

  it(`the ${WAITLIST_JOIN_PER_IP_PER_HOUR + 1}th request from one IP → 429 with Retry-After, recorded`, async () => {
    const ip = nextIp();
    for (let i = 0; i < WAITLIST_JOIN_PER_IP_PER_HOUR - 1; i++) {
      expect((await join({ email: nextEmail() }, ip)).status).toBe(202);
    }
    // Confirms count in the same bucket.
    expect((await confirm('whatever', ip)).status).toBe(303);

    const res = await join({ email: nextEmail() }, ip);
    expect(res.status).toBe(429);
    expect(Number(res.headers.get('Retry-After'))).toBeGreaterThan(0);
    expect((await json(res)).type).toBe('/problems/rate-limited');

    await capture.flush();
    const line = expectDecision(capture.lines, 'rate_limit.refused', {
      outcome: 'refused',
      reason: 'per_ip',
    });
    expect(line).toMatchObject({ bucket: 'waitlist', path: '/waitlist' });
    expect(line.ipHash).toMatch(/^[0-9a-f]{16}$/);
    expect(JSON.stringify(capture.lines)).not.toContain(ip);
  });

  it(`the ${WAITLIST_JOIN_PER_EMAIL_PER_HOUR + 1}th join for one email → 429, new address and user alike`, async () => {
    const email = nextEmail();
    // A user no other test joins with (every test shares one rate window).
    const user = OTHER_EMAIL;
    for (let i = 0; i < WAITLIST_JOIN_PER_EMAIL_PER_HOUR; i++) {
      expect((await join({ email })).status).toBe(202);
      expect((await join({ email: user })).status).toBe(202);
    }
    const refused = await join({ email });
    const refusedUser = await join({ email: user });
    expect(refused.status).toBe(429);
    expect(refusedUser.status).toBe(429);
    expect(await refused.json()).toEqual(await refusedUser.json());

    await capture.flush();
    expectDecision(capture.lines, 'waitlist.join', { outcome: 'refused', reason: 'per_email' });
  });

  it('skipRateLimits (029 gate) bypasses the per-email counter', async () => {
    const email = nextEmail();
    for (let i = 0; i < WAITLIST_JOIN_PER_EMAIL_PER_HOUR; i++) await join({ email });
    expect((await join({ email })).status).toBe(429);

    const { waitlist } = buildServices({
      db: ctx.t.db,
      env: ctx.env,
      mailer: ctx.mailer,
      now: ctx.clock.now,
    });
    const result = await waitlist.join({
      email,
      kind: 'family',
      source: 'sign_in',
      ip: nextIp(),
      skipRateLimits: true,
      requestId: 'gate-1',
    });
    expect(result).toBe('resent');
  });

  it('a forced rollback leaves neither entry nor audit row', async () => {
    const email = nextEmail();
    const eventsBefore = (await ctx.t.db.select().from(waitlistEvents)).length;
    await expect(
      ctx.t.db.transaction(async (tx) => {
        const repo = createWaitlistRepo(tx);
        const row = await repo.insertPending({
          email,
          kind: 'family',
          note: null,
          source: 'landing',
          utmSource: null,
          confirmTokenHash: hashToken('rollback'),
          confirmExpiresAt: new Date(Date.now() + DAY_MS),
        });
        await repo.insertEvent({ entryId: row!.id, action: 'created', source: 'landing' });
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(await entries(email)).toEqual([]);
    expect(await ctx.t.db.select().from(waitlistEvents)).toHaveLength(eventsBefore);
  });
});

describe('waitlist without APP_URL and with a low per-IP limit (D218, D219)', () => {
  const capture = captureLogger();
  const ctx = setupApiTest({
    env: { CLIENT_IP_HEADER: IP_HEADER, WAITLIST_JOIN_PER_IP_PER_HOUR: '2' },
    logger: capture.logger,
  });
  const { join, confirm } = harness(ctx);
  alignWindow(ctx);

  it('confirm answers 200 JSON without APP_URL', async () => {
    expect((await join({ email: nextEmail() })).status).toBe(202);
    const token = tokenFromMail(ctx.mailer);

    const ok = await confirm(token);
    expect(ok.status).toBe(200);
    expect(await json(ok)).toEqual({ confirmed: true });
    expect(await json(await confirm(token))).toEqual({ confirmed: false });
  });

  it('WAITLIST_JOIN_PER_IP_PER_HOUR=2 → the 3rd join is refused', async () => {
    const ip = nextIp();
    expect((await join({ email: nextEmail() }, ip)).status).toBe(202);
    expect((await join({ email: nextEmail() }, ip)).status).toBe(202);
    expect((await join({ email: nextEmail() }, ip)).status).toBe(429);
  });
});

describe('waitlist prune (D220)', () => {
  const capture = captureLogger();
  const ctx = setupApiTest({ env: { CLIENT_IP_HEADER: IP_HEADER } });
  const { join, confirm, entries, events } = harness(ctx);
  alignWindow(ctx);

  it('deletes expired pending and 31-day-old removed entries; keeps the rest and all events', async () => {
    const expired = nextEmail();
    await join({ email: expired });
    const [expiredRow] = await entries(expired);
    const confirmed = nextEmail();
    await join({ email: confirmed });
    await confirm(tokenFromMail(ctx.mailer));
    const removed = nextEmail();
    await join({ email: removed });
    const [removedRow] = await entries(removed);
    // Removal is an admin action (032); the repo writes the same rows the service does.
    const repo = createWaitlistRepo(ctx.t.db);
    await repo.remove({ id: removedRow.id, removedBy: ctx.world.owner.id, now: ctx.clock.now() });
    await repo.insertEvent({
      entryId: removedRow.id,
      action: 'removed',
      actorId: ctx.world.owner.id,
    });

    // Pending links expire after 7 days and are kept 30 more; removed entries 30 days.
    ctx.clock.advance(38 * DAY_MS);
    const fresh = nextEmail();
    await join({ email: fresh });

    const prune = createPruneWaitlist({
      waitlist: createWaitlistRepo(ctx.t.db),
      now: ctx.clock.now,
      decisions: decisionLogger<WaitlistDecisions>('worker', { parent: capture.logger }),
    });
    expect(await prune('job-1')).toEqual({ pendingDeleted: 1, removedDeleted: 1 });

    expect(await entries(expired)).toEqual([]);
    expect(await entries(removed)).toEqual([]);
    expect(await entries(confirmed)).toHaveLength(1);
    expect(await entries(fresh)).toHaveLength(1);
    // Audit rows outlive their entry.
    expect(await events(expiredRow.id)).toEqual(['created']);
    expect(await events(removedRow.id)).toEqual(['created', 'removed']);

    await capture.flush();
    expectDecision(capture.lines, 'waitlist.prune', { outcome: 'pruned' });
  });
});
