import type { ImportDraft } from '@gobbit/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { captureLogger, expectDecision } from '../../test/capture-logger';
import type { ImportDecisions } from '../imports/imports.events';
import { rateLimited } from '../errors/http-errors';
import { decisionLogger } from '../lib/decision-event';
import type { CurrentUser } from '../types';
import { createImportsService } from './imports.service';

const user: CurrentUser = { id: 'u1', accountId: 'a1', email: 'a@b.co', displayName: 'A' };
const deck = { id: 'd1', slug: 'family', ownerAccountId: 'a1' };
const UNMATCHED = '/problems/import-unmatched-category';
const TOO_MANY = '/problems/import-too-many-new-categories';

const row = (title: string, extra: Partial<ImportDraft> = {}): ImportDraft =>
  ({ type: 'text', title, body: '', ...extra }) as ImportDraft;

function setup() {
  const capture = captureLogger();
  const ingest = {
    proposeDirect: vi.fn().mockResolvedValue({ dedup: { action: 'new' } }),
  };
  const service = createImportsService({
    decks: { findBySlug: vi.fn().mockResolvedValue(deck), findById: vi.fn() } as never,
    memberships: { findActive: vi.fn() },
    ingest,
    decisions: decisionLogger<ImportDecisions>('imports', { parent: capture.logger }),
  } as never);
  // Assumed signature (D451): importRows(user, deckRef, req, { requestId }).
  const run = (rows: ImportDraft[], strict?: boolean) =>
    service.importRows(
      user,
      'family',
      { label: 'f.md', rows, ...(strict === undefined ? {} : { strict }) },
      { requestId: 'r1' },
    );
  return { ...capture, ingest, run };
}

const sentDraft = (t: ReturnType<typeof setup>, call = 0) =>
  (t.ingest.proposeDirect.mock.calls[call][0] as { draft: { title: string; newCategory?: string } })
    .draft;

describe('imports.service strict and unmatched categories (D446, D451)', () => {
  let t: ReturnType<typeof setup>;
  beforeEach(() => {
    t = setup();
  });

  it('strict: refuses a row with unmatched names, imports the others', async () => {
    const res = await t.run([row('ok'), row('bad', { unmatched: ['Athens'] }), row('ok2')], true);
    expect(t.ingest.proposeDirect.mock.calls.map((_, i) => sentDraft(t, i).title)).toEqual([
      'ok',
      'ok2',
    ]);
    expect(res).toMatchObject({ imported: 2, duplicates: 0, refused: 1 });
    expect(res.failed).toEqual([
      { index: 1, problem: UNMATCHED, detail: expect.stringContaining('Athens') },
    ]);
  });

  it('strict: names every unmatched name in the detail and never creates a suggestion', async () => {
    const res = await t.run([row('bad', { unmatched: ['Athens', 'Rome'] })], true);
    expect(res.failed[0].detail).toMatch(/Athens.*Rome/);
    expect(t.ingest.proposeDirect).not.toHaveBeenCalled();
  });

  it('strict with empty unmatched imports normally', async () => {
    const res = await t.run([row('ok', { unmatched: [] })], true);
    expect(res).toMatchObject({ imported: 1, refused: 0, failed: [] });
  });

  it('non-strict: one unmatched name becomes newCategory', async () => {
    for (const strict of [false, undefined]) {
      t.ingest.proposeDirect.mockClear();
      const res = await t.run([row('r', { unmatched: ['Athens'] })], strict);
      expect(res).toMatchObject({ imported: 1, refused: 0, failed: [] });
      expect(sentDraft(t).newCategory).toBe('Athens');
    }
  });

  it('non-strict: more than one unmatched name fails the row', async () => {
    const res = await t.run([row('r', { unmatched: ['A', 'B'] }), row('ok')]);
    expect(res).toMatchObject({ imported: 1, refused: 1 });
    expect(res.failed).toEqual([{ index: 0, problem: TOO_MANY, detail: expect.any(String) }]);
  });

  it('non-strict: newCategory plus a different unmatched name counts together and fails', async () => {
    const res = await t.run([row('r', { newCategory: 'A', unmatched: ['B'] })]);
    expect(res.refused).toBe(1);
    expect(res.failed[0]).toMatchObject({ index: 0, problem: TOO_MANY });
    expect(t.ingest.proposeDirect).not.toHaveBeenCalled();
  });

  it('non-strict: newCategory plus the same name (distinct count 1) is kept', async () => {
    const res = await t.run([row('r', { newCategory: 'A', unmatched: ['A'] })]);
    expect(res).toMatchObject({ imported: 1, refused: 0 });
    expect(sentDraft(t).newCategory).toBe('A');
  });

  it('writes one rows_refused event per reason with the count, and no names', async () => {
    await t.run(
      [
        row('c', { unmatched: ['X', 'Y'] }),
        row('d', { unmatched: ['Z', 'W'] }),
        row('e', { unmatched: ['V', 'U'] }),
      ],
      false,
    );
    await t.run([row('f', { unmatched: ['Secret3'] }), row('g', { unmatched: ['Secret4'] })], true);
    await t.flush();
    const refused = (reason: string) =>
      t.lines.filter((l) => l.event === 'imports.rows_refused' && l.reason === reason);
    expect(refused('too_many_new_categories')).toHaveLength(1);
    expect(refused('too_many_new_categories')[0]).toMatchObject({
      outcome: 'refused',
      count: 3,
      requestId: 'r1',
      deckId: 'd1',
    });
    expect(refused('unmatched_category')).toHaveLength(1);
    expect(refused('unmatched_category')[0]).toMatchObject({ count: 2, requestId: 'r1' });
    expect(JSON.stringify(t.lines)).not.toMatch(/Secret|"X"|"Y"/);
  });

  it('writes imports.completed once per request with counts and requestId', async () => {
    t.ingest.proposeDirect
      .mockResolvedValueOnce({ dedup: { action: 'new' } })
      .mockResolvedValueOnce({ dedup: { action: 'skip' } });
    await t.run([row('a'), row('b'), row('c', { unmatched: ['Q'] })], true);
    await t.flush();
    expect(t.lines.filter((l) => l.event === 'imports.completed')).toHaveLength(1);
    const line = expectDecision(t.lines, 'imports.completed', { outcome: 'accepted' });
    expect(line).toMatchObject({
      imported: 2,
      duplicates: 1,
      refused: 1,
      requestId: 'r1',
      deckId: 'd1',
    });
  });

  it('writes no rows_refused event when nothing is refused', async () => {
    await t.run([row('a')]);
    await t.flush();
    expect(t.lines.some((l) => l.event === 'imports.rows_refused')).toBe(false);
  });
});

describe('imports.service daily cap and invalid rows (D447, D451)', () => {
  const RATE_LIMITED = '/problems/rate-limited';
  const NOW = new Date('2026-06-01T10:00:00.000Z');
  const RETRY_AFTER = 5400; // the oldest counted row ages out 90 minutes from now
  const agesOutAt = new Date(NOW.getTime() + RETRY_AFTER * 1000).toISOString();
  let t: ReturnType<typeof setup>;
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    t = setup();
  });
  afterEach(() => vi.useRealTimers());

  const capAfter = (ok: number) => {
    for (let i = 0; i < ok; i += 1) t.ingest.proposeDirect.mockResolvedValueOnce({ dedup: null });
    t.ingest.proposeDirect.mockRejectedValue(rateLimited(RETRY_AFTER));
  };

  it('lists the rest as rate-limited with the age-out time, keeps proposed rows, counts refused', async () => {
    capAfter(2);
    const res = await t.run([row('a'), row('b'), row('c'), row('d'), row('e')]);
    expect(res).toMatchObject({ imported: 2, refused: 3 });
    expect(res.failed.map((f) => f.index)).toEqual([2, 3, 4]);
    for (const f of res.failed) {
      expect(f.problem).toBe(RATE_LIMITED);
      expect(f.detail).toContain('Daily import limit reached');
      expect(f.detail).toContain(agesOutAt);
    }
  });

  it('writes one daily_cap event with count and cap, not one per row', async () => {
    capAfter(1);
    await t.run([row('a'), row('b'), row('c'), row('d')]);
    await t.flush();
    const events = t.lines.filter(
      (l) => l.event === 'imports.rows_refused' && l.reason === 'daily_cap',
    );
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      outcome: 'refused',
      count: 3,
      cap: expect.any(Number),
      requestId: 'r1',
      deckId: 'd1',
    });
    expect(expectDecision(t.lines, 'imports.completed', { outcome: 'accepted' })).toMatchObject({
      imported: 1,
      refused: 3,
    });
  });

  it('nothing imported yet: keeps the 429 with Retry-After', async () => {
    capAfter(0);
    await expect(t.run([row('a'), row('b')])).rejects.toMatchObject({
      status: 429,
      type: RATE_LIMITED,
      headers: { 'Retry-After': String(RETRY_AFTER) },
    });
    await t.flush();
    expect(
      expectDecision(t.lines, 'imports.rows_refused', { outcome: 'refused', reason: 'daily_cap' }),
    ).toMatchObject({ count: 2, requestId: 'r1' });
    expect(expectDecision(t.lines, 'imports.completed', { outcome: 'accepted' })).toMatchObject({
      imported: 0,
      refused: 2,
    });
  });

  it('records invalid_row once per request with the count for server-invalid rows', async () => {
    const bad = row('bad', { body: 'x'.repeat(2001) });
    // T048 may fail the row or the request; either way the decision is recorded.
    await t.run([row('ok'), bad, row('bad2', { body: 'y'.repeat(2001) })]).catch(() => undefined);
    await t.flush();
    const events = t.lines.filter(
      (l) => l.event === 'imports.rows_refused' && l.reason === 'invalid_row',
    );
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ outcome: 'refused', count: 2, requestId: 'r1' });
  });
});
