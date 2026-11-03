import type { PaletteColor, TextSize } from '@gobbit/shared/rich-text';
import { lift, setBlockType, toggleMark, wrapIn } from '@milkdown/kit/prose/commands';
import { redo, redoDepth, undo, undoDepth } from '@milkdown/kit/prose/history';
import type { Attrs, MarkType, NodeType, ResolvedPos } from '@milkdown/kit/prose/model';
import { liftListItem, wrapInList } from '@milkdown/kit/prose/schema-list';
import type { Command, EditorState } from '@milkdown/kit/prose/state';

/**
 * D290: the toolbar's commands and active-state queries. Plain ProseMirror commands over the
 * schema names of the commonmark preset and our style marks (style-marks.ts), so they run on any
 * editor state, headless tests included.
 */

export const MARKS = {
  bold: 'strong',
  italic: 'emphasis',
  code: 'inlineCode',
  link: 'link',
  underline: 'underline',
  size: 'textSize',
  color: 'textColor',
} as const;

export const NODES = {
  paragraph: 'paragraph',
  heading: 'heading',
  quote: 'blockquote',
  codeBlock: 'code_block',
  bulletList: 'bullet_list',
  orderedList: 'ordered_list',
  listItem: 'list_item',
} as const;

export type SimpleMark = 'bold' | 'italic' | 'code' | 'underline';
export type HeadingLevel = 1 | 2 | 3 | 4;
export type ListKind = 'bulletList' | 'orderedList';

const markType = (state: EditorState, name: string): MarkType => {
  const type = state.schema.marks[name];
  if (!type) throw new Error(`Rich editor schema has no mark "${name}"`);
  return type;
};

const nodeType = (state: EditorState, name: string): NodeType => {
  const type = state.schema.nodes[name];
  if (!type) throw new Error(`Rich editor schema has no node "${name}"`);
  return type;
};

// ── Active state ────────────────────────────────────────────────────────────

/** Attributes of `type` at the selection: the cursor's marks, or the first one in the range. */
export function markAttrs(state: EditorState, name: string): Attrs | null {
  const type = markType(state, name);
  const { empty, from, to, $from } = state.selection;
  if (empty) {
    const mark = type.isInSet(state.storedMarks ?? $from.marks());
    return mark ? mark.attrs : null;
  }
  let found: Attrs | null = null;
  state.doc.nodesBetween(from, to, (node) => {
    if (found) return false;
    const mark = type.isInSet(node.marks);
    if (mark) found = mark.attrs;
    return true;
  });
  return found;
}

export const isMarkActive = (state: EditorState, name: string): boolean => {
  const { empty, from, to, $from } = state.selection;
  const type = markType(state, name);
  if (empty) return Boolean(type.isInSet(state.storedMarks ?? $from.marks()));
  return state.doc.rangeHasMark(from, to, type);
};

export const activeSize = (state: EditorState): TextSize | null =>
  (markAttrs(state, MARKS.size)?.size as TextSize | undefined) ?? null;

export const activeColor = (state: EditorState): PaletteColor | null =>
  (markAttrs(state, MARKS.color)?.color as PaletteColor | undefined) ?? null;

export const activeHref = (state: EditorState): string | null =>
  (markAttrs(state, MARKS.link)?.href as string | undefined) ?? null;

/** Depth of the nearest ancestor of `name` around the selection start, or -1. */
function ancestorDepth($pos: ResolvedPos, name: string): number {
  for (let depth = $pos.depth; depth > 0; depth--) {
    if ($pos.node(depth).type.name === name) return depth;
  }
  return -1;
}

export const headingLevel = (state: EditorState): number | null => {
  const parent = state.selection.$from.parent;
  return parent.type.name === NODES.heading ? (parent.attrs.level as number) : null;
};

export const isBlockActive = (state: EditorState, name: string): boolean =>
  state.selection.$from.parent.type.name === name;

/** The list kind the selection sits in (the innermost list). */
export function activeList(state: EditorState): ListKind | null {
  const item = ancestorDepth(state.selection.$from, NODES.listItem);
  if (item < 1) return null;
  const list = state.selection.$from.node(item - 1).type.name;
  if (list === NODES.bulletList) return 'bulletList';
  if (list === NODES.orderedList) return 'orderedList';
  return null;
}

export const isInQuote = (state: EditorState): boolean =>
  ancestorDepth(state.selection.$from, NODES.quote) > 0;

export const canUndo = (state: EditorState): boolean => undoDepth(state) > 0;
export const canRedo = (state: EditorState): boolean => redoDepth(state) > 0;

// ── Inline commands ─────────────────────────────────────────────────────────

export const toggleSimpleMark =
  (kind: SimpleMark): Command =>
  (state, dispatch) =>
    toggleMark(markType(state, MARKS[kind]))(state, dispatch);

/** Replace `type` on the selection (or the stored marks) with `attrs`, or remove it when null. */
const setMark =
  (name: string, attrs: Attrs | null): Command =>
  (state, dispatch) => {
    const type = markType(state, name);
    const { empty, from, to, $from } = state.selection;
    if (!dispatch) return true;
    const tr = state.tr;
    if (empty) {
      const marks = type.removeFromSet(state.storedMarks ?? $from.marks());
      tr.setStoredMarks(attrs ? type.create(attrs).addToSet(marks) : marks);
    } else {
      tr.removeMark(from, to, type);
      if (attrs) tr.addMark(from, to, type.create(attrs));
    }
    dispatch(tr.scrollIntoView());
    return true;
  };

/** Small/Large: pressing the active size turns it off, the other size replaces it. */
export const toggleSize =
  (size: TextSize): Command =>
  (state, dispatch) =>
    setMark(MARKS.size, activeSize(state) === size ? null : { size })(state, dispatch);

/** `null` is the palette's Default: no colour mark. */
export const setColor =
  (color: PaletteColor | null): Command =>
  (state, dispatch) =>
    setMark(MARKS.color, color ? { color } : null)(state, dispatch);

/** The extent of the link the empty cursor touches, so Apply/Remove act on the whole link. */
function linkRange(state: EditorState): { from: number; to: number } | null {
  const { $from } = state.selection;
  const parent = $from.parent;
  const type = markType(state, MARKS.link);
  const linkAt = (i: number) => type.isInSet(parent.maybeChild(i)?.marks ?? []);
  let index = $from.index();
  let mark = linkAt(index);
  if (!mark && index > 0) mark = linkAt(--index);
  if (!mark) return null;
  let first = index;
  let last = index;
  while (first > 0 && mark.isInSet(parent.child(first - 1).marks)) first--;
  while (last < parent.childCount - 1 && mark.isInSet(parent.child(last + 1).marks)) last++;
  let from = $from.start();
  for (let i = 0; i < first; i++) from += parent.child(i).nodeSize;
  let to = from;
  for (let i = first; i <= last; i++) to += parent.child(i).nodeSize;
  return { from, to };
}

/**
 * Apply `href` to the selection, or to the link the cursor is in. With an empty cursor outside a
 * link the URL itself is inserted as the link text.
 */
export const setLink =
  (href: string): Command =>
  (state, dispatch) => {
    const type = markType(state, MARKS.link);
    const { empty, from, to } = state.selection;
    const range = empty ? linkRange(state) : { from, to };
    if (!dispatch) return true;
    const tr = state.tr;
    const mark = type.create({ href });
    if (range) {
      tr.removeMark(range.from, range.to, type).addMark(range.from, range.to, mark);
    } else {
      tr.insert(from, state.schema.text(href, [mark]));
    }
    dispatch(tr.scrollIntoView());
    return true;
  };

export const removeLink: Command = (state, dispatch) => {
  const { empty, from, to } = state.selection;
  const range = empty ? linkRange(state) : { from, to };
  if (!range) return false;
  if (dispatch) dispatch(state.tr.removeMark(range.from, range.to, markType(state, MARKS.link)));
  return true;
};

// ── Block commands ──────────────────────────────────────────────────────────

const toParagraph: Command = (state, dispatch) =>
  setBlockType(nodeType(state, NODES.paragraph))(state, dispatch);

export const setParagraph: Command = toParagraph;

/** Pressing the active heading level turns the block back into a paragraph. */
export const toggleHeading =
  (level: HeadingLevel): Command =>
  (state, dispatch) =>
    headingLevel(state) === level
      ? toParagraph(state, dispatch)
      : setBlockType(nodeType(state, NODES.heading), { level })(state, dispatch);

export const toggleCodeBlock: Command = (state, dispatch) =>
  isBlockActive(state, NODES.codeBlock)
    ? toParagraph(state, dispatch)
    : setBlockType(nodeType(state, NODES.codeBlock))(state, dispatch);

export const toggleQuote: Command = (state, dispatch) =>
  isInQuote(state) ? lift(state, dispatch) : wrapIn(nodeType(state, NODES.quote))(state, dispatch);

/** Same kind lifts the items out; the other kind switches the list's type in place. */
export const toggleList =
  (kind: ListKind): Command =>
  (state, dispatch) => {
    const current = activeList(state);
    const target = nodeType(state, NODES[kind]);
    if (current === kind) return liftListItem(nodeType(state, NODES.listItem))(state, dispatch);
    if (current) {
      const { $from } = state.selection;
      const listDepth = ancestorDepth($from, NODES.listItem) - 1;
      if (dispatch) dispatch(state.tr.setNodeMarkup($from.before(listDepth), target));
      return true;
    }
    return wrapInList(target)(state, dispatch);
  };

// ── Clear and history ───────────────────────────────────────────────────────

/**
 * Removes every inline style in the selection (or the stored marks at the cursor) and turns
 * headings and code blocks back into paragraphs. Lists and quotes are structure, not formatting,
 * and stay.
 */
export const clearFormatting: Command = (state, dispatch) => {
  if (!dispatch) return true;
  const { empty, from, to } = state.selection;
  const tr = state.tr;
  if (empty) tr.setStoredMarks([]);
  else tr.removeMark(from, to);
  tr.setBlockType(from, to, nodeType(state, NODES.paragraph));
  dispatch(tr.scrollIntoView());
  return true;
};

export const undoCommand: Command = undo;
export const redoCommand: Command = redo;
