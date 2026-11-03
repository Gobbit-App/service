import { afterEach, describe, expect, it } from 'vitest';
import { DEVICE_CONSENT_KEY } from '@gobbit/shared/analytics';
import { readDeviceConsent } from './device-consent';

afterEach(() => localStorage.clear());

describe('readDeviceConsent (D264)', () => {
  it('reads a stored choice', () => {
    localStorage.setItem(
      DEVICE_CONSENT_KEY,
      JSON.stringify({ value: 'declined', at: '2026-11-01T10:00:00.000Z' }),
    );
    expect(readDeviceConsent()).toBe('declined');
  });

  it('treats missing or malformed values as not answered', () => {
    expect(readDeviceConsent()).toBe('unanswered');
    localStorage.setItem(DEVICE_CONSENT_KEY, '{oops');
    expect(readDeviceConsent()).toBe('unanswered');
    localStorage.setItem(DEVICE_CONSENT_KEY, JSON.stringify({ value: 'maybe', at: 'x' }));
    expect(readDeviceConsent()).toBe('unanswered');
  });

  it('treats a storage error as not answered', () => {
    const broken = {
      getItem: () => {
        throw new Error('SecurityError');
      },
    };
    expect(readDeviceConsent(broken)).toBe('unanswered');
    expect(readDeviceConsent(undefined)).toBe('unanswered');
  });
});
