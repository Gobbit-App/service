import type { DecisionLevel } from '../lib/decision-event';

/** 037 (plan Accountability table): decisions about dismissing, dismiss rules and deleting. */
export type ReminderDecisions = {
  /** D294: someone dismissed a reminder, or was refused. */
  'reminder.dismiss': {
    outcome: 'accepted' | 'refused';
    reason: 'done' | 'dismissed' | 'not_eligible' | 'not_pending';
  };
  /** D293: a change of who can dismiss was refused. */
  'reminder.dismissers': { outcome: 'refused'; reason: 'not_creator' | 'not_writer' };
  /** D293: an editor deleted their own reminder, or tried to delete someone else's. */
  'reminder.delete': { outcome: 'accepted' | 'refused'; reason: 'creator' | 'not_creator' };
};

export const REMINDER_DECISION_LEVELS: Partial<Record<string, DecisionLevel>> = {
  'reminder.dismiss:refused': 'warn',
  'reminder.dismissers:refused': 'warn',
  'reminder.delete:refused': 'warn',
};
