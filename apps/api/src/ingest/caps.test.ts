import { describe, expect, it } from 'vitest';
import { ingestDailyCaps } from '@pb/shared';
import { countsTowardCombinedCap, withinCaps } from './caps';

const dailyCaps = ingestDailyCaps(50);
const check = (channel: 'paste' | 'import', own: number, combined: number | null) =>
  withinCaps({ channel, own, combined, dailyCaps, combinedCap: 200 });

describe('ingest caps (D110, D190)', () => {
  it('keeps imports out of the combined cap', () => {
    expect(countsTowardCombinedCap('import')).toBe(false);
    expect(countsTowardCombinedCap('paste')).toBe(true);
    expect(countsTowardCombinedCap('mcp')).toBe(true);
  });

  it('stops a channel at its own cap', () => {
    expect(check('paste', 49, 0)).toBe(true);
    expect(check('paste', 50, 0)).toBe(false);
    expect(check('import', 149, null)).toBe(true);
    expect(check('import', 150, null)).toBe(false);
  });

  it('stops counted channels at the combined cap, never imports', () => {
    expect(check('paste', 0, 200)).toBe(false);
    expect(check('import', 0, null)).toBe(true);
  });
});
