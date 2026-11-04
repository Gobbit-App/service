import { PALETTE, PALETTE_COLORS, colorClass, sizeClass } from '@gobbit/shared/rich-text';

/**
 * 038 (D287): card-body style rules for public pages, built from the shared palette so the hexes
 * cannot drift from the app's `cards/rich-text.css` (palette test).
 */
function vars(theme: 'light' | 'dark'): string {
  return PALETTE_COLORS.map((name) => `--rt-${name}:${PALETTE[name][theme]}`).join(';');
}

export const RICH_TEXT_CSS = [
  `:root{${vars('light')}}`,
  `@media (prefers-color-scheme:dark){:root{${vars('dark')}}}`,
  `.${sizeClass('small')}{font-size:.85em}`,
  `.${sizeClass('large')}{font-size:1.25em;line-height:1.3}`,
  ...PALETTE_COLORS.map((name) => `.${colorClass(name)}{color:var(--rt-${name})}`),
].join('');
