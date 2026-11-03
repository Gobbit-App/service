import {
  COLOR,
  COLOR_CLASS,
  UNDERLINE,
  colorClass,
  isPaletteColor,
  isTextSize,
  sizeClass,
  type PaletteColor,
  type TextSize,
} from '@gobbit/shared/rich-text';
import { $markSchema } from '@milkdown/kit/utils';

/**
 * D286: the three style marks of the body grammar (D282). Each one parses from a normalised
 * `textDirective` and serialises back to one, so the editor writes exactly what the reader and
 * the public pages render. From pasted HTML they parse only from `<u>` and our own `rt-*` classes
 * (FR-011).
 */

interface DirectiveLike {
  type: string;
  name?: string;
  attributes?: Record<string, string | null | undefined> | null;
  children?: unknown[];
}

const isDirective = (node: unknown, name: (n: string) => boolean): boolean => {
  const d = node as DirectiveLike;
  return d.type === 'textDirective' && typeof d.name === 'string' && name(d.name);
};

/** The one palette class on a pasted `span`, if any. */
function pastedColor(dom: HTMLElement): PaletteColor | null {
  for (const cls of dom.classList) {
    const name = cls.startsWith(`${COLOR_CLASS}--`) ? cls.slice(COLOR_CLASS.length + 2) : '';
    if (isPaletteColor(name)) return name;
  }
  return null;
}

function pastedSize(dom: HTMLElement): TextSize | null {
  if (dom.classList.contains(sizeClass('small'))) return 'small';
  if (dom.classList.contains(sizeClass('large'))) return 'large';
  return null;
}

export const underlineSchema = $markSchema('underline', () => ({
  parseDOM: [{ tag: 'u' }],
  toDOM: () => ['u', 0],
  parseMarkdown: {
    match: (node) => isDirective(node, (n) => n === UNDERLINE),
    runner: (state, node, markType) => {
      state.openMark(markType);
      state.next(node.children);
      state.closeMark(markType);
    },
  },
  toMarkdown: {
    match: (mark) => mark.type.name === 'underline',
    runner: (state, mark) => {
      state.withMark(mark, 'textDirective', undefined, { name: UNDERLINE });
    },
  },
}));

export const textSizeSchema = $markSchema('textSize', () => ({
  attrs: { size: { default: 'small', validate: 'string' } },
  parseDOM: [
    {
      tag: 'span',
      getAttrs: (dom) => {
        const size = dom instanceof HTMLElement ? pastedSize(dom) : null;
        return size ? { size } : false;
      },
    },
  ],
  toDOM: (mark) => ['span', { class: sizeClass(mark.attrs.size as TextSize) }, 0],
  parseMarkdown: {
    match: (node) => isDirective(node, isTextSize),
    runner: (state, node, markType) => {
      state.openMark(markType, { size: (node as DirectiveLike).name });
      state.next(node.children);
      state.closeMark(markType);
    },
  },
  toMarkdown: {
    match: (mark) => mark.type.name === 'textSize',
    runner: (state, mark) => {
      state.withMark(mark, 'textDirective', undefined, { name: mark.attrs.size as string });
    },
  },
}));

export const textColorSchema = $markSchema('textColor', () => ({
  attrs: { color: { validate: 'string' } },
  parseDOM: [
    {
      tag: 'span',
      getAttrs: (dom) => {
        const color = dom instanceof HTMLElement ? pastedColor(dom) : null;
        return color ? { color } : false;
      },
    },
  ],
  toDOM: (mark) => [
    'span',
    { class: `${COLOR_CLASS} ${colorClass(mark.attrs.color as PaletteColor)}` },
    0,
  ],
  parseMarkdown: {
    // The normaliser keeps only `:color` with exactly one palette class (D284).
    match: (node) => isDirective(node, (n) => n === COLOR),
    runner: (state, node, markType) => {
      const color = (node as DirectiveLike).attributes?.class ?? '';
      state.openMark(markType, { color });
      state.next(node.children);
      state.closeMark(markType);
    },
  },
  toMarkdown: {
    match: (mark) => mark.type.name === 'textColor',
    runner: (state, mark) => {
      state.withMark(mark, 'textDirective', undefined, {
        name: COLOR,
        attributes: { class: mark.attrs.color as string },
      });
    },
  },
}));

export const styleMarks = [underlineSchema, textSizeSchema, textColorSchema].flat();
