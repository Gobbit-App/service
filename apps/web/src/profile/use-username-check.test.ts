import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../api/client', () => import('../test/api-mock').then((m) => m.clientModule));
const { respond, requests } = await import('../test/api-mock');
const { useUsernameCheck } = await import('./use-username-check');

const checks = () => requests.mock.calls.filter(([r]) => r === 'POST /me/username/check');

beforeEach(() => {
  vi.useFakeTimers();
  respond.mockReset();
  requests.mockClear();
});
afterEach(() => vi.useRealTimers());

const settle = () => act(() => vi.advanceTimersByTimeAsync(400));

describe('useUsernameCheck (D425)', () => {
  it('debounces: one call after the last key, checking meanwhile', async () => {
    respond.mockResolvedValue({ available: true });
    const { result, rerender } = renderHook(({ v }) => useUsernameCheck(v, null), {
      initialProps: { v: 'dan' },
    });
    rerender({ v: 'dana' });
    expect(result.current).toEqual({ status: 'checking' });
    await act(() => vi.advanceTimersByTimeAsync(300));
    expect(checks()).toHaveLength(0);
    await settle();
    expect(checks()).toEqual([['POST /me/username/check', { body: { username: 'dana' } }]]);
    expect(result.current).toEqual({ status: 'available' });
  });

  it('reports unavailable with the reason', async () => {
    respond.mockResolvedValue({ available: false, reason: 'unavailable' });
    const { result } = renderHook(() => useUsernameCheck('dana', null));
    await settle();
    expect(result.current).toEqual({ status: 'unavailable', reason: 'unavailable' });
  });

  it('skips the call for an empty value and for the saved name', async () => {
    const empty = renderHook(() => useUsernameCheck('  ', null));
    const own = renderHook(() => useUsernameCheck('Dana', 'dana'));
    await settle();
    expect(checks()).toHaveLength(0);
    expect(empty.result.current.status).toBe('idle');
    expect(own.result.current.status).toBe('idle');
  });

  it('refuses a bad shape or a reserved word locally, without a call', async () => {
    const short = renderHook(() => useUsernameCheck('ab', null));
    const reserved = renderHook(() => useUsernameCheck('admin', null));
    await settle();
    expect(checks()).toHaveLength(0);
    expect(short.result.current).toEqual({ status: 'unavailable', reason: 'invalid' });
    expect(reserved.result.current).toEqual({ status: 'unavailable', reason: 'reserved' });
  });

  it('says nothing when the check fails (rate limit)', async () => {
    respond.mockRejectedValue(new Error('429'));
    const { result } = renderHook(() => useUsernameCheck('dana', null));
    await settle();
    expect(result.current).toEqual({ status: 'idle' });
  });
});
