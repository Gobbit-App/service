import type { Command, EditorState } from '@milkdown/kit/prose/state';
import type { IconName } from '../../ui/icons/icon-paths';
import {
  NODES,
  activeColor,
  activeHref,
  activeList,
  activeSize,
  canRedo,
  canUndo,
  clearFormatting,
  headingLevel,
  isBlockActive,
  isInQuote,
  isMarkActive,
  MARKS,
  redoCommand,
  setParagraph,
  toggleCodeBlock,
  toggleHeading,
  toggleList,
  toggleQuote,
  toggleSimpleMark,
  toggleSize,
  undoCommand,
  type HeadingLevel,
} from './commands';

/**
 * D290 / FR-008: the toolbar's buttons, in order and in groups. A button either runs a command
 * or opens one of the two panels (colour, link).
 */

export type Panel = 'color' | 'link';

export interface ToolbarItem {
  key: string;
  icon: IconName;
  label: string;
  /** Keyboard shortcut for the tooltip, `Mod` = Ctrl or Cmd. */
  shortcut?: string;
  pressed: (state: EditorState) => boolean;
  command?: Command;
  panel?: Panel;
  /** Why it can't run now (undo with no history). */
  unavailable?: (state: EditorState) => string | null;
}

export interface ToolbarGroup {
  label: string;
  items: ToolbarItem[];
}

const heading = (level: HeadingLevel): ToolbarItem => ({
  key: `h${level}`,
  icon: `heading-${level}`,
  label: `Heading ${level}`,
  pressed: (s) => headingLevel(s) === level,
  command: toggleHeading(level),
});

export const TOOLBAR_GROUPS: ToolbarGroup[] = [
  {
    label: 'Text style',
    items: [
      {
        key: 'bold',
        icon: 'bold',
        label: 'Bold',
        shortcut: 'Mod+B',
        pressed: (s) => isMarkActive(s, MARKS.bold),
        command: toggleSimpleMark('bold'),
      },
      {
        key: 'italic',
        icon: 'italic',
        label: 'Italic',
        shortcut: 'Mod+I',
        pressed: (s) => isMarkActive(s, MARKS.italic),
        command: toggleSimpleMark('italic'),
      },
      {
        key: 'underline',
        icon: 'underline',
        label: 'Underline',
        shortcut: 'Mod+U',
        pressed: (s) => isMarkActive(s, MARKS.underline),
        command: toggleSimpleMark('underline'),
      },
      {
        key: 'small',
        icon: 'text-small',
        label: 'Small text',
        pressed: (s) => activeSize(s) === 'small',
        command: toggleSize('small'),
      },
      {
        key: 'large',
        icon: 'text-large',
        label: 'Large text',
        pressed: (s) => activeSize(s) === 'large',
        command: toggleSize('large'),
      },
      {
        key: 'code',
        icon: 'code',
        label: 'Inline code',
        shortcut: 'Mod+E',
        pressed: (s) => isMarkActive(s, MARKS.code),
        command: toggleSimpleMark('code'),
      },
      {
        key: 'color',
        icon: 'text-color',
        label: 'Text colour',
        pressed: (s) => activeColor(s) !== null,
        panel: 'color',
      },
      {
        key: 'link',
        icon: 'link',
        label: 'Link',
        pressed: (s) => activeHref(s) !== null,
        panel: 'link',
      },
    ],
  },
  {
    label: 'Blocks',
    items: [
      heading(1),
      heading(2),
      heading(3),
      heading(4),
      {
        key: 'paragraph',
        icon: 'paragraph',
        label: 'Body text',
        pressed: (s) => isBlockActive(s, NODES.paragraph),
        command: setParagraph,
      },
      {
        key: 'bullet',
        icon: 'list',
        label: 'Bulleted list',
        pressed: (s) => activeList(s) === 'bulletList',
        command: toggleList('bulletList'),
      },
      {
        key: 'ordered',
        icon: 'list-ordered',
        label: 'Numbered list',
        pressed: (s) => activeList(s) === 'orderedList',
        command: toggleList('orderedList'),
      },
      {
        key: 'quote',
        icon: 'quote',
        label: 'Quote',
        pressed: isInQuote,
        command: toggleQuote,
      },
      {
        key: 'code-block',
        icon: 'code-block',
        label: 'Code block',
        pressed: (s) => isBlockActive(s, NODES.codeBlock),
        command: toggleCodeBlock,
      },
    ],
  },
  {
    label: 'History',
    items: [
      {
        key: 'undo',
        icon: 'undo',
        label: 'Undo',
        shortcut: 'Mod+Z',
        pressed: () => false,
        command: undoCommand,
        unavailable: (s) => (canUndo(s) ? null : 'Nothing to undo'),
      },
      {
        key: 'redo',
        icon: 'redo',
        label: 'Redo',
        shortcut: 'Shift+Mod+Z',
        pressed: () => false,
        command: redoCommand,
        unavailable: (s) => (canRedo(s) ? null : 'Nothing to redo'),
      },
    ],
  },
  {
    label: 'Clear',
    items: [
      {
        key: 'clear',
        icon: 'clear-format',
        label: 'Clear formatting',
        pressed: () => false,
        command: clearFormatting,
      },
    ],
  },
];

/** Undo/redo and clear are actions, not toggles: no `aria-pressed`. */
export const isToggle = (item: ToolbarItem): boolean =>
  !['undo', 'redo', 'clear'].includes(item.key);

const isMac = (): boolean =>
  typeof navigator !== 'undefined' &&
  /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

export function shortcutText(shortcut: string, mac = isMac()): string {
  return shortcut.replace('Mod', mac ? 'Cmd' : 'Ctrl');
}
