import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AnalyticsConsent, Me } from '@gobbit/shared';
import { ApiError } from '../api/api-error';
import { queryKeys } from '../api/query-keys';
import { renderWithClient, testQueryClient } from '../test/render';

vi.mock('../api/client', () => import('../test/api-mock').then((m) => m.clientModule));
const { respond, requests } = await import('../test/api-mock');
const { PrivacySection, consentStatus } = await import('./PrivacySection');

const UNANSWERED: AnalyticsConsent = { value: 'unanswered', at: null, source: null };
const DECLINED: AnalyticsConsent = {
  value: 'declined',
  at: '2026-11-01T10:00:00.000Z',
  source: 'prompt',
};

function setup(consent: AnalyticsConsent | undefined, configured = true) {
  const queryClient = testQueryClient();
  if (consent) {
    queryClient.setQueryData<Me>(queryKeys.me, {
      user: { id: 'u1', email: 'a@b.c', displayName: 'A' },
      decks: [],
      isPlatformAdmin: false,
      analyticsConsent: consent,
    });
  }
  renderWithClient(<PrivacySection configured={configured} consent={consent} />, { queryClient });
  return { queryClient };
}

const toggle = () => screen.getByRole('switch', { name: 'Usage analytics' });

beforeEach(() => {
  respond.mockReset();
  requests.mockClear();
});
afterEach(() => vi.restoreAllMocks());

describe('consentStatus', () => {
  it('describes the answer', () => {
    expect(consentStatus(UNANSWERED)).toBe('Not answered yet (on)');
    expect(consentStatus(undefined)).toBe('Not answered yet (on)');
    expect(consentStatus(DECLINED)).toMatch(/^Since .+/);
  });
});

describe('PrivacySection (D266)', () => {
  it('says only that nothing is measured when analytics is off (FR-013)', () => {
    setup(UNANSWERED, false);
    expect(screen.getByText('This server doesn’t measure usage.')).toBeInTheDocument();
    expect(screen.queryByRole('switch')).toBeNull();
  });

  it('an unanswered member sees the switch on', () => {
    setup(UNANSWERED);
    expect(toggle()).toBeChecked();
    expect(screen.getByText('Not answered yet (on)')).toBeInTheDocument();
    expect(screen.getByText(/never record what you write/)).toBeInTheDocument();
  });

  it('turning it off saves "declined" from settings', async () => {
    respond.mockResolvedValueOnce({ ...DECLINED, source: 'settings' });
    const { queryClient } = setup(UNANSWERED);
    fireEvent.click(toggle());
    await waitFor(() =>
      expect(queryClient.getQueryData<Me>(queryKeys.me)?.analyticsConsent.value).toBe('declined'),
    );
    const call = requests.mock.calls.find(([r]) => r === 'PUT /me/analytics-consent');
    expect((call?.[1] as { body: unknown }).body).toEqual({
      value: 'declined',
      source: 'settings',
    });
  });

  it('a declined member sees it off with the date', () => {
    setup(DECLINED);
    expect(toggle()).not.toBeChecked();
    expect(screen.getByText(/^Since /)).toBeInTheDocument();
  });

  it('is disabled offline, with the reason', () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    setup(UNANSWERED);
    expect(toggle()).toBeDisabled();
    expect(screen.getByText('Changing this needs a connection')).toBeInTheDocument();
  });

  it('a failed save says so', async () => {
    respond.mockRejectedValueOnce(new ApiError(500, { status: 500 }));
    setup(UNANSWERED);
    fireEvent.click(toggle());
    expect(await screen.findByRole('alert')).toHaveTextContent('Couldn’t save your choice');
  });
});
