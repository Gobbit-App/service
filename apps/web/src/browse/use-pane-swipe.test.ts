import { describe, expect, it } from 'vitest';
import { stepPane } from './use-pane-swipe';

describe('stepPane', () => {
  it('steps without wrapping', () => {
    expect(stepPane('content', 'next')).toBe('details');
    expect(stepPane('details', 'next')).toBe('source');
    expect(stepPane('source', 'next')).toBeNull();
    expect(stepPane('content', 'prev')).toBeNull();
  });
});
