import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useDebounced } from './use-debounced';

describe('useDebounced', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns the initial value immediately', () => {
    const { result } = renderHook(() => useDebounced('a', 250));

    expect(result.current).toBe('a');
  });

  it('updates only after the delay has elapsed', () => {
    const { result, rerender } = renderHook(({ value }) => useDebounced(value, 250), {
      initialProps: { value: 'a' },
    });

    rerender({ value: 'b' });

    act(() => {
      vi.advanceTimersByTime(249);
    });
    expect(result.current).toBe('a');

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current).toBe('b');
  });

  it('collapses rapid changes to the last value', () => {
    const { result, rerender } = renderHook(({ value }) => useDebounced(value, 250), {
      initialProps: { value: 'a' },
    });

    rerender({ value: 'b' });
    act(() => {
      vi.advanceTimersByTime(100);
    });
    rerender({ value: 'c' });
    act(() => {
      vi.advanceTimersByTime(100);
    });
    rerender({ value: 'd' });

    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(result.current).toBe('a');

    act(() => {
      vi.advanceTimersByTime(150);
    });
    expect(result.current).toBe('d');
  });

  it('restarts the delay when the value changes before it settles', () => {
    const { result, rerender } = renderHook(({ value }) => useDebounced(value, 250), {
      initialProps: { value: 'a' },
    });

    rerender({ value: 'b' });
    act(() => {
      vi.advanceTimersByTime(200);
    });
    rerender({ value: 'c' });

    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(result.current).toBe('a');

    act(() => {
      vi.advanceTimersByTime(50);
    });
    expect(result.current).toBe('c');
  });
});
