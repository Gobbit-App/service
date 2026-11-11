import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { makeItem } from '../test/fixtures';
import { CardSourceLink } from './CardSourceLink';

describe('CardSourceLink', () => {
  it('links the source in a new tab, labelled with its host', () => {
    render(<CardSourceLink item={makeItem({ sourceUrl: 'https://www.example.com/menu?x=1' })} />);
    const link = screen.getByRole('link', { name: 'Source: www.example.com' });
    expect(link).toHaveAttribute('href', 'https://www.example.com/menu?x=1');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('renders nothing without an http(s) source', () => {
    const { rerender } = render(<CardSourceLink item={makeItem({ sourceUrl: null })} />);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    rerender(<CardSourceLink item={makeItem({ sourceUrl: 'javascript:alert(1)' })} />);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('skips a link card whose URL is its source (it already has "Open link")', () => {
    const url = 'https://example.com/story';
    render(<CardSourceLink item={makeItem({ type: 'link', payload: { url }, sourceUrl: url })} />);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('keeps the source on a link card that points elsewhere', () => {
    render(
      <CardSourceLink
        item={makeItem({
          type: 'link',
          payload: { url: 'https://example.com/recipe' },
          sourceUrl: 'https://news.example.org/roundup',
        })}
      />,
    );
    expect(screen.getByRole('link', { name: 'Source: news.example.org' })).toHaveAttribute(
      'href',
      'https://news.example.org/roundup',
    );
  });
});
