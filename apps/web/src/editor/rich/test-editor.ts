import { TextSelection, type Command } from '@milkdown/kit/prose/state';
import type { EditorView } from '@milkdown/kit/prose/view';
import { createRichEditor, type RichEditor, type RichEditorOptions } from './milkdown-setup';

/** ProseMirror measures the DOM; jsdom has no layout, so these report empty boxes. */
export function installLayoutStubs(): void {
  const emptyRect = () => ({
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    toJSON: () => ({}),
  });
  const emptyRects = () => ({ length: 0, item: () => null, [Symbol.iterator]: function* () {} });
  for (const proto of [Element.prototype, Range.prototype]) {
    Object.defineProperty(proto, 'getClientRects', { value: emptyRects, configurable: true });
    Object.defineProperty(proto, 'getBoundingClientRect', { value: emptyRect, configurable: true });
  }
  if (!document.elementFromPoint) document.elementFromPoint = () => null;
}

installLayoutStubs();

/** A real editor on a fresh root, destroyed after `fn`. */
export async function withRichEditor<T>(
  value: string,
  fn: (editor: RichEditor) => T | Promise<T>,
  options: Partial<RichEditorOptions> = {},
): Promise<T> {
  const root = document.createElement('div');
  document.body.append(root);
  const editor = await createRichEditor({ root, value, attributes: {}, ...options });
  try {
    return await fn(editor);
  } finally {
    await editor.destroy();
    root.remove();
  }
}

export const roundTrip = (value: string): Promise<string> =>
  withRichEditor(value, (editor) => editor.markdown());

export function selectRange(view: EditorView, from: number, to = from): void {
  view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, from, to)));
}

/** Everything from the first to the last text position. */
export const selectAllText = (view: EditorView): void =>
  selectRange(view, 1, view.state.doc.content.size - 1);

/** Select the first occurrence of `text`, or put the cursor at `offset` inside it. */
export function selectText(view: EditorView, text: string, offset?: number): void {
  let found: number | null = null;
  view.state.doc.descendants((node, pos) => {
    if (found !== null) return false;
    const at = node.isText ? (node.text ?? '').indexOf(text) : -1;
    if (at >= 0) found = pos + at;
    return true;
  });
  if (found === null) throw new Error(`"${text}" is not in the document`);
  const start: number = found;
  if (offset === undefined) selectRange(view, start, start + text.length);
  else selectRange(view, start + offset);
}

export const run = (view: EditorView, command: Command): boolean =>
  command(view.state, view.dispatch);
