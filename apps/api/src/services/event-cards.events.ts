import type { DecisionLevel } from '../lib/decision-event';

/**
 * 042 (plan Accountability table): decisions about event writes and notify settings. The file is
 * `event-cards.*` because `events.service` is the activity log (ADR-057).
 */
export type EventCardDecisions = {
  /** An event write refused by a limit, an unknown audience member or a type change. */
  'event.write': {
    outcome: 'refused';
    reason:
      | 'start_too_far'
      | 'location_too_long'
      | 'too_many_times'
      | 'before_too_long'
      | 'audience_unknown_member'
      | 'type_change';
  };
  /** D363: a change of notify times or audience, or a refused one. */
  'event.notify_settings': { outcome: 'changed' | 'refused'; reason: 'creator' | 'not_creator' };
  /** D364: a member muted or unmuted an event for themselves, or was refused. */
  'event.mute': {
    outcome: 'muted' | 'unmuted' | 'refused';
    reason?: 'not_in_audience' | 'not_an_event';
  };
};

export const EVENT_CARD_DECISION_LEVELS: Partial<Record<string, DecisionLevel>> = {
  'event.notify_settings:refused': 'warn',
  'event.mute:refused': 'warn',
};
