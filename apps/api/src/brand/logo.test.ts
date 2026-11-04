import { describe, expect, it } from 'vitest';
import {
  BRAND_COLORS,
  MARK_PALETTE,
  SAFE_ZONE_RADIUS,
  TILE_PALETTE,
  logo,
  markBounds,
} from './logo';

const viewBox = (svg: string): number[] => {
  const match = /viewBox="([^"]+)"/.exec(svg);
  if (!match?.[1]) throw new Error('no viewBox');
  return match[1].split(' ').map(Number);
};

const count = (svg: string, needle: string): number => svg.split(needle).length - 1;

describe('logo', () => {
  it('is a square SVG document at the requested pixel size', () => {
    const svg = logo({ px: 180 });
    const [, , w, h] = viewBox(svg);
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true);
    expect(w).toBe(h);
    expect(svg).toContain('width="180" height="180"');
  });

  it('draws the main mark on white by default, with the yellow bits', () => {
    const svg = logo();
    expect(svg).toContain(`fill="${MARK_PALETTE.bg}"`);
    expect(svg).toContain(`stroke="${MARK_PALETTE.mark}"`);
    // Three chimney bits and the G's bar.
    expect(count(svg, `fill="${BRAND_COLORS.accent}"`)).toBe(4);
  });

  it('drops the chimney but keeps the G bit when asked', () => {
    const svg = logo({ chimney: false });
    expect(count(svg, `fill="${BRAND_COLORS.accent}"`)).toBe(1);
    expect(viewBox(svg)[2]).toBeLessThan(viewBox(logo())[2] ?? 0);
  });

  it('uses the brand teal for the app tile and rounds it on request', () => {
    const svg = logo({ palette: TILE_PALETTE, cornerRadius: 0.22 });
    expect(TILE_PALETTE.bg).toBe(BRAND_COLORS.dark);
    const size = viewBox(svg)[2] ?? 0;
    expect(svg).toContain(`rx="${Number((size * 0.22).toFixed(1))}" fill="${TILE_PALETTE.bg}"`);
    expect(logo({ palette: TILE_PALETTE })).not.toMatch(
      /height="[\d.]+" rx="[\d.]+" fill="#195b5c"/,
    );
  });

  it('keeps the whole mark inside the maskable safe zone', () => {
    const box = markBounds();
    const size = viewBox(logo({ safeZone: true }))[2] ?? 0;
    const halfDiagonal = Math.hypot(box.maxX - box.minX, box.maxY - box.minY) / 2;
    expect(halfDiagonal).toBeLessThanOrEqual(size * SAFE_ZONE_RADIUS + 0.1);
    // ...and the padded tile is tighter than the safe-zone one.
    expect(viewBox(logo())[2]).toBeLessThan(size);
  });

  it('pads the content evenly', () => {
    const box = markBounds(false);
    const [x, y, size] = viewBox(logo({ chimney: false, pad: 40 }));
    const longest = Math.max(box.maxX - box.minX, box.maxY - box.minY);
    expect(size).toBeCloseTo(longest + 80, 0);
    expect((x ?? 0) + (size ?? 0) / 2).toBeCloseTo((box.minX + box.maxX) / 2, 0);
    expect((y ?? 0) + (size ?? 0) / 2).toBeCloseTo((box.minY + box.maxY) / 2, 0);
  });
});
