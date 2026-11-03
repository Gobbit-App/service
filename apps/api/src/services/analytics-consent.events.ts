import type { DecisionLevel } from '../lib/decision-event';

/** D265: closed outcome set of the consent decision event (plan Accountability table). */
export const ANALYTICS_CONSENT_OUTCOMES = ['changed', 'unchanged'] as const;

export type AnalyticsConsentDecisions = {
  'analytics.consent': { outcome: (typeof ANALYTICS_CONSENT_OUTCOMES)[number] };
};

export const ANALYTICS_CONSENT_DECISION_LEVELS: Partial<Record<string, DecisionLevel>> = {};
