import { describe, expect, it } from 'vitest';
import { EDGE_GUARD_PX, isEdgeStart } from './edge-guard';

describe('isEdgeStart', () => {
  it('guards the first 24 px on the left', () => {
    expect(isEdgeStart(0, 400)).toBe(true);
    expect(isEdgeStart(23, 400)).toBe(true);
    expect(isEdgeStart(23.9, 400)).toBe(true);
    expect(isEdgeStart(24, 400)).toBe(false);
  });

  it('guards the last 24 px on the right', () => {
    expect(isEdgeStart(399, 400)).toBe(true);
    expect(isEdgeStart(376, 400)).toBe(true);
    expect(isEdgeStart(375, 400)).toBe(false);
  });

  it('leaves the middle alone', () => {
    expect(isEdgeStart(200, 400)).toBe(false);
  });

  it('guards everything on a viewport narrower than both guards', () => {
    expect(isEdgeStart(20, 40)).toBe(true);
    expect(isEdgeStart(24, 48)).toBe(true);
    expect(isEdgeStart(24, 49)).toBe(false);
  });

  it('accepts a custom guard', () => {
    expect(EDGE_GUARD_PX).toBe(24);
    expect(isEdgeStart(10, 400, 8)).toBe(false);
  });
});
