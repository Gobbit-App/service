import { describe, expect, it } from 'vitest';
import { DIRECTIONAL, FILLABLE, ICON_PATHS, type IconName } from './icon-paths';

const names = Object.keys(ICON_PATHS) as IconName[];

describe('icon set (D210)', () => {
  it('has at least 25 icons, each with path data', () => {
    expect(names.length).toBeGreaterThanOrEqual(25);
    for (const name of names) expect(ICON_PATHS[name].trim(), name).not.toBe('');
  });

  it('uses absolute commands only, so every coordinate is on the 24 px grid', () => {
    for (const name of names) {
      const d = ICON_PATHS[name];
      expect(d, name).not.toMatch(/[mlhvcsqtaz]/);
      const numbers = d.match(/-?\d*\.?\d+/g)?.map(Number) ?? [];
      for (const n of numbers) {
        expect(n, `${name}: ${n}`).toBeGreaterThanOrEqual(0);
        expect(n, `${name}: ${n}`).toBeLessThanOrEqual(24);
      }
    }
  });

  it('only marks known icons as fillable or directional', () => {
    for (const name of [...FILLABLE, ...DIRECTIONAL]) expect(names).toContain(name);
    expect(DIRECTIONAL.has('edit')).toBe(false);
  });
});
