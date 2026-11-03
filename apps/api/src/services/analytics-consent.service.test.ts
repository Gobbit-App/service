import { describe, expect, it, vi } from 'vitest';
import { captureLogger, expectDecision } from '../../test/capture-logger';
import { decisionLogger } from '../lib/decision-event';
import type { AnalyticsConsentDecisions } from './analytics-consent.events';
import { createAnalyticsConsentService, toAnalyticsConsent } from './analytics-consent.service';

const NOW = new Date('2026-11-02T10:00:00.000Z');
const user = { id: 'u1', accountId: 'a1', email: 'a@b.co', displayName: 'A' };

function setup(result: unknown) {
  const capture = captureLogger();
  const users = {
    findAnalyticsConsent: vi.fn(),
    setAnalyticsConsent: vi.fn().mockResolvedValue(result),
  };
  const service = createAnalyticsConsentService({
    users,
    decisions: decisionLogger<AnalyticsConsentDecisions>('analytics', { parent: capture.logger }),
    now: () => NOW,
  });
  return { ...capture, users, service };
}

const declined = {
  analyticsConsent: 'declined' as const,
  analyticsConsentAt: NOW,
  analyticsConsentSource: 'prompt' as const,
};

describe('toAnalyticsConsent (D260)', () => {
  it('maps null columns to not answered', () => {
    expect(toAnalyticsConsent(null)).toEqual({ value: 'unanswered', at: null, source: null });
    expect(
      toAnalyticsConsent({
        analyticsConsent: null,
        analyticsConsentAt: null,
        analyticsConsentSource: null,
      }),
    ).toEqual({ value: 'unanswered', at: null, source: null });
  });

  it('maps a stored choice with its date and source', () => {
    expect(toAnalyticsConsent(declined)).toEqual({
      value: 'declined',
      at: NOW.toISOString(),
      source: 'prompt',
    });
  });
});

describe('analytics consent service (D259, D265)', () => {
  it('saves the caller’s own choice and records a changed decision', async () => {
    const { service, users, lines, flush } = setup({
      changed: true,
      from: null,
      consent: declined,
    });
    const out = await service.set(
      user,
      { value: 'declined', source: 'prompt' },
      { requestId: 'r1' },
    );
    expect(out).toEqual({ value: 'declined', at: NOW.toISOString(), source: 'prompt' });
    expect(users.setAnalyticsConsent).toHaveBeenCalledWith({
      userId: 'u1',
      value: 'declined',
      source: 'prompt',
      requestId: 'r1',
      at: NOW,
    });
    await flush();
    const line = expectDecision(lines, 'analytics.consent', { outcome: 'changed' });
    expect(line).toMatchObject({
      from: 'unanswered',
      value: 'declined',
      source: 'prompt',
      userId: 'u1',
      requestId: 'r1',
    });
    expect(JSON.stringify(line)).not.toContain('a@b.co');
  });

  it('records unchanged (no from) when the value is the same', async () => {
    const { service, lines, flush } = setup({
      changed: false,
      from: 'declined',
      consent: declined,
    });
    await service.set(user, { value: 'declined', source: 'settings' }, { requestId: 'r2' });
    await flush();
    const line = expectDecision(lines, 'analytics.consent', { outcome: 'unchanged' });
    expect(line).not.toHaveProperty('from');
    expect(line).toMatchObject({ value: 'declined', source: 'settings' });
  });

  it('refuses when the user row is gone', async () => {
    const { service } = setup(null);
    await expect(
      service.set(user, { value: 'allowed', source: 'settings' }, { requestId: 'r3' }),
    ).rejects.toMatchObject({ status: 401 });
  });
});
