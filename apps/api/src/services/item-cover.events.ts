import { decisionLogger, type DecisionLogger } from '../lib/decision-event';
import type { Logger } from '../lib/logger';

/** 044 (plan Accountability table): a cover image write refused. Ids only, never card content. */
export type ItemCoverDecisions = {
  'item.cover': {
    outcome: 'refused';
    reason: 'unsupported_type' | 'unknown_image' | 'other_deck';
  };
};

export type ItemCoverRefusal = {
  reason: ItemCoverDecisions['item.cover']['reason'];
  requestId: string;
  deckId: string;
  /** Present on PATCH, absent on create. */
  itemId?: string;
  actorId: string;
};

/**
 * The level depends on the reason (`other_deck` is warn: a reference to another deck's asset),
 * and `decisionLogger` levels only key on event/outcome, so keep one logger per level.
 */
export function createItemCoverDecisions(parent?: Logger) {
  const info: DecisionLogger<ItemCoverDecisions> = decisionLogger<ItemCoverDecisions>('items', {
    parent,
  });
  const warn: DecisionLogger<ItemCoverDecisions> = decisionLogger<ItemCoverDecisions>('items', {
    parent,
    levels: { 'item.cover': 'warn' },
  });
  return {
    refused({ reason, ...ids }: ItemCoverRefusal): void {
      (reason === 'other_deck' ? warn : info).record('item.cover', {
        outcome: 'refused',
        reason,
        ...ids,
      });
    },
  };
}

const defaultDecisions = createItemCoverDecisions();

export function logItemCoverRefused(refusal: ItemCoverRefusal): void {
  defaultDecisions.refused(refusal);
}
