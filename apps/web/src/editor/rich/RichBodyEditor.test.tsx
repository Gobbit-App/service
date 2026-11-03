import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { RichEditor } from './milkdown-setup';
import RichBodyEditor from './RichBodyEditor';
import { undoCommand } from './commands';
import { run, selectText } from './test-editor';

const created = vi.hoisted(() => [] as RichEditor[]);

vi.mock('./milkdown-setup', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./milkdown-setup')>();
  return {
    ...actual,
    createRichEditor: async (...args: Parameters<typeof actual.createRichEditor>) => {
      const editor = await actual.createRichEditor(...args);
      created.push(editor);
      return editor;
    },
  };
});

async function renderEditor(value: string, props: { disabled?: boolean } = {}) {
  created.length = 0;
  const onChange = vi.fn();
  const view = render(
    <>
      <span id="body-label">Body</span>
      <RichBodyEditor value={value} onChange={onChange} labelId="body-label" {...props} />
    </>,
  );
  await screen.findByRole('toolbar', { name: 'Formatting' });
  const editor = created.at(-1)!;
  return { ...view, onChange, editor, pm: editor.view };
}

describe('RichBodyEditor (FR-013, D290)', () => {
  it('reports nothing on mount, even when the editor would re-serialise the body', async () => {
    const { onChange, editor } = await renderEditor('* one\n* two');
    expect(editor.markdown()).toBe('- one\n- two');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('names the editable area from the field label', async () => {
    await renderEditor('Hi');
    const box = screen.getByRole('textbox', { name: 'Body' });
    expect(box).toHaveAttribute('aria-multiline', 'true');
    expect(screen.getByRole('toolbar')).toHaveAttribute('aria-controls', box.id);
  });

  it('reports the new Markdown after an edit', async () => {
    const { onChange, pm } = await renderEditor('Call Sam');
    act(() => {
      selectText(pm, 'Sam');
      pm.dispatch(pm.state.tr.insertText('Dana'));
    });
    expect(onChange).toHaveBeenLastCalledWith('Call Dana');
  });

  it('reports the original string, not its re-serialisation, after undoing to the start', async () => {
    const { onChange, pm, rerender } = await renderEditor('* one');
    act(() => {
      selectText(pm, 'one');
      pm.dispatch(pm.state.tr.insertText('two'));
    });
    expect(onChange).toHaveBeenLastCalledWith('- two');
    rerender(
      <>
        <span id="body-label">Body</span>
        <RichBodyEditor value="- two" onChange={onChange} labelId="body-label" />
      </>,
    );
    act(() => {
      run(pm, undoCommand);
    });
    expect(onChange).toHaveBeenLastCalledWith('* one');
  });

  it('formats through the toolbar', async () => {
    const { onChange, pm } = await renderEditor('Call Sam');
    act(() => selectText(pm, 'Sam'));
    fireEvent.click(screen.getByRole('button', { name: 'Bold' }));
    expect(onChange).toHaveBeenLastCalledWith('Call **Sam**');
    expect(screen.getByRole('button', { name: 'Bold' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('replaces the document when the value changes from outside', async () => {
    const { onChange, editor, rerender } = await renderEditor('Old');
    rerender(
      <>
        <span id="body-label">Body</span>
        <RichBodyEditor value="New **text**" onChange={onChange} labelId="body-label" />
      </>,
    );
    await waitFor(() => expect(editor.markdown()).toBe('New **text**'));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('is read-only and its toolbar unavailable while disabled', async () => {
    await renderEditor('Hi', { disabled: true });
    expect(screen.getByRole('textbox', { name: 'Body' })).toHaveAttribute(
      'contenteditable',
      'false',
    );
    expect(screen.getByRole('button', { name: 'Bold' })).toHaveAttribute('aria-disabled', 'true');
  });
});
