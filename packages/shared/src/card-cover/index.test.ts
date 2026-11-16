import { describe, expect, it } from 'vitest';
import { supportsCover } from './index';

describe('supportsCover', () => {
  it.each(['text', 'reminder', 'event', 'table', 'calc'] as const)('%s', (t) => {
    expect(supportsCover(t)).toBe(true);
  });
  it.each(['link', 'media'] as const)('not %s', (t) => {
    expect(supportsCover(t)).toBe(false);
  });
});
