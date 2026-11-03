import { PALETTE, PALETTE_COLORS } from '@gobbit/shared/rich-text';
import { describe, expect, it } from 'vitest';
import { RICH_TEXT_CSS } from './rich-text-css';
import { PUBLIC_PAGE_CSS } from './styles';

describe('public rich-text CSS (FR-007)', () => {
  it('is part of the public stylesheet', () => {
    expect(PUBLIC_PAGE_CSS.endsWith(RICH_TEXT_CSS)).toBe(true);
  });

  it.each(PALETTE_COLORS)('%s carries the shared light and dark values', (name) => {
    const [light, dark] = RICH_TEXT_CSS.split('@media (prefers-color-scheme:dark)');
    expect(light).toContain(`--rt-${name}:${PALETTE[name].light}`);
    expect(dark).toContain(`--rt-${name}:${PALETTE[name].dark}`);
    expect(RICH_TEXT_CSS).toContain(`.rt-color--${name}{color:var(--rt-${name})}`);
  });

  it('sizes small and large text', () => {
    expect(RICH_TEXT_CSS).toContain('.rt-small{font-size:.85em}');
    expect(RICH_TEXT_CSS).toContain('.rt-large{font-size:1.25em;line-height:1.3}');
  });
});
