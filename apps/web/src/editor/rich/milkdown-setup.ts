import { remarkNormalizeStyles } from '@gobbit/shared/rich-text';
import {
  Editor,
  defaultValueCtx,
  editorViewCtx,
  editorViewOptionsCtx,
  parserCtx,
  remarkStringifyOptionsCtx,
  rootCtx,
  serializerCtx,
} from '@milkdown/kit/core';
import type { Ctx } from '@milkdown/kit/ctx';
import { history } from '@milkdown/kit/plugin/history';
import { commonmark, hardbreakFilterNodes } from '@milkdown/kit/preset/commonmark';
import { toggleMark } from '@milkdown/kit/prose/commands';
import { Fragment, Slice, type Node as ProseNode } from '@milkdown/kit/prose/model';
import { EditorState, Plugin } from '@milkdown/kit/prose/state';
import type { EditorView } from '@milkdown/kit/prose/view';
import { $prose, $remark, $useKeymap } from '@milkdown/kit/utils';
import remarkDirective from 'remark-directive';
import { unescapeHarmlessColons } from './colon-escapes';
import { styleMarks, underlineSchema } from './style-marks';

/**
 * D286: the body editor. CommonMark + history, the body grammar's directives (D282) through the
 * shared normaliser, our three style marks, and a line break written back as a plain newline
 * (D283). No listener plugin: the document is serialised on every change so a save right after
 * typing never misses the last keystroke.
 */

interface MdNode {
  type: string;
  data?: Record<string, unknown>;
  children?: MdNode[];
}

/**
 * Milkdown reads a single newline as a soft (inline) break; the body grammar shows it as a line
 * break everywhere (remark-breaks, D283), so every break becomes a real one.
 */
function remarkHardBreaks() {
  const visit = (node: MdNode): void => {
    if (node.type === 'break' && node.data) delete node.data.isInline;
    node.children?.forEach(visit);
  };
  return (tree: unknown): void => visit(tree as MdNode);
}

const directive = $remark('remarkDirective', () => remarkDirective);
const normalizeStyles = $remark('remarkNormalizeStyles', () => remarkNormalizeStyles);
const hardBreaks = $remark('remarkHardBreaks', () => remarkHardBreaks);

const underlineKeymap = $useKeymap('underlineKeymap', {
  ToggleUnderline: {
    shortcuts: 'Mod-u',
    command: (ctx) => toggleMark(underlineSchema.type(ctx)),
  },
});

/**
 * FR-011: a paste keeps only what the body grammar stores. Raw HTML is never stored (a pasted
 * `html` node becomes its text) and bodies have no images (spec: out of scope), so a pasted image
 * becomes its alt text.
 */
export function plainPaste(fragment: Fragment): Fragment {
  const nodes: ProseNode[] = [];
  fragment.forEach((node) => {
    const name = node.type.name;
    if (name === 'html' || name === 'image') {
      const text = String((name === 'html' ? node.attrs.value : node.attrs.alt) ?? '');
      if (text) nodes.push(node.type.schema.text(text, node.marks));
    } else {
      nodes.push(node.copy(plainPaste(node.content)));
    }
  });
  return Fragment.from(nodes);
}

const pasteFilter = $prose(
  () =>
    new Plugin({
      props: {
        transformPasted: (slice) =>
          new Slice(plainPaste(slice.content), slice.openStart, slice.openEnd),
      },
    }),
);

export interface RichEditorOptions {
  root: HTMLElement;
  value: string;
  /** Attributes on the editable element (name, description, invalid). */
  attributes: Record<string, string>;
  /** Serialised Markdown after every document change. */
  onMarkdown?: (markdown: string) => void;
  /** Every new state (selection or document), for the toolbar. */
  onState?: (state: EditorState) => void;
  isEditable?: () => boolean;
}

export interface RichEditor {
  view: EditorView;
  /** The current document as Markdown. */
  markdown: () => string;
  /** Replace the whole document (a restored draft) without reporting it as an edit; clears history. */
  replace: (markdown: string) => void;
  /** Re-read `isEditable`. */
  refresh: () => void;
  destroy: () => Promise<void>;
}

/** The stored body never ends in the serializer's closing newline. */
const serialize = (ctx: Ctx, doc: ProseNode): string =>
  ctx.get(serializerCtx)(doc).replace(/\n+$/, '');

/** While true, document changes are not reported (see `replace`). */
interface Silence {
  on: boolean;
}

const stateObserver = (options: RichEditorOptions, silence: Silence) =>
  $prose((ctx) => {
    return new Plugin({
      view: () => ({
        update: (view, prev) => {
          options.onState?.(view.state);
          if (!silence.on && !view.state.doc.eq(prev.doc))
            options.onMarkdown?.(serialize(ctx, view.state.doc));
        },
      }),
    });
  });

/** The plugin list, shared by the browser editor and the headless round-trip tests. */
export function editorPlugins(options?: RichEditorOptions, silence: Silence = { on: false }) {
  return [
    commonmark,
    history,
    directive,
    normalizeStyles,
    hardBreaks,
    styleMarks,
    underlineKeymap,
    pasteFilter,
    options ? stateObserver(options, silence) : [],
  ].flat();
}

/** Grammar settings every editor instance needs (D283, contract §5). */
export function configureGrammar(editor: Editor): Editor {
  return editor.config((ctx) => {
    ctx.update(remarkStringifyOptionsCtx, (o) => {
      const text = o.handlers?.text;
      return {
        ...o,
        bullet: '-' as const,
        handlers: {
          ...o.handlers,
          break: () => '\n',
          ...(text && {
            text: (...args: Parameters<typeof text>) => unescapeHarmlessColons(text(...args)),
          }),
        },
      };
    });
    // A heading is one line: Shift+Enter there does nothing rather than splitting it.
    ctx.update(hardbreakFilterNodes.key, (nodes) => [...nodes, 'heading']);
  });
}

export async function createRichEditor(options: RichEditorOptions): Promise<RichEditor> {
  const editor = configureGrammar(
    Editor.make().config((ctx) => {
      ctx.set(rootCtx, options.root);
      ctx.set(defaultValueCtx, options.value);
      ctx.update(editorViewOptionsCtx, (o) => ({
        ...o,
        attributes: options.attributes,
        editable: () => options.isEditable?.() ?? true,
      }));
    }),
  );
  const silence: Silence = { on: false };
  for (const plugin of editorPlugins(options, silence)) editor.use(plugin);
  await editor.create();
  const view = editor.ctx.get(editorViewCtx);
  options.onState?.(view.state);
  return {
    view,
    markdown: () => serialize(editor.ctx, view.state.doc),
    replace: (markdown) => {
      const doc = editor.ctx.get(parserCtx)(markdown);
      silence.on = true;
      try {
        view.updateState(EditorState.create({ doc, plugins: view.state.plugins }));
      } finally {
        silence.on = false;
      }
    },
    refresh: () => view.setProps({}),
    destroy: async () => {
      await editor.destroy();
    },
  };
}
