import { describe, expect, it } from 'vitest';
import {
  activeColor,
  activeHref,
  activeList,
  activeSize,
  canRedo,
  canUndo,
  clearFormatting,
  headingLevel,
  isInQuote,
  isMarkActive,
  redoCommand,
  removeLink,
  setColor,
  setLink,
  setParagraph,
  toggleCodeBlock,
  toggleHeading,
  toggleList,
  toggleQuote,
  toggleSimpleMark,
  toggleSize,
  undoCommand,
} from './commands';
import { run, selectAllText, selectText, withRichEditor } from './test-editor';

const md = (markdown: string) => markdown.replace(/\n+$/, '');

describe('rich editor commands (D290)', () => {
  it('toggles bold, italic, underline and code on a selection', async () => {
    await withRichEditor('one two', ({ view, markdown }) => {
      selectText(view, 'two');
      run(view, toggleSimpleMark('bold'));
      expect(isMarkActive(view.state, 'strong')).toBe(true);
      run(view, toggleSimpleMark('underline'));
      expect(md(markdown())).toBe('one **:u[two]**');
      run(view, toggleSimpleMark('bold'));
      run(view, toggleSimpleMark('underline'));
      expect(md(markdown())).toBe('one two');
      run(view, toggleSimpleMark('code'));
      expect(md(markdown())).toBe('one `two`');
    });
  });

  it('switches between sizes and turns the active size off', async () => {
    await withRichEditor('big', ({ view, markdown }) => {
      selectText(view, 'big');
      run(view, toggleSize('small'));
      expect(activeSize(view.state)).toBe('small');
      run(view, toggleSize('large'));
      expect(md(markdown())).toBe(':large[big]');
      run(view, toggleSize('large'));
      expect(activeSize(view.state)).toBeNull();
      expect(md(markdown())).toBe('big');
    });
  });

  it('sets a palette colour and Default removes it', async () => {
    await withRichEditor('nuts', ({ view, markdown }) => {
      selectText(view, 'nuts');
      run(view, setColor('red'));
      expect(activeColor(view.state)).toBe('red');
      run(view, setColor('blue'));
      expect(md(markdown())).toBe(':color[nuts]{.blue}');
      run(view, setColor(null));
      expect(md(markdown())).toBe('nuts');
    });
  });

  it('applies a mark to the cursor as a stored mark', async () => {
    await withRichEditor('ab', ({ view, markdown }) => {
      selectText(view, 'ab', 1);
      run(view, setColor('green'));
      expect(activeColor(view.state)).toBe('green');
      view.dispatch(view.state.tr.insertText('X'));
      expect(md(markdown())).toBe('a:color[X]{.green}b');
    });
  });

  it('adds, edits from the cursor and removes a link', async () => {
    await withRichEditor('see docs here', ({ view, markdown }) => {
      selectText(view, 'docs');
      run(view, setLink('https://a.example'));
      expect(md(markdown())).toBe('see [docs](https://a.example) here');
      selectText(view, 'docs', 2);
      expect(activeHref(view.state)).toBe('https://a.example');
      run(view, setLink('https://b.example'));
      expect(md(markdown())).toBe('see [docs](https://b.example) here');
      selectText(view, 'docs', 4);
      expect(run(view, removeLink)).toBe(true);
      expect(md(markdown())).toBe('see docs here');
    });
  });

  it('inserts the URL as text when the cursor is outside a link', async () => {
    await withRichEditor('go ', ({ view, markdown }) => {
      selectText(view, 'go', 2);
      run(view, setLink('https://x.example'));
      // A link whose text is its URL serialises as an autolink.
      expect(md(markdown())).toBe('go<https://x.example>');
      selectText(view, 'go', 1);
      expect(run(view, removeLink)).toBe(false);
    });
  });

  it('toggles headings and goes back to a paragraph', async () => {
    await withRichEditor('Title', ({ view, markdown }) => {
      selectText(view, 'Title', 0);
      run(view, toggleHeading(2));
      expect(headingLevel(view.state)).toBe(2);
      expect(md(markdown())).toBe('## Title');
      run(view, toggleHeading(4));
      expect(md(markdown())).toBe('#### Title');
      run(view, toggleHeading(4));
      expect(headingLevel(view.state)).toBeNull();
      run(view, toggleHeading(1));
      run(view, setParagraph);
      expect(md(markdown())).toBe('Title');
    });
  });

  it('wraps, switches and lifts lists', async () => {
    await withRichEditor('item', ({ view, markdown }) => {
      selectText(view, 'item', 0);
      run(view, toggleList('bulletList'));
      expect(activeList(view.state)).toBe('bulletList');
      expect(md(markdown())).toBe('- item');
      run(view, toggleList('orderedList'));
      expect(activeList(view.state)).toBe('orderedList');
      expect(md(markdown())).toBe('1. item');
      run(view, toggleList('orderedList'));
      expect(activeList(view.state)).toBeNull();
      expect(md(markdown())).toBe('item');
    });
  });

  it('toggles a quote and a code block', async () => {
    await withRichEditor('text', ({ view, markdown }) => {
      selectText(view, 'text', 0);
      run(view, toggleQuote);
      expect(isInQuote(view.state)).toBe(true);
      expect(md(markdown())).toBe('> text');
      run(view, toggleQuote);
      expect(md(markdown())).toBe('text');
      run(view, toggleCodeBlock);
      expect(md(markdown())).toBe('```\ntext\n```');
      run(view, toggleCodeBlock);
      expect(md(markdown())).toBe('text');
    });
  });

  it('clears inline styles and headings, keeping lists', async () => {
    await withRichEditor('# **Big** :color[red]{.red}\n\n- :u[keep] list', ({ view, markdown }) => {
      selectAllText(view);
      run(view, clearFormatting);
      expect(md(markdown())).toBe('Big red\n\n- keep list');
    });
  });

  it('tracks undo and redo depth', async () => {
    await withRichEditor('a', ({ view, markdown }) => {
      expect(canUndo(view.state)).toBe(false);
      selectText(view, 'a');
      run(view, toggleSimpleMark('italic'));
      expect(canUndo(view.state)).toBe(true);
      run(view, undoCommand);
      expect(md(markdown())).toBe('a');
      expect(canRedo(view.state)).toBe(true);
      run(view, redoCommand);
      expect(md(markdown())).toBe('*a*');
    });
  });
});
