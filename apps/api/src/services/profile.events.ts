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
};

export function createProfileDecisions(parent?: Logger) {
  return decisionLogger<ProfileDecisions>('profile', {
    levels: PROFILE_DECISION_LEVELS,
    parent,
  });
}
