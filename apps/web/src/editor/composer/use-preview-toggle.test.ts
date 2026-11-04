import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { usePreviewToggle } from './use-preview-toggle';

afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('usePreviewToggle (D309)', () => {
  it('restores the scroll position and focus when leaving the preview', () => {
    const field = document.createElement('input');
    document.body.append(field);
    field.focus();
    Object.defineProperty(window, 'scrollY', { value: 420, configurable: true });
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);

    const { result } = renderHook(() => usePreviewToggle());
    act(() => result.current.toggle());
    expect(result.current.open).toBe(true);
    field.blur();

    act(() => result.current.toggle());
    expect(result.current.open).toBe(false);
    expect(scrollTo).toHaveBeenCalledWith({ top: 420 });
    expect(field).toHaveFocus();
  });

  it('close reports whether the preview was open, so Escape can stop there', () => {
    vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
    const { result } = renderHook(() => usePreviewToggle());
    let closed = true;
    act(() => {
      closed = result.current.close();
    });
    expect(closed).toBe(false);

    act(() => result.current.toggle());
    act(() => {
      closed = result.current.close();
    });
    expect(closed).toBe(true);
    expect(result.current.open).toBe(false);
  });

  it('skips focus that left the page', () => {
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
    const field = document.createElement('input');
    document.body.append(field);
    field.focus();
    const { result } = renderHook(() => usePreviewToggle());
    act(() => result.current.toggle());
    field.remove();
    act(() => result.current.toggle());
    expect(scrollTo).toHaveBeenCalled();
    expect(document.body).toHaveFocus();
  });
});
