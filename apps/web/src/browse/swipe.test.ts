import { afterEach, describe, expect, it } from 'vitest';
import { classifySwipe } from './swipe';

describe('classifySwipe', () => {
  afterEach(() => document.documentElement.removeAttribute('dir'));

  it('counts a slow swipe of 40 px or more', () => {
    expect(classifySwipe({ dx: -40, dy: 0, durationMs: 1000 })).toBe('next');
    expect(classifySwipe({ dx: 60, dy: 5, durationMs: 1000 })).toBe('prev');
    expect(classifySwipe({ dx: -39, dy: 0, durationMs: 1000 })).toBeNull();
  });

  it('counts a short fast flick at 0.3 px/ms', () => {
    expect(classifySwipe({ dx: -30, dy: 0, durationMs: 100 })).toBe('next');
    expect(classifySwipe({ dx: 20, dy: 0, durationMs: 1000, velocityX: 0.5 })).toBe('prev');
    expect(classifySwipe({ dx: -20, dy: 0, durationMs: 1000, velocityX: 0.29 })).toBeNull();
  });

  it('needs x to be the dominant axis', () => {
    expect(classifySwipe({ dx: -50, dy: 60, durationMs: 200 })).toBeNull();
    expect(classifySwipe({ dx: 50, dy: -50, durationMs: 200 })).toBeNull();
    expect(classifySwipe({ dx: -50, dy: 49, durationMs: 200 })).toBe('next');
  });

  it('treats taps and jitters as nothing', () => {
    expect(classifySwipe({ dx: 0, dy: 0, durationMs: 80 })).toBeNull();
    expect(classifySwipe({ dx: -3, dy: 1, durationMs: 5 })).toBeNull();
    expect(classifySwipe({ dx: 0, dy: 0, durationMs: 0 })).toBeNull();
  });

  it('follows the swipe direction, not the text direction', () => {
    document.documentElement.setAttribute('dir', 'rtl');
    expect(classifySwipe({ dx: -80, dy: 0, durationMs: 300 })).toBe('next');
    expect(classifySwipe({ dx: 80, dy: 0, durationMs: 300 })).toBe('prev');
  });
});
