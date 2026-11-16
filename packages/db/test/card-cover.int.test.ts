import { beforeAll, describe, expect, it } from 'vitest';
import { withTestDb } from './db-fixture';
import { createAccountUser, createDeck } from './factories';

/** 044: DB invariants of the card cover image (D406, D407). */
describe('card cover (DB invariants)', () => {
  const ctx = withTestDb();
  let deckId: string;

  beforeAll(async () => {
    const owner = await createAccountUser(ctx.db);
    deckId = (await createDeck(ctx.db, owner)).id;
  });

  // Minimal payloads that satisfy the other CHECKs (reveal_at is set by the reminder trigger, D291).
  const payloads: Record<string, unknown> = {
    text: {},
    reminder: {
      deadline: '2030-06-01T12:00:00.000Z',
      showBefore: { amount: 2, unit: 'days' },
      dismiss: { mode: 'me', userIds: [] },
      timeZone: 'UTC',
    },
    event: {
      allDay: false,
      start: '2030-06-01T12:00:00',
      timeZone: 'UTC',
      notify: { before: [] },
    },
    table: { columns: ['A'], rows: [['1']] },
    calc: { expression: '1+1' },
    link: { url: 'https://example.com/' },
    media: { kind: 'pdf', publicId: 'f1' },
  };

  const insert = (type: string, cover: unknown) =>
    ctx.pool.query(
      `INSERT INTO items (deck_id, type, status, title, payload, cover)
       VALUES ($1, $2::item_type, 'proposed', 'C', $3::jsonb, $4::jsonb)`,
      [deckId, type, JSON.stringify(payloads[type]), cover === null ? null : JSON.stringify(cover)],
    );
  const refused = (type: string, cover: unknown) =>
    expect(insert(type, cover)).rejects.toThrow(/items_cover_chk/);

  it('accepts a cover or NULL on the five types that can have one', async () => {
    for (const type of ['text', 'reminder', 'event', 'table', 'calc']) {
      await insert(type, null);
      await insert(type, { publicId: 'p1' });
      await insert(type, { publicId: 'p'.repeat(255), width: 30, height: 40 });
    }
  });

  it('refuses a cover on a link or media card, but accepts NULL', async () => {
    await insert('link', null);
    await insert('media', null);
    await refused('link', { publicId: 'p1' });
    await refused('media', { publicId: 'p1' });
  });

  it('refuses a cover that is not an object naming a file', async () => {
    await refused('text', []);
    await refused('text', 'p1');
    await refused('text', {});
    await refused('text', { publicId: '' });
    await refused('text', { publicId: 'p'.repeat(256) });
    await refused('text', { publicId: 7 });
  });

  it('refuses non-numeric dimensions', async () => {
    await refused('text', { publicId: 'p1', width: '30' });
    await refused('text', { publicId: 'p1', height: null });
  });
});
