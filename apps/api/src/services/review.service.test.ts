import { IMPORT_DISCARD_MAX } from '@gobbit/shared';
import { describe, expect, it, vi } from 'vitest';
import { captureLogger, expectDecision } from '../../test/capture-logger';
import { HttpError } from '../errors/http-errors';
import type { Actor } from '../types';
import { createReviewService } from './review.service';

const actor: Actor = {
  user: { id: 'u1', accountId: 'a2', email: 'a@b.co', displayName: 'A' },
  via: 'session',
  requestId: 'r1',
};
const deck = { id: 'd1', slug: 'family', ownerAccountId: 'a1' };

/** `pending` cards are listed for the label; `moved` ids have left `proposed` by the time they are discarded. */
function setup(
  opts: { role?: 'maintainer' | 'contributor'; pending?: number; moved?: string[] } = {},
) {
  const capture = captureLogger();
  const rows = Array.from({ length: opts.pending ?? 3 }, (_, i) => ({
    id: `i${i}`,
    deckId: deck.id,
    status: 'proposed',
  }));
  const listed = rows.map((r) => ({ ...r }));
  // The list saw them proposed; findById (at discard time) sees the moved ones published.
  const current = rows.map((r) => (opts.moved?.includes(r.id) ? { ...r, status: 'published' } : r));
  const softDelete = vi.fn().mockResolvedValue(undefined);
  const items = {
    list: vi.fn(async (q: { limit: number }) => listed.slice(0, q.limit)),
    findById: vi.fn(async (id: string) => current.find((r) => r.id === id) ?? null),
  };
  const service = createReviewService({
    decks: {
      findById: vi.fn().mockResolvedValue(deck),
      findBySlug: vi.fn().mockResolvedValue(deck),
    },
    memberships: {
      findActive: vi
        .fn()
        .mockResolvedValue({ role: opts.role ?? 'maintainer', acceptedAt: new Date() }),
    },
    items,
    jobs: { findByResultItem: vi.fn().mockResolvedValue(null) },
    transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        items: { softDelete, lockProposal: vi.fn().mockResolvedValue(true) },
        jobs: { update: vi.fn() },
      }),
    uploads: null,
    now: () => new Date(),
    logger: capture.logger,
  } as never);
  return { ...capture, items, softDelete, service };
}

describe('review.service.discardImport (D449)', () => {
  it('discards every pending card of the label and records imports.discarded', async () => {
    const t = setup({ pending: 3 });
    expect(await t.service.discardImport(actor, 'family', 'f.md')).toEqual({
      discarded: 3,
      skipped: 0,
    });
    expect(t.softDelete).toHaveBeenCalledTimes(3);
    expect(t.items.list).toHaveBeenCalledWith(
      expect.objectContaining({ deckId: 'd1', status: 'proposed', clientLabel: 'f.md' }),
    );
    await t.flush();
    expect(expectDecision(t.lines, 'imports.discarded', { outcome: 'accepted' })).toMatchObject({
      discarded: 3,
      skipped: 0,
      requestId: 'r1',
      actorId: 'u1',
      deckId: 'd1',
    });
  });

  it('counts a card that left proposed meanwhile as skipped', async () => {
    const t = setup({ pending: 3, moved: ['i1'] });
    expect(await t.service.discardImport(actor, 'family', 'f.md')).toEqual({
      discarded: 2,
      skipped: 1,
    });
    await t.flush();
    expect(expectDecision(t.lines, 'imports.discarded', { outcome: 'accepted' })).toMatchObject({
      discarded: 2,
      skipped: 1,
    });
  });

  it('records imports.discarded (partial) before rethrowing a non-409 error mid-loop', async () => {
    const t = setup({ pending: 3 });
    t.softDelete.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('db down'));
    await expect(t.service.discardImport(actor, 'family', 'f.md')).rejects.toThrow('db down');
    await t.flush();
    expect(
      expectDecision(t.lines, 'imports.discarded', { outcome: 'accepted', reason: 'partial' }),
    ).toMatchObject({ discarded: 1, skipped: 0, requestId: 'r1', deckId: 'd1' });
  });

  it('refuses a non-publisher with forbidden and touches nothing', async () => {
    const t = setup({ role: 'contributor' });
    await expect(t.service.discardImport(actor, 'family', 'f.md')).rejects.toBeInstanceOf(
      HttpError,
    );
    expect(t.softDelete).not.toHaveBeenCalled();
    await t.flush();
    expect(
      expectDecision(t.lines, 'imports.discard_refused', {
        outcome: 'refused',
        reason: 'forbidden',
      }),
    ).toMatchObject({ requestId: 'r1', actorId: 'u1', deckId: 'd1' });
  });

  it('answers 0/0 and no_pending when the label has no pending card', async () => {
    const t = setup({ pending: 0 });
    expect(await t.service.discardImport(actor, 'family', 'f.md')).toEqual({
      discarded: 0,
      skipped: 0,
    });
    await t.flush();
    expectDecision(t.lines, 'imports.discard_refused', {
      outcome: 'refused',
      reason: 'no_pending',
    });
  });

  it('caps one call at IMPORT_DISCARD_MAX', async () => {
    const t = setup({ pending: IMPORT_DISCARD_MAX + 1 });
    expect(await t.service.discardImport(actor, 'family', 'f.md')).toEqual({
      discarded: IMPORT_DISCARD_MAX,
      skipped: 0,
    });
  });
});
