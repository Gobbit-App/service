import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SharedPayload } from './share-payload';
import { usePendingShare } from './use-pending-share';

const payload: SharedPayload = {
  id: 'p1',
  createdAt: 0,
  title: '',
  text: 'hi',
  url: '',
  files: [],
};

describe('usePendingShare (D108)', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('is ready with nothing and never reads when there is no id', () => {
    const read = vi.fn(async () => payload);
    const { result } = renderHook(() => usePendingShare(undefined, read));
    expect(result.current).toEqual({ status: 'ready', payload: null });
    expect(read).not.toHaveBeenCalled();
  });

  it('loads the stashed share for the id', async () => {
    const read = vi.fn(async () => payload);
    const { result } = renderHook(() => usePendingShare('p1', read));
    expect(result.current).toEqual({ status: 'loading' });
    await waitFor(() => {
      expect(result.current).toEqual({ status: 'ready', payload });
    });
    expect(read).toHaveBeenCalledWith('p1', expect.any(Number));
  });

  it('is ready with a null payload when nothing is stashed', async () => {
    const read = vi.fn(async (): Promise<SharedPayload | null> => null);
    const { result } = renderHook(() => usePendingShare('p1', read));
    await waitFor(() => {
      expect(result.current).toEqual({ status: 'ready', payload: null });
    });
  });

  it('treats a read failure as nothing pending', async () => {
    const read = vi.fn(async (): Promise<SharedPayload | null> => {
      throw new Error('boom');
    });
    const { result } = renderHook(() => usePendingShare('p1', read));
    await waitFor(() => {
      expect(result.current).toEqual({ status: 'ready', payload: null });
    });
    expect(console.error).toHaveBeenCalled();
  });

  it('reads again when the id changes', async () => {
    const read = vi.fn(async () => payload);
    const { result, rerender } = renderHook(({ id }) => usePendingShare(id, read), {
      initialProps: { id: 'p1' as string | undefined },
    });
    await waitFor(() => {
      expect(result.current).toEqual({ status: 'ready', payload });
    });
    rerender({ id: 'p2' });
    await waitFor(() => {
      expect(read).toHaveBeenCalledWith('p2', expect.any(Number));
    });
  });
});
