import { describe, expect, it } from 'vitest';
import { brandG, roundedSquare } from './brand-g';

describe('brandG', () => {
  it('is one open stroke plus a tilted accent bit, centred on the given point', () => {
    const g = brandG(10, 20, 100, '#111111', '#f4b942');
    expect(g.startsWith('<g transform="translate(10 20)">')).toBe(true);
    expect(g.match(/<path /g)).toHaveLength(1);
    expect(g).toContain('fill="none" stroke="#111111" stroke-width="20"');
    expect(g).toContain('stroke-linecap="round"');
    expect(g).toContain('fill="#f4b942" transform="rotate(14');
  });

  it('scales with the requested height', () => {
    expect(brandG(0, 0, 50, '#000', '#fff')).toContain('stroke-width="10"');
  });
});

describe('roundedSquare', () => {
  it('centres the square on (x, y) and rotates around it', () => {
    expect(roundedSquare(50, 50, 20, '#abc', 30)).toBe(
      '<rect x="40" y="40" width="20" height="20" rx="5.6" fill="#abc" transform="rotate(30 50 50)"/>',
    );
  });
});
