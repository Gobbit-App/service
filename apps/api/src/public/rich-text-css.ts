import {
  FLOW_CLASS,
  FLOW_SPACING,
  PALETTE,
  PALETTE_COLORS,
  colorClass,
  sizeClass,
} from '@gobbit/shared/rich-text';

/**
 * 038 (D287): card-body style rules for public pages, built from the shared palette so the hexes
 * cannot drift from the app's `cards/rich-text.css` (palette test).
 */
function vars(theme: 'light' | 'dark'): string {
  return PALETTE_COLORS.map((name) => `--rt-${name}:${PALETTE[name][theme]}`).join(';');
}

const HEADINGS = ':is(h1,h2,h3,h4,h5,h6)';

/** Body rhythm, the same rules as the app's `cards/rich-text.css`: each block owns the space above it. */
function flow(): string[] {
  const f = `.${FLOW_CLASS}`;
  return [
    `${f}>*,${f} li>*{margin-block:0}`,
    `${f}>*+*{margin-top:${FLOW_SPACING.block}}`,
    `${f}>*+${HEADINGS}{margin-top:${FLOW_SPACING.beforeHeading}}`,
    `${f}>${HEADINGS}+*{margin-top:${FLOW_SPACING.afterHeading}}`,
    `${f} li+li,${f} li>*+*{margin-top:${FLOW_SPACING.item}}`,
  ];
}

export const RICH_TEXT_CSS = [
  `:root{${vars('light')}}`,
  `@media (prefers-color-scheme:dark){:root{${vars('dark')}}}`,
  `.${sizeClass('small')}{font-size:.85em}`,
  `.${sizeClass('large')}{font-size:1.25em;line-height:1.3}`,
  ...PALETTE_COLORS.map((name) => `.${colorClass(name)}{color:var(--rt-${name})}`),
  ...flow(),
].join('');
