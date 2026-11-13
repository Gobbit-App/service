import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { pendingUpdate, setPendingUpdate, usePendingUpdate } from './sw-update-store';

afterEach(() => setPendingUpdate(null));

describe('sw-update-store', () => {
  it('starts with no pending update', () => {
    expect(pendingUpdate()).toBeNull();
  });

  it('re-renders subscribers when an update becomes pending and when it clears', () => {
    const { result } = renderHook(() => usePendingUpdate());
    expect(result.current).toBeNull();
    const apply = vi.fn();
    act(() => setPendingUpdate(apply));
    expect(result.current).toBe(apply);
    act(() => setPendingUpdate(null));
    expect(result.current).toBeNull();
  });
});
