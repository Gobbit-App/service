import {
  DEVICE_CONSENT_KEY,
  parseDeviceConsent,
  type AnalyticsConsentValue,
} from '@gobbit/shared/analytics';

/**
 * D264: the visitor choice this browser made on the landing or a public page. Only read here,
 * never sent; storage that can't be read (private mode, blocked) counts as not answered.
 */
export function readDeviceConsent(
  storage: Pick<Storage, 'getItem'> | undefined = globalThis.localStorage,
): AnalyticsConsentValue {
  try {
    return parseDeviceConsent(storage?.getItem(DEVICE_CONSENT_KEY))?.value ?? 'unanswered';
  } catch {
    return 'unanswered';
  }
}
