import type { DecisionLevel } from '../lib/decision-event';

/** 045 (plan Accountability table): decisions about signing and recording uploads. */
export type MediaDecisions = {
  /** D389: an upload permission was signed for one kind, or refused. */
  'media.sign': { outcome: 'accepted' | 'refused'; reason?: 'unavailable' };
  /** D390: a finished upload was recorded, or refused (and its stored file deleted). */
  'media.confirm': {
    outcome: 'accepted' | 'refused';
    reason?:
      | 'format'
      | 'kind_mismatch'
      | 'too_large'
      | 'unreadable'
      | 'bad_signature'
      | 'wrong_folder'
      | 'other_deck';
  };
  /** D408: a card cover was refused; the member only sees "Unknown image". */
  'item.cover': {
    outcome: 'refused';
    reason: 'unsupported_type' | 'unknown_image' | 'other_deck';
  };
  /** D390: the stored file of a refused upload was deleted, or the delete failed. */
  'media.refused_delete': { outcome: 'deleted' | 'failed'; reason?: never };
};

export const MEDIA_DECISION_LEVELS: Partial<Record<string, DecisionLevel>> = {
  'media.sign:refused': 'warn',
  // 044: another deck's image points at a client bug or probing; the other reasons stay info.
  'item.cover:refused:other_deck': 'warn',
  'media.refused_delete:failed': 'error',
};

/** Refusals that point at a tampered client rather than a member's mistake (warn). */
export const TAMPER_REASONS = new Set(['kind_mismatch', 'bad_signature']);
