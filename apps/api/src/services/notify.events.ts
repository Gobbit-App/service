import type { DecisionLevel } from '../lib/decision-event';

/** 037 (plan Accountability table): who a due reminder reaches, and how each send ended. */
export type NotifyDecisions = {
  /**
   * D295: `planned`/`skipped` per person when the deadline passes; the rest per delivery.
   * `ineligible` = named in a "specific people" rule but can no longer act on the card.
   */
  'reminder.notify': {
    outcome:
      'planned' | 'skipped' | 'sent' | 'retried' | 'failed' | 'interrupted' | 'gone' | 'dropped';
    reason?:
      | 'opted_out'
      | 'no_channel'
      | 'ineligible'
      | 'stale'
      | 'device_missing'
      | 'max_attempts'
      | (string & {});
  };
  /**
   * D360: per notice (`planned`, or `skipped · started` when found too late), per person
   * (`skipped · muted | no_channel | ineligible | push_off`) and per delivery (as reminders).
   */
  'event.notice': {
    outcome:
      'planned' | 'skipped' | 'sent' | 'retried' | 'failed' | 'interrupted' | 'gone' | 'dropped';
    reason?:
      | 'started'
      | 'muted'
      | 'no_channel'
      | 'ineligible'
      | 'push_off'
      | 'stale'
      | 'device_missing'
      | 'max_attempts'
      | (string & {});
  };
};

/** Alert: `failed` rate > 5 % per hour (plan Accountability table), both kinds. */
export const NOTIFY_DECISION_LEVELS: Partial<Record<string, DecisionLevel>> = {
  'reminder.notify:failed': 'warn',
  'reminder.notify:interrupted': 'warn',
  'event.notice:failed': 'warn',
  'event.notice:interrupted': 'warn',
};

/** D297: a device turned push on or off, or was refused. */
export type PushSubscriptionDecisions = {
  'push.subscription': {
    outcome: 'added' | 'removed' | 'refused';
    reason?: 'host_not_allowed' | 'reassigned' | 'refreshed';
  };
};

export const PUSH_SUBSCRIPTION_DECISION_LEVELS: Partial<Record<string, DecisionLevel>> = {
  'push.subscription:refused': 'warn',
};
