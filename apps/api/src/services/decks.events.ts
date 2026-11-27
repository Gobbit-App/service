import type { DecisionLevel } from '../lib/decision-event';

/** D480: closed outcome set of the welcome dismissal decision event (plan Accountability table). */
export const DECK_WELCOME_OUTCOMES = ['dismissed', 'already_dismissed', 'no_membership'] as const;

export type DeckDecisions = {
  'deck.welcome_dismiss': { outcome: (typeof DECK_WELCOME_OUTCOMES)[number] };
};

export const DECK_DECISION_LEVELS: Partial<Record<string, DecisionLevel>> = {};
