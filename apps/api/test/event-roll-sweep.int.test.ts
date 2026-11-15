import { beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { eventCards, eventNotices, items, type DeckRow } from '@gobbit/db';
import { createDeck, createItem } from '@gobbit/db/test';
import { nextOccurrence } from '@gobbit/shared/event-constants';
import type { EventPayload } from '@gobbit/shared/events-cards';
import { createEventRollSweep } from '../src/jobs/event-roll-sweep';
import type { DecisionLogger } from '../src/lib/decision-event';
import { createEventCardsRepo } from '../src/repositories/event-cards.repo';
import type { EventCardDecisions } from '../src/services/event-cards.events';
import { createEventNoticeHook } from '../src/services/event-cards.service';
import { setupApiTest } from './helpers';

const HOUR_MS = 3_600_000;

/** A timed event that started `hoursAgo` hours ago (so its span has ended for a 1 h event). */
function timedPayload(startMs: number, repeat?: 'yearly'): EventPayload {
  return {
    allDay: false,
    start: new Date(startMs).toISOString(),
    timeZone: 'UTC',
    ...(repeat ? { repeat } : {}),
    notify: { before: [{ amount: 1, unit: 'hours' }], audience: { mode: 'everyone', userIds: [] } },
  };
}

describe('event roll sweep against the database (D403)', () => {
  const ctx = setupApiTest();
  let deck: DeckRow;
  let decisions: { record: ReturnType<typeof vi.fn> };
  let sweep: ReturnType<typeof createEventRollSweep>;

  beforeEach(async () => {
    deck = await createDeck(ctx.t.db, ctx.world.owner);
    decisions = { record: vi.fn() };
    sweep = createEventRollSweep({
      events: createEventCardsRepo(ctx.t.db),
      transaction: (fn) => ctx.t.db.transaction(fn),
      noticeHook: createEventNoticeHook({ allDayNoticeHour: 9 }),
      decisions: decisions as unknown as DecisionLogger<EventCardDecisions>,
      batch: 100,
      log: vi.fn(),
    });
  });

  async function eventCard(payload: EventPayload) {
    return createItem(ctx.t.db, deck, {
      card: { type: 'event', title: 'Tree lighting', payload: payload as never },
    });
  }

  const payloadOf = async (id: string) =>
    (await ctx.t.db.select().from(items).where(eq(items.id, id)))[0]?.payload as EventPayload;

  it('rolls an ended yearly card, refreshes its span and notices', async () => {
    const now = Date.now();
    const original = timedPayload(now - 2 * HOUR_MS, 'yearly');
    const card = await eventCard(original);

    expect(await sweep('job-1')).toEqual({ rolled: 1 });

    const expected = nextOccurrence(original, new Date());
    expect(await payloadOf(card.id)).toEqual(expected);

    const [span] = await ctx.t.db.select().from(eventCards).where(eq(eventCards.itemId, card.id));
    expect(span?.startsAt.toISOString()).toBe(expected.start);

    const notices = await ctx.t.db
      .select()
      .from(eventNotices)
      .where(eq(eventNotices.itemId, card.id));
    expect(notices).toEqual([
      expect.objectContaining({
        state: 'pending',
        startsAt: new Date(expected.start),
        beforeAmount: 1,
        beforeUnit: 'hours',
      }),
    ]);

    expect(decisions.record).toHaveBeenCalledWith(
      'event.roll',
      expect.objectContaining({
        outcome: 'rolled',
        reason: 'yearly',
        deckId: deck.id,
        itemId: card.id,
        years: 1,
      }),
    );
  });

  it('leaves a one-off ended event alone', async () => {
    const original = timedPayload(Date.now() - 2 * HOUR_MS);
    const card = await eventCard(original);

    expect(await sweep()).toEqual({ rolled: 0 });
    expect(await payloadOf(card.id)).toEqual(original);
  });

  it('leaves an ongoing yearly card alone', async () => {
    const original = timedPayload(Date.now() + 24 * HOUR_MS, 'yearly');
    const card = await eventCard(original);

    expect(await sweep()).toEqual({ rolled: 0 });
    expect(await payloadOf(card.id)).toEqual(original);
    expect(decisions.record).not.toHaveBeenCalled();
  });
});
