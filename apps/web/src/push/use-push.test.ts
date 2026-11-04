import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { PushClientDeps } from './push-client';
import type { PushSupport } from './push-support';
import { usePush } from './use-push';

function deps(over: Partial<PushClientDeps> = {}, existing: unknown = null): PushClientDeps {
  const pushManager = {
    getSubscription: async () => existing,
    subscribe: async () => ({
      endpoint: 'https://fcm.googleapis.com/x',
      toJSON: () => ({
        endpoint: 'https://fcm.googleapis.com/x',
        keys: { p256dh: 'a', auth: 'b' },
      }),
      unsubscribe: async () => true,
    }),
  };
  const registration = { pushManager } as unknown as ServiceWorkerRegistration;
  return {
    registration: async () => registration,
    existingRegistration: async () => registration,
    requestPermission: async () => 'granted',
    userAgent: '',
    save: async () => undefined,
    remove: async () => undefined,
    ...over,
  };
}

const ready = (): PushSupport => 'ready';

describe('usePush (037)', () => {
  it('reads whether this device is subscribed', async () => {
    const d = deps({}, { endpoint: 'e', unsubscribe: async () => true });
    const { result } = renderHook(() => usePush('AQID', { deps: d, support: ready }));
    await waitFor(() => expect(result.current.subscribed).toBe(true));
  });

  it('turns push on and reports it', async () => {
    const d = deps();
    const { result } = renderHook(() => usePush('AQID', { deps: d, support: ready }));
    await waitFor(() => expect(result.current.subscribed).toBe(false));
    act(() => result.current.enable());
    await waitFor(() => expect(result.current.notice).toBe('enabled'));
    expect(result.current.subscribed).toBe(true);
  });

  it('maps a refused permission to the denied explanation', async () => {
    const support = vi
      .fn<() => PushSupport>()
      .mockReturnValueOnce('ready')
      .mockReturnValue('denied');
    const d = deps({ requestPermission: async () => 'denied' });
    const { result } = renderHook(() => usePush('AQID', { deps: d, support }));
    await waitFor(() => expect(result.current.subscribed).toBe(false));
    act(() => result.current.enable());
    await waitFor(() => expect(result.current.notice).toBe('denied'));
    expect(result.current.support).toBe('denied');
  });

  it('reports a failed test send and the device count of a good one', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const test = vi
      .fn<() => Promise<{ devices: number }>>()
      .mockRejectedValueOnce(new Error('429'))
      .mockResolvedValueOnce({ devices: 2 });
    const { result } = renderHook(() => usePush('AQID', { deps: deps(), support: ready, test }));
    act(() => result.current.test());
    await waitFor(() => expect(result.current.notice).toBe('failed'));
    act(() => result.current.test());
    await waitFor(() => expect(result.current.notice).toEqual({ tested: 2 }));
  });

  it('does not look for a subscription on an unsupported device', async () => {
    const existingRegistration = vi.fn();
    const { result } = renderHook(() =>
      usePush('AQID', {
        deps: deps({ existingRegistration }),
        support: () => 'unsupported',
      }),
    );
    await waitFor(() => expect(result.current.subscribed).toBe(false));
    expect(existingRegistration).not.toHaveBeenCalled();
  });
});
