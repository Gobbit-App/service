import { describe, it, expect } from 'vitest';
import { withTestDb } from './db-fixture';
import { addMember, createAccountUser, createDeck, openSession } from './factories';

const TSTZ = 'timestamp with time zone';

/** `column:data_type:nullable` in ordinal order — a compact information_schema snapshot. */
const EXPECTED: Record<string, string[]> = {
  memberships: [
    'id:uuid:NO',
    'deck_id:uuid:NO',
    'user_id:uuid:NO',
    'role:USER-DEFINED:NO',
    'invited_by:uuid:YES',
    `invited_at:${TSTZ}:NO`,
    `accepted_at:${TSTZ}:YES`,
    `created_at:${TSTZ}:NO`,
    `updated_at:${TSTZ}:NO`,
    `deleted_at:${TSTZ}:YES`,
  ],
  sessions: [
    'id:uuid:NO',
    'user_id:uuid:NO',
    'token_hash:text:NO',
    'kind:USER-DEFINED:NO',
    `expires_at:${TSTZ}:NO`,
    `last_seen_at:${TSTZ}:NO`,
    'user_agent:text:YES',
    `revoked_at:${TSTZ}:YES`,
    `created_at:${TSTZ}:NO`,
  ],
  magic_links: [
    'id:uuid:NO',
    'email:text:NO',
    'token_hash:text:NO',
    'purpose:USER-DEFINED:NO',
    'membership_id:uuid:YES',
    'next:text:YES',
    `expires_at:${TSTZ}:NO`,
    `used_at:${TSTZ}:YES`,
    'requested_ip:text:YES',
    `created_at:${TSTZ}:NO`,
  ],
  rate_limit_counters: ['key:text:NO', `window_start:${TSTZ}:NO`, 'count:integer:NO'],
};

async function pgError(p: Promise<unknown>): Promise<{ code?: string; message: string }> {
  try {
    await p;
  } catch (err) {
    // Drizzle wraps driver errors in DrizzleQueryError; the pg error (with `code`) is the cause.
    const e = err as { code?: string; message: string; cause?: { code?: string; message: string } };
    return e.code === undefined && e.cause ? e.cause : e;
  }
  throw new Error('expected the statement to fail');
}

describe('auth schema (P2.0, D23/D27/D36/D39)', () => {
  const t = withTestDb();

  it.each(Object.keys(EXPECTED))('%s columns match the snapshot', async (table) => {
    const { rows } = await t.pool.query(
      `SELECT column_name, data_type, is_nullable FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = $1 ORDER BY ordinal_position`,
      [table],
    );
    const cols = rows.map((r) => `${r.column_name}:${r.data_type}:${r.is_nullable}`);
    expect(cols).toEqual(EXPECTED[table]);
  });

  it('timestamps use millisecond precision', async () => {
    const { rows } = await t.pool.query(
      `SELECT DISTINCT datetime_precision FROM information_schema.columns
        WHERE table_schema = 'public' AND data_type = $1
          AND table_name = ANY($2::text[])`,
      [TSTZ, Object.keys(EXPECTED)],
    );
    expect(rows).toEqual([{ datetime_precision: 3 }]);
  });

  it('enums carry the plan values', async () => {
    const { rows } = await t.pool.query(
      `SELECT t.typname, array_agg(e.enumlabel ORDER BY e.enumsortorder)::text[] AS labels
         FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid
        WHERE t.typname IN ('member_role', 'magic_link_purpose', 'session_kind')
        GROUP BY t.typname ORDER BY t.typname`,
    );
    expect(rows).toEqual([
      { typname: 'magic_link_purpose', labels: ['sign_in', 'invite'] },
      { typname: 'member_role', labels: ['owner', 'maintainer', 'editor', 'reader'] },
      { typname: 'session_kind', labels: ['cookie', 'bearer'] },
    ]);
  });

  it('sessions.token_hash is unique (23505)', async () => {
    const user = await createAccountUser(t.db);
    await openSession(t.db, user, { token: 'a'.repeat(43) });
    const err = await pgError(openSession(t.db, user, { token: 'a'.repeat(43) }));
    expect(err.code).toBe('23505');
  });

  it('magic_links.token_hash is unique (23505)', async () => {
    const insert = () =>
      t.pool.query(
        `INSERT INTO magic_links (email, token_hash, purpose, expires_at)
         VALUES ('a@example.test', 'same-hash', 'sign_in', now() + interval '15 minutes')`,
      );
    await insert();
    const err = await pgError(insert());
    expect(err.code).toBe('23505');
  });

  it('memberships allow one live row per deck and user, and re-adding after removal', async () => {
    const owner = await createAccountUser(t.db);
    const member = await createAccountUser(t.db);
    const deck = await createDeck(t.db, owner);

    const first = await addMember(t.db, deck, member, 'reader');
    const err = await pgError(addMember(t.db, deck, member, 'editor'));
    expect(err.code).toBe('23505');

    await t.pool.query('UPDATE memberships SET deleted_at = now() WHERE id = $1', [first.id]);
    const again = await addMember(t.db, deck, member, 'editor');
    expect(again.id).not.toBe(first.id);
  });
});
