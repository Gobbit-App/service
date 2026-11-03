/**
 * 035: analytics consent (D259–D264, opt-in since D281). One rule decides whether anything is sent; Do Not Track
 * and Global Privacy Control are not consulted (FR-001).
 */

/** Stored answers on the account (D259); "not answered" is a null column. */
export const analyticsConsentChoices = ['allowed', 'declined'] as const;
export type AnalyticsConsentChoice = (typeof analyticsConsentChoices)[number];

/** Where a member's answer was given (D259). */
export const analyticsConsentSources = ['prompt', 'settings'] as const;
export type AnalyticsConsentSource = (typeof analyticsConsentSources)[number];

/** The value as the API and the browser read it (D260, D264). */
export const analyticsConsentValues = ['unanswered', ...analyticsConsentChoices] as const;
export type AnalyticsConsentValue = (typeof analyticsConsentValues)[number];

/** D264: the visitor's choice lives only in this browser, under this `localStorage` key. */
export const DEVICE_CONSENT_KEY = 'gobbit.analytics.consent';

/** D264: what is stored under `DEVICE_CONSENT_KEY`. */
export type DeviceConsent = { value: AnalyticsConsentChoice; at: string };

/**
 * D261, amended by D281: whether analytics may send anything. Opt-in: nothing is sent until
 * someone says yes. `member` is null on anonymous pages, where this browser's visitor choice
 * decides; a member's own answer decides for them (a visitor "yes" never covers member analytics,
 * which is linked to the account).
 */
export function analyticsAllowed(
  member: AnalyticsConsentValue | null,
  device: AnalyticsConsentValue,
): boolean {
  if (member !== null) return member === 'allowed';
  return device === 'allowed';
}

function isChoice(value: unknown): value is AnalyticsConsentChoice {
  return value === 'allowed' || value === 'declined';
}

/** D264: the stored device choice; anything missing, unparsable or unknown is not answered. */
export function parseDeviceConsent(raw: string | null | undefined): DeviceConsent | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const { value, at } = parsed as { value?: unknown; at?: unknown };
    if (!isChoice(value) || typeof at !== 'string') return null;
    return { value, at };
  } catch {
    return null;
  }
}
