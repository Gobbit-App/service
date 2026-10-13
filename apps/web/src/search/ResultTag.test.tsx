import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ResultTag, resultTagLabel } from './ResultTag';

afterEach(() => {
  cleanup();
});

describe('resultTagLabel', () => {
  it('maps a text match to "text"', () => {
    expect(resultTagLabel('text')).toBe('text');
  });

  it('maps a both match to "text"', () => {
    expect(resultTagLabel('both')).toBe('text');
  });

  it('maps a semantic match to "meaning"', () => {
    expect(resultTagLabel('semantic')).toBe('meaning');
  });
});

describe('ResultTag', () => {
  it('renders the text label with its class and title', () => {
    render(<ResultTag why="text" />);

    const tag = screen.getByText('text');
    expect(tag.tagName).toBe('SPAN');
    expect(tag).toHaveClass('result-tag', 'result-tag--text');
    expect(tag).toHaveAttribute('title', 'Matched the words');
  });

  it('renders the meaning label with its class and title for semantic matches', () => {
    render(<ResultTag why="semantic" />);

    const tag = screen.getByText('meaning');
    expect(tag.tagName).toBe('SPAN');
    expect(tag).toHaveClass('result-tag', 'result-tag--meaning');
    expect(tag).toHaveAttribute('title', 'Matched the meaning');
  });

  it('renders the text label for both matches', () => {
    render(<ResultTag why="both" />);

    const tag = screen.getByText('text');
    expect(tag).toHaveClass('result-tag', 'result-tag--text');
    expect(tag).toHaveAttribute('title', 'Matched the words');
    expect(screen.queryByText('meaning')).not.toBeInTheDocument();
  });
});
