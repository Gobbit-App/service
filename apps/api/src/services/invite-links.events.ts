import type { DecisionLevel } from '../lib/decision-event';

/** D466-D477: closed outcome/reason sets of the invite-link decision events (052 plan). */
export const INVITE_GONE_REASONS = ['used', 'revoked', 'expired', 'invalid'] as const;

export type InviteLinkDecisions = {
  'invite_link.create': { outcome: 'created' | 'refused'; reason: 'limit' | 'personal' };
  'invite_link.open': {
    outcome: 'shown' | 'refused';
    reason: (typeof INVITE_GONE_REASONS)[number];
    surface: 'page' | 'preview';
  };
  'invite_link.join': {
    outcome: 'accepted' | 'refused';
    reason: (typeof INVITE_GONE_REASONS)[number] | 'already_member';
    via: 'join' | 'sign_in';
  };
  'invite_link.revoke': { outcome: 'revoked' | 'refused'; reason: 'not_waiting' };
};

export const INVITE_LINK_DECISION_LEVELS: Partial<Record<string, DecisionLevel>> = {
  'invite_link.open:refused': 'warn',
};
