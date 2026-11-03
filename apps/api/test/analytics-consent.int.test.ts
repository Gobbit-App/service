import { beforeEach, describe, expect, it } from 'vitest';
import { asc, eq, sql } from 'drizzle-orm';
import { analyticsConsentSchema, meSchema } from '@gobbit/shared';
import { analyticsConsentEvents, users, type UserRow } from '@gobbit/db';
import { createAccountUser } from '@gobbit/db/test';
import { captureLogger, expectDecision } from './capture-logger';
import { json, setupApiTest } from './helpers';

/** FR-007 / D265: the counts query documented in `infra/README.md` § Analytics. */
const COUNTS_SQL = sql`select coalesce(analytics_consent::text, 'unanswered') as choice, count(*)::int as n
  from users where deleted_at is null group by 1 order by 1`;

describe('analytics consent (035)', () => {
  const capture = captureLogger();
  const ctx = setupApiTest({ logger: capture.logger });

  async function freshUser(): Promise<UserRow> {
    const user = await createAccountUser(ctx.t.db);
    await ctx.sessionFor(user);
    return user;
  }

  const put = (email: string, body: unknown, requestId = 'req-consent') =>
    ctx.app.request('/me/analytics-consent', {
      method: 'PUT',
      headers: { ...ctx.as(email), 'X-Request-Id': requestId },
      body: JSON.stringify(body),
    });

  const eventsFor = (userId: string) =>
    ctx.t.db
      .select()
      .from(analyticsConsentEvents)
      .where(eq(analyticsConsentEvents.userId, userId))
      .orderBy(asc(analyticsConsentEvents.createdAt));

  beforeEach(() => {
    capture.lines.length = 0;
  });

  it('a new member starts unanswered in GET /me', async () => {
    const user = await freshUser();
    const me = meSchema.parse(
      await json(await ctx.app.request('/me', { headers: ctx.as(user.email) })),
    );
    expect(me.analyticsConsent).toEqual({ value: 'unanswered', at: null, source: null });
  });

  it('saves a choice, writes one audit row and records analytics.consent (D259, D265)', async () => {
    const user = await freshUser();
    const res = await put(user.email, { value: 'declined', source: 'prompt' }, 'req-1');
    expect(res.status).toBe(200);
    const body = analyticsConsentSchema.parse(await json(res));
    expect(body).toMatchObject({ value: 'declined', source: 'prompt' });
    expect(Math.abs(Date.parse(body.at!) - ctx.clock.now().getTime())).toBeLessThan(60_000);

    const rows = await eventsFor(user.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      fromValue: null,
      toValue: 'declined',
      source: 'prompt',
      requestId: 'req-1',
    });

    await capture.flush();
    const line = expectDecision(capture.lines, 'analytics.consent', { outcome: 'changed' });
    expect(line).toMatchObject({ from: 'unanswered', value: 'declined', userId: user.id });
    expect(JSON.stringify(line)).not.toContain(user.email);

    const me = meSchema.parse(
      await json(await ctx.app.request('/me', { headers: ctx.as(user.email) })),
    );
    expect(me.analyticsConsent).toEqual(body);
  });

  it('saving the same value again writes no row (FR-006)', async () => {
    const user = await freshUser();
    await put(user.email, { value: 'allowed', source: 'prompt' });
    const again = await put(user.email, { value: 'allowed', source: 'settings' }, 'req-2');
    expect(again.status).toBe(200);
    // Unchanged keeps the original date and source.
    expect(analyticsConsentSchema.parse(await json(again))).toMatchObject({
      value: 'allowed',
      source: 'prompt',
    });
    expect(await eventsFor(user.id)).toHaveLength(1);
    await capture.flush();
    expectDecision(capture.lines, 'analytics.consent', { outcome: 'unchanged' });
  });

  it('records the real previous value on a change of mind', async () => {
    const user = await freshUser();
    await put(user.email, { value: 'allowed', source: 'prompt' });
    await put(user.email, { value: 'declined', source: 'settings' });
    const rows = await eventsFor(user.id);
    expect(rows.map((r) => [r.fromValue, r.toValue, r.source])).toEqual([
      [null, 'allowed', 'prompt'],
      ['allowed', 'declined', 'settings'],
    ]);
  });

  it('changes only the caller’s own row', async () => {
    const a = await freshUser();
    const b = await freshUser();
    await put(a.email, { value: 'declined', source: 'settings' });
    const [rowB] = await ctx.t.db.select().from(users).where(eq(users.id, b.id));
    expect(rowB.analyticsConsent).toBeNull();
    expect(await eventsFor(b.id)).toHaveLength(0);
  });

  it('rejects anonymous callers and bad bodies', async () => {
    const anon = await ctx.app.request('/me/analytics-consent', {
      method: 'PUT',
      headers: ctx.anon(),
      body: JSON.stringify({ value: 'declined', source: 'prompt' }),
    });
    expect(anon.status).toBe(401);
    const user = await freshUser();
    for (const body of [
      { value: 'unanswered', source: 'prompt' },
      { value: 'declined', source: 'email' },
      { value: 'declined', source: 'prompt', userId: user.id },
    ]) {
      expect((await put(user.email, body)).status).toBe(400);
    }
    expect(await eventsFor(user.id)).toHaveLength(0);
  });

  it('the CHECK refuses a partial choice', async () => {
    const user = await freshUser();
    await expect(
      ctx.t.db.update(users).set({ analyticsConsent: 'allowed' }).where(eq(users.id, user.id)),
    ).rejects.toThrow();
  });

  it('the documented counts query groups members by choice (FR-007)', async () => {
    const before = await ctx.t.db.execute(COUNTS_SQL);
    const count = (rows: typeof before.rows, choice: string) =>
      Number(rows.find((r) => r.choice === choice)?.n ?? 0);
    const user = await freshUser();
    const mid = await ctx.t.db.execute(COUNTS_SQL);
    expect(count(mid.rows, 'unanswered')).toBe(count(before.rows, 'unanswered') + 1);
    await put(user.email, { value: 'declined', source: 'prompt' });
    const after = await ctx.t.db.execute(COUNTS_SQL);
    expect(count(after.rows, 'declined')).toBe(count(mid.rows, 'declined') + 1);
    expect(count(after.rows, 'unanswered')).toBe(count(mid.rows, 'unanswered') - 1);
  });
});
