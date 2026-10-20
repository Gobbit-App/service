import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { makeDeck } from '../../test/fixtures';
import type { LinkDraftPayload } from '../draft';
import { isHttpUrl } from '../validate';
import { LinkFields, type LinkFieldsProps } from './LinkFields';

const image = 'https://img.example/a.png';
const base: LinkDraftPayload = {
  url: 'https://example.com/a',
  preview: {
    title: 'Old',
    description: 'Desc',
    image,
    extra: 1,
  } as unknown as LinkDraftPayload['preview'],
};

function setup(props: Partial<LinkFieldsProps> = {}) {
  const onChange = vi.fn();
  render(
    <LinkFields
      payload={base}
      onChange={onChange}
      errors={{}}
      deck={makeDeck()}
      disabled={false}
      {...props}
    />,
  );
  return { onChange };
}

describe('LinkFields', () => {
  it('edits the url', () => {
    const { onChange } = setup();
    fireEvent.change(screen.getByLabelText('URL'), { target: { value: 'https://b.example' } });
    expect(onChange).toHaveBeenCalledWith({ ...base, url: 'https://b.example' });
  });

  it('shows the url error and marks the input invalid', () => {
    setup({ errors: { 'payload.url': 'Enter a full web address (https://…)' } });
    expect(screen.getByLabelText('URL')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('Enter a full web address (https://…)')).toBeInTheDocument();
  });

  it('accepts only full http(s) addresses', () => {
    expect(isHttpUrl('https://a.example/x')).toBe(true);
    expect(isHttpUrl('ftp://a.example')).toBe(false);
    expect(isHttpUrl('a.example')).toBe(false);
  });

  it('edits the preview title and description and keeps the image and unknown keys', () => {
    const { onChange } = setup();
    fireEvent.change(screen.getByLabelText('Preview title'), { target: { value: 'New' } });
    expect(onChange).toHaveBeenLastCalledWith({
      ...base,
      preview: { ...base.preview, title: 'New' },
    });
    fireEvent.change(screen.getByLabelText('Preview description'), { target: { value: 'D2' } });
    const last = onChange.mock.calls.at(-1)?.[0] as LinkDraftPayload;
    expect(last.preview).toMatchObject({ description: 'D2', image, extra: 1 });
  });

  it('renders the preview slot with the trimmed url and setters', () => {
    const setTitleIfEmpty = vi.fn();
    const previewSlot = vi.fn<NonNullable<LinkFieldsProps['previewSlot']>>(() => <p>slot</p>);
    const { onChange } = setup({
      payload: { url: '  https://c.example  ' },
      previewSlot,
      setTitleIfEmpty,
    });
    expect(screen.getByText('slot')).toBeInTheDocument();
    const ctx = previewSlot.mock.calls[0]![0];
    expect(ctx.url).toBe('https://c.example');
    ctx.setPreview({ title: 'Fetched' });
    expect(onChange).toHaveBeenCalledWith({
      url: '  https://c.example  ',
      preview: { title: 'Fetched' },
    });
    ctx.setTitleIfEmpty('Fetched');
    expect(setTitleIfEmpty).toHaveBeenCalledWith('Fetched');
  });
});
