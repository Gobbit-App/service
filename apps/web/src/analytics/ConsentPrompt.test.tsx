import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AnalyticsConsent, AppConfig, Me } from '@gobbit/shared';
import { ApiError } from '../api/api-error';
import { queryKeys } from '../api/query-keys';
import { renderWithClient, testQueryClient } from '../test/render';

const { routeState } = vi.hoisted(() => ({ routeState: { routeId: '/d/$slug/' } }));
vi.mock('@tanstack/react-router', () => ({
  useRouterState: ({ select }: { select: (s: unknown) => unknown }) =>
    select({ matches: [{ routeId: '__root__' }, { routeId: routeState.routeId }] }),
}));
vi.mock('../api/client', () => import('../test/api-mock').then((m) => m.clientModule));
const { respond, requests } = await import('../test/api-mock');
const { ConsentPrompt } = await import('./ConsentPrompt');

const ANALYTICS = { siteId: 'site-1', host: 'gobbit.example' };
const UNANSWERED: AnalyticsConsent = { value: 'unanswered', at: null, source: null };

const config = (analytics: AppConfig['analytics']): AppConfig => ({
  analytics,
  cloudinaryCloudName: null,
  commit: 'test',
  search: { semantic: false, ask: false },
  ingest: { enabled: false, emailDomain: null, shortcutUrl: null },
});

function setup({
  analytics = ANALYTICS,
  consent = UNANSWERED,
}: { analytics?: AppConfig['analytics']; consent?: AnalyticsConsent } = {}) {
  const queryClient = testQueryClient();
  queryClient.setQueryData(queryKeys.config, config(analytics));
  queryClient.setQueryData<Me>(queryKeys.me, {
    user: { id: 'u1', email: 'a@b.c', displayName: 'A' },
    decks: [],
    isPlatformAdmin: false,
    analyticsConsent: consent,
  });
  renderWithClient(<ConsentPrompt />, { queryClient });
  return { queryClient };
}

const region = () => screen.queryByRole('region', { name: 'Help improve Gobbit?' });

beforeEach(() => {
  respond.mockReset();
  requests.mockClear();
  routeState.routeId = '/d/$slug/';
});

describe('ConsentPrompt (D263)', () => {
  it('asks an unanswered member in a labelled region, without taking focus', () => {
    setup();
    expect(region()).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Allow' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'No thanks' })).toBeInTheDocument();
    expect(document.activeElement).toBe(document.body);
  });

  it('shows nothing when analytics is off or the member already answered', () => {
    setup({ analytics: null });
    expect(region()).toBeNull();
  });

  it('shows nothing after an answer', () => {
    setup({ consent: { value: 'declined', at: '2026-11-01T10:00:00.000Z', source: 'settings' } });
    expect(region()).toBeNull();
  });

  it.each(['/i/$itemId_/edit', '/d/$slug/new', '/d/$slug/browse', '/sign-in'])(
    'never shows on %s',
    (routeId) => {
      routeState.routeId = routeId;
      setup();
      expect(region()).toBeNull();
    },
  );

  it('"No thanks" saves with source prompt and hides', async () => {
    respond.mockResolvedValueOnce({
      value: 'declined',
      at: '2026-11-03T10:00:00.000Z',
      source: 'prompt',
    });
    const { queryClient } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'No thanks' }));
    await waitFor(() => expect(region()).toBeNull());
    const call = requests.mock.calls.find(([r]) => r === 'PUT /me/analytics-consent');
    expect((call?.[1] as { body: unknown }).body).toEqual({ value: 'declined', source: 'prompt' });
    expect(queryClient.getQueryData<Me>(queryKeys.me)?.analyticsConsent.value).toBe('declined');
  });

  it('a failed save keeps the prompt and says so', async () => {
    respond.mockRejectedValueOnce(new ApiError(500, { status: 500 }));
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'Allow' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Couldn’t save your choice');
    expect(region()).toBeInTheDocument();
  });

  it('close hides it for this app start without saving', () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(region()).toBeNull();
    expect(requests).not.toHaveBeenCalledWith('PUT /me/analytics-consent', expect.anything());
  });
});
