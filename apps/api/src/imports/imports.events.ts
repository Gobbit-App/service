import type { DecisionLevel } from '../lib/decision-event';

/**
 * 049 (plan Accountability table): decisions about bulk import and bulk discard.
 * Fields beyond outcome/reason are ids and counts only, never names, titles, labels or card text;
 * every event also carries `requestId`, `actorId`, `deckId` (D451: one event per reason per request).
 */
export type ImportDecisions = {
  /** `count` rows refused; `cap` only for `daily_cap`. */
  'imports.rows_refused': {
    outcome: 'refused';
    reason: 'daily_cap' | 'unmatched_category' | 'too_many_new_categories' | 'invalid_row';
    count: number;
    cap?: number;
  };
  'imports.completed': {
    outcome: 'accepted';
    reason?: never;
    imported: number;
    duplicates: number;
    refused: number;
  };
  'imports.discarded': {
    outcome: 'accepted';
    reason?: never;
    discarded: number;
    skipped: number;
  };
  'imports.discard_refused': { outcome: 'refused'; reason: 'forbidden' | 'no_pending' };
};

export const IMPORT_DECISION_LEVELS: Partial<Record<string, DecisionLevel>> = {
  'imports.rows_refused:refused:daily_cap': 'warn',
};
