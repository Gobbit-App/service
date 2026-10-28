import type { DecisionLevel } from '../lib/decision-event';
import type { WaitlistDecisions } from './waitlist.events';

/** 032: closed outcome/reason sets of the admin decision events (plan Accountability table). */
export const WAITLIST_ADMIN_OUTCOMES = [
  'invited',
  'resent',
  'linked_existing',
  'removed',
  'unchanged',
  'refused',
] as const;
export const WAITLIST_ADMIN_REASONS = ['pending', 'removed', 'invited', 'not_found'] as const;
export const ADMIN_DENIED_REASONS = ['not_admin', 'signed_out'] as const;

export type WaitlistAdminRefusal = (typeof WAITLIST_ADMIN_REASONS)[number];
export type AdminDeniedReason = (typeof ADMIN_DENIED_REASONS)[number];

export type WaitlistAdminDecisions = {
  'waitlist.admin': {
    outcome: (typeof WAITLIST_ADMIN_OUTCOMES)[number];
    reason: WaitlistAdminRefusal;
  };
  'waitlist.admin_list': { outcome: 'listed' };
  'waitlist.mail': WaitlistDecisions['waitlist.mail'];
};

export type AdminAccessDecisions = {
  'admin.denied': { outcome: 'denied'; reason: AdminDeniedReason };
  'admin.config': { outcome: 'configured' };
};

export const WAITLIST_ADMIN_DECISION_LEVELS: Partial<Record<string, DecisionLevel>> = {
  'waitlist.admin:refused': 'warn',
  'waitlist.mail:failed': 'error',
};

export const ADMIN_ACCESS_DECISION_LEVELS: Partial<Record<string, DecisionLevel>> = {
  'admin.denied': 'warn',
};
