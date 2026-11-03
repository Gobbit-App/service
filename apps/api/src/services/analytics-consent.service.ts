import type { AnalyticsConsent, SetAnalyticsConsent } from '@gobbit/shared';
import type { DecisionLogger } from '../lib/decision-event';
import type { StoredAnalyticsConsent, UsersRepo } from '../repositories/users.repo';
import { unauthorized } from '../errors/http-errors';
import type { CurrentUser } from '../types';
import type { AnalyticsConsentDecisions } from './analytics-consent.events';

export interface AnalyticsConsentDeps {
  users: Pick<UsersRepo, 'findAnalyticsConsent' | 'setAnalyticsConsent'>;
  decisions: DecisionLogger<AnalyticsConsentDecisions>;
  now: () => Date;
}

/** D260: the stored columns as the API answers them (null value = not answered). */
export function toAnalyticsConsent(stored: StoredAnalyticsConsent | null): AnalyticsConsent {
  if (!stored?.analyticsConsent) return { value: 'unanswered', at: null, source: null };
  return {
    value: stored.analyticsConsent,
    at: stored.analyticsConsentAt?.toISOString() ?? null,
    source: stored.analyticsConsentSource,
  };
}

/**
 * 035 (D259, D260, D265): the member's own analytics choice. Only the signed-in member can read
 * or change it (no user id in the request); every call records `analytics.consent`.
 */
export function createAnalyticsConsentService({ users, decisions, now }: AnalyticsConsentDeps) {
  return {
    async get(user: CurrentUser): Promise<AnalyticsConsent> {
      return toAnalyticsConsent(await users.findAnalyticsConsent(user.id));
    },

    async set(
      user: CurrentUser,
      input: SetAnalyticsConsent,
      ctx: { requestId: string },
    ): Promise<AnalyticsConsent> {
      const result = await users.setAnalyticsConsent({
        userId: user.id,
        value: input.value,
        source: input.source,
        requestId: ctx.requestId,
        at: now(),
      });
      // The session resolved to this user moments ago; a vanished row is a session gone stale.
      if (!result) throw unauthorized('The signed-in user no longer exists');

      decisions.record('analytics.consent', {
        outcome: result.changed ? 'changed' : 'unchanged',
        ...(result.changed ? { from: result.from ?? 'unanswered' } : {}),
        value: input.value,
        source: input.source,
        userId: user.id,
        requestId: ctx.requestId,
      });
      return toAnalyticsConsent(result.consent);
    },
  };
}

export type AnalyticsConsentService = ReturnType<typeof createAnalyticsConsentService>;
