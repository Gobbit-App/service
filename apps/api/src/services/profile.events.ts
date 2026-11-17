import { decisionLogger, type DecisionLevel } from '../lib/decision-event';
import type { Logger } from '../lib/logger';

/** 046 (plan Accountability table): username claims, holds, availability checks and member lookups. */
export type ProfileDecisions = {
  /** D426: a username was claimed, changed or cleared, or refused. `usernameHash` is keyed, never the text. */
  'profile.username': {
    outcome: 'claimed' | 'changed' | 'cleared' | 'refused';
    reason?: 'invalid' | 'reserved' | 'taken' | 'held';
  };
  /** A released username went into its hold. */
  'profile.username_hold': { outcome: 'held'; reason?: never };
  /** An availability check answered, or was rate limited. */
  'profile.username_check': {
    outcome: 'available' | 'unavailable' | 'refused';
    reason?: 'invalid' | 'reserved' | 'unavailable' | 'rate_limited';
  };
  /** A profile save was refused because the member saved too often. */
  'profile.update': { outcome: 'refused'; reason: 'rate_limited' };
  /** D429: a profile photo was refused; the member only sees "Unknown image". */
  'profile.avatar': { outcome: 'refused'; reason: 'unknown' | 'foreign' | 'rejected' };
  /** A member lookup by username or email; `targetId` only on `found`. */
  'profile.lookup': {
    outcome: 'found' | 'not_found' | 'refused';
    reason?: 'rate_limited';
    kind?: 'username' | 'email';
    queryHash?: string;
    targetId?: string;
  };
};

export const PROFILE_DECISION_LEVELS: Partial<Record<string, DecisionLevel>> = {
  // Impersonation attempts; the other refusals stay info.
  'profile.username:refused:reserved': 'warn',
  // Someone else's file or a deck image points at a client bug or probing.
  'profile.avatar:refused:foreign': 'warn',
};

export function createProfileDecisions(parent?: Logger) {
  return decisionLogger<ProfileDecisions>('profile', {
    levels: PROFILE_DECISION_LEVELS,
    parent,
  });
}
