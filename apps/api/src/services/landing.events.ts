import type { DecisionLevel } from '../lib/decision-event';

/** D242: closed outcome/reason sets of the landing page's decision events (plan Accountability table). */
export const LANDING_RENDER_STATES = [
  'default',
  'joined',
  'confirmed',
  'confirm_invalid',
  'signed_in',
] as const;
export const LANDING_VIAS = ['root', 'app', 'direct'] as const;
export const LANDING_FORM_OUTCOMES = ['accepted', 'invalid', 'refused'] as const;
export const LANDING_FORM_REASONS = ['per_ip', 'per_email'] as const;

export type LandingRenderState = (typeof LANDING_RENDER_STATES)[number];
export type LandingVia = (typeof LANDING_VIAS)[number];

export type LandingDecisions = {
  'landing.render': { outcome: 'rendered' };
  'landing.form': {
    outcome: (typeof LANDING_FORM_OUTCOMES)[number];
    reason: (typeof LANDING_FORM_REASONS)[number];
  };
};

export const LANDING_DECISION_LEVELS: Partial<Record<string, DecisionLevel>> = {
  'landing.form:refused': 'warn',
};
