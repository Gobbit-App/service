import { describe, expect, it } from 'vitest';
import { analyticsAllowed, parseDeviceConsent, type AnalyticsConsentValue } from './consent';

describe('analyticsAllowed (D261)', () => {
  const cases: [AnalyticsConsentValue | null, AnalyticsConsentValue, boolean][] = [
    ['allowed', 'declined', true],
    ['allowed', 'unanswered', true],
    ['declined', 'allowed', false],
    ['declined', 'unanswered', false],
    ['unanswered', 'declined', false],
    ['unanswered', 'unanswered', true],
    ['unanswered', 'allowed', true],
    [null, 'declined', false],
    [null, 'unanswered', true],
    [null, 'allowed', true],
  ];
  it.each(cases)('member %s, device %s → %s', (member, device, expected) => {
    expect(analyticsAllowed(member, device)).toBe(expected);
  });
});

describe('parseDeviceConsent (D264)', () => {
  it('reads a stored choice', () => {
    expect(parseDeviceConsent('{"value":"declined","at":"2026-11-02T10:00:00.000Z"}')).toEqual({
      value: 'declined',
      at: '2026-11-02T10:00:00.000Z',
    });
  });

  it.each([
    null,
    undefined,
    '',
    'nope',
    '[]',
    'null',
    '{"value":"maybe","at":"x"}',
    '{"value":"allowed"}',
  ])('treats %s as not answered', (raw) => {
    expect(parseDeviceConsent(raw)).toBeNull();
  });
});
