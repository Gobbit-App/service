import { fireEvent, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useBrowseKeys } from './use-browse-keys';

describe('useBrowseKeys', () => {
  it('runs the mapped action and prevents the native scroll', () => {
    const next = vi.fn();
    renderHook(() => useBrowseKeys({ 'next-card': next }));
    const event = new KeyboardEvent('keydown', { key: 'PageDown', cancelable: true });
    document.dispatchEvent(event);
    expect(next).toHaveBeenCalledOnce();
    expect(event.defaultPrevented).toBe(true);
  });

  it('leaves keys without an action alone', () => {
    renderHook(() => useBrowseKeys({ 'next-card': vi.fn() }));
    const event = new KeyboardEvent('keydown', { key: 'ArrowLeft', cancelable: true });
    document.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });

  it('does nothing while disabled and stops listening on unmount', () => {
    const close = vi.fn();
    const { rerender, unmount } = renderHook(({ enabled }) => useBrowseKeys({ close }, enabled), {
      initialProps: { enabled: false },
    });
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(close).not.toHaveBeenCalled();
    rerender({ enabled: true });
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(close).toHaveBeenCalledOnce();
    unmount();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(close).toHaveBeenCalledOnce();
  });
});
