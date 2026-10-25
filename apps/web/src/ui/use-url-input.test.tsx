import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useUrlInput } from './use-url-input';

function Harness({ initial = '' }: { initial?: string }) {
  const [value, setValue] = useState(initial);
  const handlers = useUrlInput(value, setValue);
  return <input aria-label="Link" type="url" value={value} {...handlers} />;
}

describe('useUrlInput (D205)', () => {
  it('prefills https:// on focus when empty', () => {
    render(<Harness />);
    const input = screen.getByLabelText('Link');
    fireEvent.focus(input);
    expect(input).toHaveValue('https://');
  });

  it('leaves a typed value alone on focus', () => {
    render(<Harness initial="example.org" />);
    const input = screen.getByLabelText('Link');
    fireEvent.focus(input);
    expect(input).toHaveValue('example.org');
  });

  it('collapses a full address pasted over the prefill', () => {
    render(<Harness />);
    const input = screen.getByLabelText('Link');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'https://http://example.org/a' } });
    expect(input).toHaveValue('http://example.org/a');
  });

  it('normalises on blur: a bare host gets https://, only the scheme clears', () => {
    render(<Harness />);
    const input = screen.getByLabelText('Link');
    fireEvent.change(input, { target: { value: ' example.org ' } });
    fireEvent.blur(input);
    expect(input).toHaveValue('https://example.org');

    fireEvent.change(input, { target: { value: 'https://' } });
    fireEvent.blur(input);
    expect(input).toHaveValue('');
  });

  it('keeps another scheme as typed so validation can refuse it', () => {
    render(<Harness />);
    const input = screen.getByLabelText('Link');
    fireEvent.change(input, { target: { value: 'mailto:a@b.org' } });
    fireEvent.blur(input);
    expect(input).toHaveValue('mailto:a@b.org');
  });
});
