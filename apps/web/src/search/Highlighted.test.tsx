import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Highlighted } from './Highlighted';

describe('Highlighted', () => {
  it('wraps the matching word in a mark element', () => {
    const { container } = render(<Highlighted text="The quick brown fox" query="quick" />);

    const marks = container.querySelectorAll('mark');
    expect(marks).toHaveLength(1);
    expect(marks[0]?.textContent).toBe('quick');
    expect(marks[0]).toHaveClass('search-hit-mark');
    expect(container.textContent).toBe('The quick brown fox');
  });

  it('matches case-insensitively', () => {
    const { container } = render(<Highlighted text="Hello World" query="HELLO" />);

    const marks = container.querySelectorAll('mark');
    expect(marks).toHaveLength(1);
    expect(marks[0]?.textContent).toBe('Hello');
    expect(container.textContent).toBe('Hello World');
  });

  it('matches Hebrew text with niqqud using a plain query', () => {
    const text = 'שָׁלוֹם עולם';
    const { container } = render(<Highlighted text={text} query="שלום" />);

    const marks = container.querySelectorAll('mark');
    expect(marks).toHaveLength(1);
    expect(marks[0]?.textContent).toBe('שָׁלוֹם');
    expect(container.textContent).toBe(text);
  });

  it('renders no marks and keeps the text intact for a blank query', () => {
    const { container } = render(<Highlighted text="Hello world" query="" />);

    expect(container.querySelectorAll('mark')).toHaveLength(0);
    expect(container.textContent).toBe('Hello world');
  });

  it('renders no marks for a whitespace-only query', () => {
    const { container } = render(<Highlighted text="Hello world" query="   " />);

    expect(container.querySelectorAll('mark')).toHaveLength(0);
    expect(container.textContent).toBe('Hello world');
  });
});
