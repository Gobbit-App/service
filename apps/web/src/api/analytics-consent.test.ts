import { QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Me } from '@gobbit/shared';
import { testQueryClient } from '../test/render';
import { ApiError } from './api-error';
import { queryKeys } from './query-keys';

const { putMock } = vi.hoisted(() => ({ putMock: vi.fn() }));
vi.mock('./client', () => ({
  api: { PUT: putMock },
  unwrap: (request: Promise<unknown>) => request,
}));
const { useSetAnalyticsConsent } = await import('./analytics-consent');

const me: Me = {
  user: { id: 'u1', email: 'a@b.c', displayName: 'A' },
  decks: [],
  isPlatformAdmin: false,
  analyticsConsent: { value: 'unanswered', at: null, source: null },
};

function setup() {
  const queryClient = testQueryClient();
  queryClient.setQueryData(queryKeys.me, me);
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
  const { result } = renderHook(() => useSetAnalyticsConsent(), { wrapper });
  return { queryClient, result };
}

beforeEach(() => putMock.mockReset());

describe('useSetAnalyticsConsent (D260, D262)', () => {
  it('puts the answer and writes it into the me cache', async () => {
    const saved = { value: 'declined', at: '2026-11-03T10:00:00.000Z', source: 'prompt' } as const;
    putMock.mockResolvedValueOnce(saved);
    const { queryClient, result } = setup();

    result.current.mutate({ value: 'declined', source: 'prompt' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(putMock).toHaveBeenCalledWith('/me/analytics-consent', {
      body: { value: 'declined', source: 'prompt' },
    });
    expect(queryClient.getQueryData<Me>(queryKeys.me)?.analyticsConsent).toEqual(saved);
  });

  it('leaves the cache alone when the save fails', async () => {
    putMock.mockRejectedValueOnce(new ApiError(500, { status: 500 }));
    const { queryClient, result } = setup();
    result.current.mutate({ value: 'allowed', source: 'settings' });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(queryClient.getQueryData<Me>(queryKeys.me)?.analyticsConsent.value).toBe('unanswered');
  });
});
