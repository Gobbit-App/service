import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { keyboardInset, useKeyboardInset } from './use-keyboard-inset';

describe('keyboardInset (D305)', () => {
  it('is the height the keyboard covers', () => {
    expect(keyboardInset(800, { height: 500, offsetTop: 0 })).toBe(300);
    expect(keyboardInset(800, { height: 500, offsetTop: 40 })).toBe(260);
  });

  it('is 0 without visualViewport or when nothing is covered', () => {
    expect(keyboardInset(800, null)).toBe(0);
    expect(keyboardInset(800, { height: 820, offsetTop: 0 })).toBe(0);
  });
});

class FakeViewport extends EventTarget {
  height = 800;
  offsetTop = 0;
  set(height: number) {
    this.height = height;
    this.dispatchEvent(new Event('resize'));
  }
}

describe('useKeyboardInset', () => {
  const original = window.visualViewport;
  afterEach(() => {
    Object.defineProperty(window, 'visualViewport', { value: original, configurable: true });
  });

  it('writes --kb-inset and data-keyboard on the root while the keyboard is open', () => {
    const viewport = new FakeViewport();
    Object.defineProperty(window, 'visualViewport', { value: viewport, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true });
    const root = document.createElement('form');
    const { result, unmount } = renderHook(() => useKeyboardInset({ current: root }));
    expect(result.current).toBe(false);
    expect(root.style.getPropertyValue('--kb-inset')).toBe('0px');

    act(() => viewport.set(450));
    expect(result.current).toBe(true);
    expect(root.style.getPropertyValue('--kb-inset')).toBe('350px');
    expect(root.dataset['keyboard']).toBe('open');

    // A small inset (an accessory bar, a toolbar) is not the keyboard.
    act(() => viewport.set(700));
    expect(result.current).toBe(false);
    expect(root.dataset['keyboard']).toBeUndefined();

    act(() => viewport.set(450));
    unmount();
    expect(root.style.getPropertyValue('--kb-inset')).toBe('');
    expect(root.dataset['keyboard']).toBeUndefined();
  });

  it('stays closed without visualViewport', () => {
    Object.defineProperty(window, 'visualViewport', { value: null, configurable: true });
    const root = document.createElement('form');
    const { result } = renderHook(() => useKeyboardInset({ current: root }));
    expect(result.current).toBe(false);
    expect(root.style.getPropertyValue('--kb-inset')).toBe('');
  });
});
