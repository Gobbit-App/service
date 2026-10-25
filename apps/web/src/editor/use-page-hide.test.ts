import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { usePageHide } from './use-page-hide';

function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
}

afterEach(() => setVisibility('visible'));

describe('usePageHide', () => {
  it('runs when the page becomes hidden, but not when it becomes visible', () => {
    const callback = vi.fn();
    renderHook(() => usePageHide(callback));

    setVisibility('visible');
    document.dispatchEvent(new Event('visibilitychange'));
    expect(callback).not.toHaveBeenCalled();

    setVisibility('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('runs on pagehide and beforeunload', () => {
    const callback = vi.fn();
    renderHook(() => usePageHide(callback));
    window.dispatchEvent(new Event('pagehide'));
    window.dispatchEvent(new Event('beforeunload'));
    expect(callback).toHaveBeenCalledTimes(2);
  });

  it('calls the latest callback and stops after unmount', () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender, unmount } = renderHook(({ cb }) => usePageHide(cb), {
      initialProps: { cb: first },
    });
    rerender({ cb: second });
    window.dispatchEvent(new Event('pagehide'));
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);

    unmount();
    window.dispatchEvent(new Event('pagehide'));
    expect(second).toHaveBeenCalledTimes(1);
  });
});
