import { fireEvent, render, screen, within } from '@testing-library/react';
import type { EditorState } from '@milkdown/kit/prose/state';
import { describe, expect, it, vi } from 'vitest';
import { FormatToolbar } from './FormatToolbar';
import { selectText, withRichEditor } from './test-editor';
import { TOOLBAR_GROUPS } from './toolbar-items';

/** The editor state with `text` selected (or the cursor at its start). */
const stateAt = (markdown: string, text: string): Promise<EditorState> =>
  withRichEditor(markdown, ({ view }) => {
    selectText(view, text);
    return view.state;
  });

function renderToolbar(state: EditorState, { disabled = false, dir = 'ltr' } = {}) {
  const run = vi.fn();
  const focusEditor = vi.fn();
  render(
    <div dir={dir}>
      <FormatToolbar
        state={state}
        run={run}
        focusEditor={focusEditor}
        controls="body"
        disabled={disabled}
      />
    </div>,
  );
  return { run, focusEditor, toolbar: screen.getByRole('toolbar', { name: 'Formatting' }) };
}

const button = (name: string) => screen.getByRole('button', { name });

describe('FormatToolbar (D290, FR-008–FR-009)', () => {
  it('names every button and groups them', async () => {
    const { toolbar } = renderToolbar(await stateAt('Hello', 'Hello'));
    for (const group of TOOLBAR_GROUPS) {
      const region = within(toolbar).getByRole('group', { name: group.label });
      for (const item of group.items)
        expect(within(region).getByRole('button', { name: item.label })).toBeInTheDocument();
    }
  });

  it('shows which styles the selection has', async () => {
    renderToolbar(await stateAt('Call **Sam** now', 'Sam'));
    expect(button('Bold')).toHaveAttribute('aria-pressed', 'true');
    expect(button('Italic')).toHaveAttribute('aria-pressed', 'false');
    expect(button('Body text')).toHaveAttribute('aria-pressed', 'true');
    expect(button('Undo')).not.toHaveAttribute('aria-pressed');
  });

  it('shows heading and colour state', async () => {
    renderToolbar(await stateAt('## A :color[red]{.red} word', 'red'));
    expect(button('Heading 2')).toHaveAttribute('aria-pressed', 'true');
    expect(button('Text colour')).toHaveAttribute('aria-pressed', 'true');
  });

  it('says why undo and redo are unavailable with no history', async () => {
    renderToolbar(await stateAt('Hello', 'Hello'));
    expect(button('Undo')).toHaveAttribute('aria-disabled', 'true');
    expect(button('Undo')).toHaveAttribute('data-tip', expect.stringContaining('Nothing to undo'));
    expect(button('Redo')).toHaveAttribute('aria-disabled', 'true');
  });

  it('runs a command on click', async () => {
    const { run } = renderToolbar(await stateAt('Hello', 'Hello'));
    fireEvent.click(button('Italic'));
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('does nothing while disabled', async () => {
    const { run } = renderToolbar(await stateAt('Hello', 'Hello'), { disabled: true });
    expect(button('Bold')).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(button('Bold'));
    expect(run).not.toHaveBeenCalled();
  });

  it('is one tab stop with arrow, Home and End focus', async () => {
    const { toolbar } = renderToolbar(await stateAt('Hello', 'Hello'));
    const tabbable = within(toolbar)
      .getAllByRole('button')
      .filter((b) => b.tabIndex === 0);
    expect(tabbable).toEqual([button('Bold')]);

    button('Bold').focus();
    fireEvent.keyDown(toolbar, { key: 'ArrowRight' });
    expect(button('Italic')).toHaveFocus();
    expect(button('Italic')).toHaveAttribute('tabindex', '0');
    fireEvent.keyDown(toolbar, { key: 'End' });
    expect(button('Clear formatting')).toHaveFocus();
    fireEvent.keyDown(toolbar, { key: 'ArrowRight' });
    expect(button('Bold')).toHaveFocus();
    fireEvent.keyDown(toolbar, { key: 'ArrowLeft' });
    expect(button('Clear formatting')).toHaveFocus();
    fireEvent.keyDown(toolbar, { key: 'Home' });
    expect(button('Bold')).toHaveFocus();
  });

  it('mirrors the arrows in right-to-left text', async () => {
    const { toolbar } = renderToolbar(await stateAt('שלום', 'שלום'), { dir: 'rtl' });
    button('Bold').focus();
    fireEvent.keyDown(toolbar, { key: 'ArrowLeft' });
    expect(button('Italic')).toHaveFocus();
  });

  it('opens the colour panel and applies a colour', async () => {
    const { run } = renderToolbar(await stateAt('Hello', 'Hello'));
    fireEvent.click(button('Text colour'));
    expect(button('Text colour')).toHaveAttribute('aria-expanded', 'true');
    const picker = screen.getByRole('group', { name: 'Text colour' });
    expect(within(picker).getByRole('button', { name: 'Default colour' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    fireEvent.click(within(picker).getByRole('button', { name: 'Red' }));
    expect(run).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('group', { name: 'Text colour' })).not.toBeInTheDocument();
  });

  it('opens the link panel; Apply needs an address and Escape closes it', async () => {
    const { run, focusEditor } = renderToolbar(await stateAt('Hello', 'Hello'));
    fireEvent.click(button('Link'));
    const address = screen.getByLabelText('Link address');
    expect(address).toHaveFocus();
    expect(button('Apply')).toHaveAttribute('aria-disabled', 'true');
    expect(screen.queryByRole('button', { name: 'Remove link' })).not.toBeInTheDocument();
    fireEvent.change(address, { target: { value: 'example.com' } });
    fireEvent.keyDown(address, { key: 'Enter' });
    expect(run).toHaveBeenCalledTimes(1);

    fireEvent.click(button('Link'));
    fireEvent.keyDown(screen.getByLabelText('Link address'), { key: 'Escape' });
    expect(screen.queryByLabelText('Link address')).not.toBeInTheDocument();
    expect(focusEditor).toHaveBeenCalled();
  });

  it('Escape closes the colour panel from anywhere and is marked handled (D310)', async () => {
    const { focusEditor } = renderToolbar(await stateAt('Hello', 'Hello'));
    fireEvent.click(button('Text colour'));
    expect(screen.getByRole('group', { name: 'Text colour' })).toBeInTheDocument();
    const seen = vi.fn((event: KeyboardEvent) => event.defaultPrevented);
    document.addEventListener('keydown', seen);
    fireEvent.keyDown(document.body, { key: 'Escape' });
    document.removeEventListener('keydown', seen);
    expect(seen).toHaveReturnedWith(true);
    expect(screen.queryByRole('group', { name: 'Text colour' })).not.toBeInTheDocument();
    expect(focusEditor).toHaveBeenCalled();
  });

  it('offers Remove link inside a link', async () => {
    renderToolbar(await stateAt('[site](https://x.example)', 'site'));
    expect(button('Link')).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(button('Link'));
    expect(screen.getByLabelText('Link address')).toHaveValue('https://x.example');
    expect(button('Remove link')).toBeInTheDocument();
  });
});
