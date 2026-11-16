import type { DbTx } from '@gobbit/db';
import {
  EVENT_ROLL_BATCH,
  nextOccurrence,
  occurrenceYearsBehind,
} from '@gobbit/shared/event-constants';
import type { EventPayload } from '@gobbit/shared/events-cards';
import { lineSink } from '../lib/logger';
import type { DecisionLogger } from '../lib/decision-event';
import type { EventCardDecisions } from '../services/event-cards.events';
import type { EventNoticeHook } from '../services/event-cards.service';
import type { EventCardsRepo } from '../repositories/event-cards.repo';

/**
 * D403: the scheduled `event-roll-sweep` body (every 15 minutes, singleton). Each batch runs in one
 * transaction: the due cards are locked, moved to their next occurrence (a system write, no
 * `item_events` line), and their notices for the new start are synced (reason `past_at_save`).
 * After a batch commits, each card gets an `event.roll` decision and its public deck page is purged.
 * Loops until a batch comes back short. Returns the number of cards rolled.
 */
export function createEventRollSweep(deps: {
  events: Pick<EventCardsRepo, 'dueRolls' | 'setPayload'>;
  transaction: <T>(fn: (tx: DbTx) => Promise<T>) => Promise<T>;
  noticeHook: EventNoticeHook;
  decisions: DecisionLogger<EventCardDecisions>;
  /** D180: the API's page cache is in-process, so the worker usually has nothing to purge. */
  purgeDeck?: (deckId: string) => void;
  now?: () => Date;
  batch?: number;
  log?: (msg: string) => void;
}) {
  const {
    events,
    transaction,
    noticeHook,
    decisions,
    purgeDeck,
    now = () => new Date(),
    batch = EVENT_ROLL_BATCH,
    log = lineSink('worker', 'info'),
  } = deps;

  /** One transaction: returns how many rows were claimed and which were rolled. */
  async function rollBatch(at: Date) {
    return transaction(async (tx) => {
      const rows = await events.dueRolls(tx, batch);
      const rolled: Array<{ itemId: string; deckId: string; years: number }> = [];
      for (const row of rows) {
        const payload = row.payload as unknown as EventPayload;
        const years = occurrenceYearsBehind(payload, at);
        if (years === 0) continue;
        const next = nextOccurrence(payload, at);
        await events.setPayload(tx, row.id, next as unknown as Record<string, unknown>);
        const syncNotices = noticeHook(
          { id: row.id, type: row.type },
          next as unknown as Record<string, unknown>,
          'past_at_save',
        );
        if (syncNotices) await syncNotices(tx);
        rolled.push({ itemId: row.id, deckId: row.deckId, years });
      }
      return { claimed: rows.length, rolled };
    });
  }

  return async function eventRollSweep(jobId?: string): Promise<{ rolled: number }> {
    let total = 0;
    for (;;) {
      const { claimed, rolled } = await rollBatch(now());
      for (const r of rolled) {
        decisions.record('event.roll', {
          outcome: 'rolled',
          reason: 'yearly',
          requestId: jobId ?? 'internal',
          deckId: r.deckId,
          itemId: r.itemId,
          years: r.years,
        });
      }
      if (purgeDeck) {
        for (const deckId of new Set(rolled.map((r) => r.deckId))) purgeDeck(deckId);
      }
      total += rolled.length;
      // A batch that rolled nothing ends the run: the rest is picked up by the next tick.
      if (claimed < batch || rolled.length === 0) break;
    }
    log(`[worker] rolled ${total} yearly event cards`);
    return { rolled: total };
  };
}
