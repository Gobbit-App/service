import { describe, expect, it } from 'vitest';
import { ICON_MONOGRAM, STATIC_ICONS, iconTree } from './icon-template';

describe('iconTree', () => {
  it('renders the monogram at the requested size', () => {
    const tree = iconTree(192);
    expect(tree.props.children).toBe(ICON_MONOGRAM);
    expect(tree.props.style).toMatchObject({ width: 192, height: 192 });
    expect(tree.props.style?.borderRadius).toBeGreaterThan(0);
  });

  it('makes the maskable variant full-bleed with a smaller glyph', () => {
    const any = iconTree(512).props.style ?? {};
    const maskable = iconTree(512, 'maskable').props.style ?? {};
    expect(maskable.borderRadius).toBe(0);
    expect(Number(maskable.fontSize)).toBeLessThan(Number(any.fontSize));
    // The glyph must stay inside the 80% safe zone.
    expect(Number(maskable.fontSize)).toBeLessThanOrEqual(512 * 0.8);
  });

  it('lists the icons the manifest references', () => {
    expect(STATIC_ICONS.map((i) => i.file)).toEqual([
      'icons/icon-192.png',
      'icons/icon-512.png',
      'icons/icon-maskable-512.png',
    ]);
  });
});
