import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FakeResizeObserver } from '../test/resize-observer';
import { imageSizesFor, nextWidth, useElementWidth } from './use-element-width';

describe('imageSizesFor', () => {
  it('estimates the column content width for a viewport', () => {
    expect(imageSizesFor(360)).toBe('328px');
    expect(imageSizesFor(412)).toBe('380px');
  });

  it('caps at the column width on wide screens', () => {
    expect(imageSizesFor(1440)).toBe('608px');
  });

  it('never goes below 1px', () => {
    expect(imageSizesFor(10)).toBe('1px');
  });
});

describe('nextWidth', () => {
  it('takes the first measurement, rounded', () => {
    expect(nextWidth(null, 327.6)).toBe(328);
  });

  it('ignores changes under 8 px and hidden (0) widths', () => {
    expect(nextWidth(328, 335)).toBe(328);
    expect(nextWidth(328, 0)).toBe(328);
    expect(nextWidth(null, 0)).toBeNull();
  });

  it('follows changes of 8 px or more', () => {
    expect(nextWidth(328, 336)).toBe(336);
    expect(nextWidth(328, 300)).toBe(300);
  });
});

describe('useElementWidth', () => {
  function setup() {
    const element = document.createElement('div');
    const ref = { current: element };
    const hook = renderHook(() => useElementWidth(ref));
    return { element, ...hook };
  }

  it('is null until measured, then the measured width', () => {
    const { element, result } = setup();
    expect(result.current).toBeNull();
    act(() => FakeResizeObserver.resize(element, 412));
    expect(result.current).toBe(412);
  });

  it('ignores resizes under 8 px', () => {
    const { element, result } = setup();
    act(() => FakeResizeObserver.resize(element, 412));
    act(() => FakeResizeObserver.resize(element, 417));
    expect(result.current).toBe(412);
    act(() => FakeResizeObserver.resize(element, 600));
    expect(result.current).toBe(600);
  });

  it('stops observing on unmount', () => {
    const { element, unmount } = setup();
    expect(FakeResizeObserver.watching(element)).toBe(true);
    unmount();
    expect(FakeResizeObserver.watching(element)).toBe(false);
  });
});
