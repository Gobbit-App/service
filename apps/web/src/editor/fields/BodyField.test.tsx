import { fireEvent, render, screen } from '@testing-library/react';
import { useEffect } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import RichBodyEditorMock from '../../test/rich-editor-mock';
import type { RichBodyEditorProps } from '../rich/RichBodyEditor';
import { resetRichEditorCache, type RichEditorLoader } from '../rich/use-rich-editor-module';
import { BodyField } from './BodyField';

const loads = (): RichEditorLoader => () => Promise.resolve({ default: RichBodyEditorMock });

beforeEach(() => resetRichEditorCache());

describe('BodyField (038, D290)', () => {
  it('counts the stored Markdown, styles included (FR-012)', async () => {
    render(<BodyField value=":color[hi]{.red}" onChange={vi.fn()} loadEditor={loads()} />);
    const body = await screen.findByLabelText('Body');
    expect(body).toHaveValue(':color[hi]{.red}');
    expect(screen.getByText('16 / 600 characters')).toBeInTheDocument();
    expect(body.getAttribute('aria-describedby')).toContain(
      screen.getByText('16 / 600 characters').closest('.field__hint')!.id,
    );
  });

  it('links the error and marks the editor invalid', async () => {
    render(<BodyField value="x" onChange={vi.fn()} error="Too long" loadEditor={loads()} />);
    const body = await screen.findByLabelText('Body');
    expect(body).toHaveAttribute('aria-invalid', 'true');
    expect(body).toHaveAccessibleDescription(expect.stringContaining('Too long'));
  });

  it('passes edits through', async () => {
    const onChange = vi.fn();
    render(<BodyField value="" onChange={onChange} loadEditor={loads()} />);
    fireEvent.change(await screen.findByLabelText('Body'), { target: { value: '**a**' } });
    expect(onChange).toHaveBeenCalledWith('**a**');
  });

  it('shows a placeholder while the editor loads', () => {
    render(<BodyField value="x" onChange={vi.fn()} loadEditor={() => new Promise(() => {})} />);
    expect(screen.getByRole('status', { name: 'Loading the editor' })).toBeInTheDocument();
  });

  it('keeps the body editable as Markdown when the editor fails to load, and retries', async () => {
    const onChange = vi.fn();
    const load = vi
      .fn<RichEditorLoader>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue({ default: RichBodyEditorMock });
    render(<BodyField value="Keep **me**" onChange={onChange} loadEditor={load} />);

    expect(await screen.findByText(/Formatting tools didn’t load/)).toBeInTheDocument();
    const plain = screen.getByRole('textbox', { name: 'Body' });
    expect(plain.tagName).toBe('TEXTAREA');
    expect(plain).toHaveValue('Keep **me**');
    fireEvent.change(plain, { target: { value: 'Keep **me** too' } });
    expect(onChange).toHaveBeenCalledWith('Keep **me** too');
    expect(screen.getByText('11 / 600 characters')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await screen.findByLabelText('Body');
    expect(screen.queryByText(/Formatting tools didn’t load/)).not.toBeInTheDocument();
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('falls back when the editor cannot start', async () => {
    function Broken({ onFailed }: RichBodyEditorProps) {
      useEffect(() => onFailed?.(new Error('no start')), [onFailed]);
      return <div />;
    }
    render(
      <BodyField
        value="Still here"
        onChange={vi.fn()}
        loadEditor={() => Promise.resolve({ default: Broken })}
      />,
    );
    expect(await screen.findByRole('textbox', { name: 'Body' })).toHaveValue('Still here');
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });

  it('stays loaded for the next field without another load', async () => {
    const load = vi.fn(loads());
    const { unmount } = render(<BodyField value="" onChange={vi.fn()} loadEditor={load} />);
    await screen.findByLabelText('Body');
    unmount();
    render(<BodyField value="" onChange={vi.fn()} loadEditor={load} />);
    expect(screen.getByLabelText('Body')).toBeInTheDocument();
    expect(load).toHaveBeenCalledTimes(1);
  });
});
