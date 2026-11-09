import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { minuteClockListenerCount, useMinuteClock } from './use-minute-clock';

describe('useMinuteClock (042)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
    vi.setSystemTime(new Date('2026-12-01T10:00:30Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('ticks on the minute boundary for every caller from one timer', () => {
    const a = renderHook(() => useMinuteClock());
    const b = renderHook(() => useMinuteClock());
    expect(a.result.current.toISOString()).toBe('2026-12-01T10:00:30.000Z');
    expect(vi.getTimerCount()).toBe(1);

    act(() => {
      vi.advanceTimersByTime(30_100);
    });
    expect(a.result.current.getUTCMinutes()).toBe(1);
    expect(b.result.current.getTime()).toBe(a.result.current.getTime());
    expect(vi.getTimerCount()).toBe(1);

    a.unmount();
    expect(minuteClockListenerCount()).toBe(1);
    b.unmount();
    expect(minuteClockListenerCount()).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });
});
