import { describe, expect, it } from 'vitest';
import { CARD_SURFACE, PALETTE, PALETTE_COLORS } from './constants';
import { contrastRatio } from './contrast';

describe('rich-text palette (FR-007)', () => {
  it.each(PALETTE_COLORS)('%s meets 4.5:1 on both card surfaces', (name) => {
    expect(contrastRatio(PALETTE[name].light, CARD_SURFACE.light)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(PALETTE[name].dark, CARD_SURFACE.dark)).toBeGreaterThanOrEqual(4.5);
  });
});

describe('contrastRatio', () => {
  it('is 21 for black on white, symmetric', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrastRatio('#ffffff', '#000000')).toBeCloseTo(21, 5);
  });

  it('rejects non-#rrggbb input', () => {
    expect(() => contrastRatio('red', '#ffffff')).toThrow(/Not a #rrggbb/);
  });
});
