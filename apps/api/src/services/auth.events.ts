import type { DecisionLevel } from '../lib/decision-event';

/** D241: closed outcome/reason sets of the registration gate's decision events (029 plan). */
export const MAGIC_LINK_OUTCOMES = ['sent', 'waitlisted', 'refused'] as const;
export const MAGIC_LINK_REASONS = ['per_email', 'per_ip'] as const;
export const CALLBACK_OUTCOMES = ['signed_in', 'failed'] as const;
export const CALLBACK_REASONS = ['invalid', 'used', 'expired', 'onboarding', 'closed'] as const;
export const REGISTER_OUTCOMES = ['created', 'existing', 'refused'] as const;

export type CallbackFailureReason = (typeof CALLBACK_REASONS)[number];

export type AuthDecisions = {
  'auth.magic_link': {
    outcome: (typeof MAGIC_LINK_OUTCOMES)[number];
    reason: (typeof MAGIC_LINK_REASONS)[number];
  };
  'auth.callback': { outcome: (typeof CALLBACK_OUTCOMES)[number]; reason: CallbackFailureReason };
  'users.register': { outcome: (typeof REGISTER_OUTCOMES)[number]; reason: 'registration_closed' };
  'registration.mode': { outcome: 'configured' };
};

export const AUTH_DECISION_LEVELS: Partial<Record<string, DecisionLevel>> = {
  'auth.magic_link:refused': 'warn',
  'auth.callback:failed': 'warn',
};
