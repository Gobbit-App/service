import { z } from 'zod';
import {
  analyticsConsentChoices,
  analyticsConsentSources,
  analyticsConsentValues,
} from '../analytics/consent';

/** D260: the member's analytics choice as `GET /me` and `PUT /me/analytics-consent` return it. */
export const analyticsConsentSchema = z.object({
  value: z.enum(analyticsConsentValues),
  /** When the current value was set; null while not answered. */
  at: z.string().nullable(),
  source: z.enum(analyticsConsentSources).nullable(),
});

/** D260: body of `PUT /me/analytics-consent`. */
export const setAnalyticsConsentSchema = z
  .object({
    value: z.enum(analyticsConsentChoices),
    source: z.enum(analyticsConsentSources),
  })
  .strict();

export type AnalyticsConsent = z.infer<typeof analyticsConsentSchema>;
export type SetAnalyticsConsent = z.infer<typeof setAnalyticsConsentSchema>;
