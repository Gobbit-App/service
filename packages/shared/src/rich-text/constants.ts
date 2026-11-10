/**
 * D282/D287: the card-body style vocabulary. Bodies are CommonMark plus these generic text
 * directives; the reader, the public pages and the editor all read this one list.
 */

/** `:u[text]` → underline. */
export const UNDERLINE = 'u';
/** `:color[text]{.red}` → one palette colour (class shorthand). */
export const COLOR = 'color';

export const TEXT_SIZES = ['small', 'large'] as const;
export type TextSize = (typeof TEXT_SIZES)[number];

/** Light values meet ≥ 4.5:1 on #ffffff, dark values on #1a2629 (the card surfaces, D272). */
export const PALETTE = {
  red: { light: '#b42318', dark: '#fda29b' },
  orange: { light: '#b54708', dark: '#fdb022' },
  green: { light: '#067647', dark: '#75e0a7' },
  blue: { light: '#175cd3', dark: '#84caff' },
  purple: { light: '#6941c6', dark: '#bdb4fe' },
  grey: { light: '#475467', dark: '#cdd5df' },
} as const;
export type PaletteColor = keyof typeof PALETTE;
export const PALETTE_COLORS = Object.keys(PALETTE) as PaletteColor[];

/** The card surfaces the palette is checked against. */
export const CARD_SURFACE = { light: '#ffffff', dark: '#1a2629' } as const;

export const STYLE_NAMES = [UNDERLINE, ...TEXT_SIZES, COLOR] as const;
export type StyleName = (typeof STYLE_NAMES)[number];

export function isTextSize(name: string): name is TextSize {
  return (TEXT_SIZES as readonly string[]).includes(name);
}

export function isPaletteColor(name: string): name is PaletteColor {
  return Object.hasOwn(PALETTE, name);
}

/** HTML classes the renderers emit (and sanitizers allow). */
export const sizeClass = (size: TextSize): string => `rt-${size}`;
export const COLOR_CLASS = 'rt-color';
export const colorClass = (color: PaletteColor): string => `rt-color--${color}`;
/**
 * Vertical rhythm of a card body, shared by the reader, the editor and the public pages. Each
 * block owns only the space above it; values are `em` of the element they sit on.
 */
export const FLOW_CLASS = 'rt-flow';
export const FLOW_SPACING = {
  /** Between sibling blocks (paragraphs, lists, quotes, code, tables). */
  block: '0.75em',
  /** Above a heading that follows other content. */
  beforeHeading: '1.4em',
  /** Between a heading and what follows it. */
  afterHeading: '0.4em',
  /** Between list items, and between blocks inside one item. */
  item: '0.3em',
} as const;

export const RICH_TEXT_CLASSES: readonly string[] = [
  ...TEXT_SIZES.map(sizeClass),
  COLOR_CLASS,
  ...PALETTE_COLORS.map(colorClass),
];
