import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useZoneSwipe, zoneSwipeHandler, type ZoneDragState } from './use-zone-swipe';

const WIDTH = 400;

function drag(overrides: Partial<ZoneDragState> = {}): ZoneDragState {
  return {
    first: false,
    last: true,
    tap: false,
    canceled: false,
    initial: [200, 100],
    xy: [200, 100],
    velocity: [0, 0],
    elapsedTime: 300,
    cancel: vi.fn(),
    ...overrides,
  };
}

function setup() {
  const onStep = vi.fn();
  return { onStep, handle: zoneSwipeHandler(onStep, () => WIDTH) };
}

describe('zoneSwipeHandler', () => {
  it('steps next on a leftward swipe and prev on a rightward one', () => {
    const { onStep, handle } = setup();
    handle(drag({ xy: [140, 104] }));
    handle(drag({ xy: [260, 98] }));
    expect(onStep.mock.calls).toEqual([['next'], ['prev']]);
  });

  it('decides only on release', () => {
    const { onStep, handle } = setup();
    handle(drag({ first: true, last: false, xy: [100, 100] }));
    handle(drag({ last: false, xy: [60, 100] }));
    expect(onStep).not.toHaveBeenCalled();
  });

  it('cancels and ignores drags that start in the edge guard', () => {
    const { onStep, handle } = setup();
    const left = drag({ first: true, last: false, initial: [10, 100] });
    handle(left);
    expect(left.cancel).toHaveBeenCalled();
    handle(drag({ initial: [10, 100], xy: [200, 100] }));
    handle(drag({ initial: [390, 100], xy: [200, 100] }));
    expect(onStep).not.toHaveBeenCalled();
  });

  it('filters taps, cancelled drags and short slow drags', () => {
    const { onStep, handle } = setup();
    handle(drag({ tap: true, xy: [198, 100] }));
    handle(drag({ canceled: true, xy: [100, 100] }));
    handle(drag({ xy: [180, 100], velocity: [0.05, 0] }));
    expect(onStep).not.toHaveBeenCalled();
  });

  it('counts a short fast flick', () => {
    const { onStep, handle } = setup();
    handle(drag({ xy: [175, 100], velocity: [0.6, 0], elapsedTime: 40 }));
    expect(onStep).toHaveBeenCalledWith('next');
  });
});

describe('useZoneSwipe', () => {
  it('returns pointer bindings for a band', () => {
    const { result } = renderHook(() => useZoneSwipe(vi.fn()));
    expect(typeof result.current().onPointerDown).toBe('function');
  });
});
