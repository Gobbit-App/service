import type { DecisionLevel } from '../lib/decision-event';

/** D240: closed outcome/reason sets of the waitlist's decision events (plan Accountability table). */
export const WAITLIST_JOIN_OUTCOMES = [
  'created',
  'resent',
  'unchanged',
  'dropped',
  'refused',
] as const;
export const WAITLIST_JOIN_REASONS = [
  'already_confirmed',
  'already_invited',
  'existing_user',
  'honeypot',
  'per_email',
] as const;
export const WAITLIST_CONFIRM_OUTCOMES = ['confirmed', 'invalid'] as const;
export const WAITLIST_CONFIRM_REASONS = ['missing', 'unknown', 'used', 'expired'] as const;
export const WAITLIST_MAIL_OUTCOMES = ['sent', 'failed'] as const;
export const WAITLIST_MAIL_TEMPLATES = ['confirm', 'existing_user', 'invite'] as const;

export type WaitlistConfirmReason = (typeof WAITLIST_CONFIRM_REASONS)[number];
export type WaitlistMailTemplate = (typeof WAITLIST_MAIL_TEMPLATES)[number];

export type WaitlistDecisions = {
  'waitlist.join': {
    outcome: (typeof WAITLIST_JOIN_OUTCOMES)[number];
    reason: (typeof WAITLIST_JOIN_REASONS)[number];
  };
  'waitlist.confirm': {
    outcome: (typeof WAITLIST_CONFIRM_OUTCOMES)[number];
    reason: WaitlistConfirmReason;
  };
  'waitlist.mail': { outcome: (typeof WAITLIST_MAIL_OUTCOMES)[number] };
  'waitlist.prune': { outcome: 'pruned' };
};

export const WAITLIST_DECISION_LEVELS: Partial<Record<string, DecisionLevel>> = {
  'waitlist.join:refused': 'warn',
  'waitlist.mail:failed': 'error',
};
