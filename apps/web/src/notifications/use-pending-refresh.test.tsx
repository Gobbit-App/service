import { renderHook } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { queryKeys } from '../api/query-keys';
import { PENDING_CHANGED } from '../push/sw-push';
import { testQueryClient } from '../test/render';
import { usePendingRefresh } from './use-pending-refresh';

const worker = new EventTarget();

function setup() {
  const queryClient = testQueryClient();
  const invalidate = vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { invalidate, ...renderHook(() => usePendingRefresh(), { wrapper }) };
}

const post = (data: unknown) => worker.dispatchEvent(new MessageEvent('message', { data }));

describe('usePendingRefresh (037, FR-024)', () => {
  beforeEach(() => {
    Object.defineProperty(navigator, 'serviceWorker', { value: worker, configurable: true });
  });
  afterEach(() => {
    Reflect.deleteProperty(navigator, 'serviceWorker');
  });

  it('refetches the pending list when the worker reports a push', () => {
    const { invalidate } = setup();
    post({ type: PENDING_CHANGED });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.pending });
  });

  it('ignores other worker messages', () => {
    const { invalidate } = setup();
    post({ type: 'SKIP_WAITING' });
    post(null);
    expect(invalidate).not.toHaveBeenCalled();
  });

  it('stops listening once unmounted', () => {
    const { invalidate, unmount } = setup();
    unmount();
    post({ type: PENDING_CHANGED });
    expect(invalidate).not.toHaveBeenCalled();
  });

  it('does nothing without a service worker', () => {
    Reflect.deleteProperty(navigator, 'serviceWorker');
    expect(() => setup()).not.toThrow();
  });
});
