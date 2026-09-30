import { describe, it, expect } from 'vitest';
import { sql } from 'drizzle-orm';
import { withTestDb } from './db-fixture';
import { OWNER_USER_ID, SMOKE_SESSION_ID, runSeed } from '../seed/run-seed';
import { accounts, users, decks, sessions } from '../src/schema';
import { sha256Hex } from '../src/token-hash';

const CONFIG = { email: 'owner@example.test', name: 'Owner' };

describe('seed (D49: owner only)', () => {
  const t = withTestDb();

  const snapshot = async () => {
    const [acc] = await t.db
      .select({ n: sql<number>`count(*)::int`, max: sql<string>`max(updated_at)::text` })
      .from(accounts);
    const [usr] = await t.db
      .select({ n: sql<number>`count(*)::int`, max: sql<string>`max(updated_at)::text` })
      .from(users);
    const [dk] = await t.db.select({ n: sql<number>`count(*)::int` }).from(decks);
    return { acc, usr, decks: dk.n };
  };

  it('creates exactly one account, one user and no decks', async () => {
    const result = await runSeed(t.pool, CONFIG);
    expect(result.userId).toBe(OWNER_USER_ID);
    const s = await snapshot();
    expect(s.acc.n).toBe(1);
    expect(s.usr.n).toBe(1);
    expect(s.decks).toBe(0);
  });

  it('is idempotent: a second run changes nothing, not even updated_at', async () => {
    const before = await snapshot();
    await new Promise((resolve) => setTimeout(resolve, 20));
    await runSeed(t.pool, CONFIG);
    expect(await snapshot()).toEqual(before);
  });

  it('updates the owner in place when the name changes', async () => {
    await runSeed(t.pool, { ...CONFIG, name: 'Renamed' });
    const rows = await t.db.select().from(users);
    expect(rows).toHaveLength(1);
    expect(rows[0].displayName).toBe('Renamed');
  });

  it('creates no session without a smoke token', async () => {
    expect(await t.db.select().from(sessions)).toHaveLength(0);
  });

  it('upserts the smoke bearer session idempotently (D43)', async () => {
    const token = 's'.repeat(40);
    const result = await runSeed(t.pool, { ...CONFIG, smokeToken: token });
    expect(result.smokeSession).toBe(true);
    const [first] = await t.db.select().from(sessions);
    expect(first).toMatchObject({
      id: SMOKE_SESSION_ID,
      userId: OWNER_USER_ID,
      kind: 'bearer',
      userAgent: 'smoke',
      tokenHash: sha256Hex(token),
      revokedAt: null,
    });
    const days = (first.expiresAt.getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(364);

    await runSeed(t.pool, { ...CONFIG, smokeToken: token });
    const again = await t.db.select().from(sessions);
    expect(again).toEqual([first]);

    await runSeed(t.pool, { ...CONFIG, smokeToken: 't'.repeat(40) });
    const [rotated] = await t.db.select().from(sessions);
    expect(rotated.tokenHash).toBe(sha256Hex('t'.repeat(40)));
  });
});
