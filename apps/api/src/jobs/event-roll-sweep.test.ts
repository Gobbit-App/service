import { describe, expect, it, vi } from 'vitest';
import type { DbTx } from '@gobbit/db';
import type { DecisionLogger } from '../lib/decision-event';
import type { EventCardDecisions } from '../services/event-cards.events';
import { createEventRollSweep } from './event-roll-sweep';

const NOW = new Date('2026-11-15T10:00:00Z');
const TX = {} as DbTx;

const notify = { before: [], audience: { mode: 'everyone', userIds: [] } };

function yearly(id: string, deckId: string, start: string) {
  return {
    id,
    deckId,
    type: 'event',
    payload: { allDay: true, start, timeZone: 'UTC', repeat: 'yearly', notify },
  };
}

function setup(batches: Array<Array<ReturnType<typeof yearly>>>, batch = 100) {
  const queue = [...batches];
  const events = {
    dueRolls: vi.fn(async () => queue.shift() ?? []),
    setPayload: vi.fn(async () => undefined),
  };
  const syncNotices = vi.fn(async () => undefined);
  const noticeHook = vi.fn(() => syncNotices);
  const decisions = { record: vi.fn() };
  const purgeDeck = vi.fn();
  const log = vi.fn();
  const sweep = createEventRollSweep({
    events: events as never,
    transaction: async (fn) => fn(TX),
    noticeHook: noticeHook as never,
    decisions: decisions as unknown as DecisionLogger<EventCardDecisions>,
    purgeDeck,
    now: () => NOW,
    batch,
    log,
  });
  return { sweep, events, noticeHook, syncNotices, decisions, purgeDeck, log };
}

describe('createEventRollSweep (D403)', () => {
  it('moves an ended yearly card to its next occurrence and syncs its notices', async () => {
    const t = setup([[yearly('e1', 'd1', '2025-12-01')]]);

    const result = await t.sweep('job-1');

    expect(result).toEqual({ rolled: 1 });
    expect(t.events.setPayload).toHaveBeenCalledWith(
      TX,
      'e1',
      expect.objectContaining({ start: '2026-12-01', repeat: 'yearly' }),
    );
    expect(t.noticeHook).toHaveBeenCalledWith(
      { id: 'e1', type: 'event' },
      expect.objectContaining({ start: '2026-12-01' }),
      'past_at_save',
    );
    expect(t.syncNotices).toHaveBeenCalledWith(TX);
  });

  it('records one event.roll decision per card with the years moved', async () => {
    const t = setup([[yearly('e1', 'd1', '2024-12-01')]]);

    await t.sweep('job-1');

    expect(t.decisions.record).toHaveBeenCalledWith('event.roll', {
      outcome: 'rolled',
      reason: 'yearly',
      requestId: 'job-1',
      deckId: 'd1',
      itemId: 'e1',
      years: 2,
    });
  });

  it('leaves a card whose occurrence has not ended alone', async () => {
    const t = setup([[yearly('e1', 'd1', '2026-12-01')]]);

    expect(await t.sweep()).toEqual({ rolled: 0 });
    expect(t.events.setPayload).not.toHaveBeenCalled();
    expect(t.decisions.record).not.toHaveBeenCalled();
  });

  it('purges each distinct deck once per batch, after the commit', async () => {
    const t = setup([
      [
        yearly('e1', 'd1', '2025-12-01'),
        yearly('e2', 'd1', '2025-12-02'),
        yearly('e3', 'd2', '2025-12-03'),
      ],
    ]);

    await t.sweep();

    expect(t.purgeDeck.mock.calls).toEqual([['d1'], ['d2']]);
  });

  it('loops batches until one comes back short', async () => {
    const t = setup(
      [
        [yearly('a', 'd1', '2025-12-01'), yearly('b', 'd1', '2025-12-01')],
        [yearly('c', 'd1', '2025-12-01')],
      ],
      2,
    );

    expect(await t.sweep()).toEqual({ rolled: 3 });
    expect(t.events.dueRolls).toHaveBeenCalledTimes(2);
  });

  it('stops when a full batch rolls nothing, so skipped rows cannot loop forever', async () => {
    const t = setup(
      [
        [yearly('a', 'd1', '2026-12-01'), yearly('b', 'd1', '2026-12-01')],
        [yearly('c', 'd1', '2025-12-01')],
      ],
      2,
    );

    expect(await t.sweep()).toEqual({ rolled: 0 });
    expect(t.events.dueRolls).toHaveBeenCalledTimes(1);
  });

  it('logs a summary of the run', async () => {
    const t = setup([[yearly('e1', 'd1', '2025-12-01')]]);

    await t.sweep();

    expect(t.log).toHaveBeenCalledWith('[worker] rolled 1 yearly event cards');
  });
});
