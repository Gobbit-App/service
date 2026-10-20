import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { makeItem } from '../../test/fixtures';
import { SourcePane, sourceLink } from './SourcePane';

const now = new Date('2026-03-01T12:00:00.000Z');

describe('SourcePane', () => {
  it('shows the source kind and links the host of the source URL', () => {
    const item = makeItem({
      sourceKind: 'link',
      sourceUrl: 'https://www.example.com/menu?x=1',
      createdAt: '2026-02-28T12:00:00.000Z',
      updatedAt: '2026-02-28T12:00:00.000Z',
    });
    render(<SourcePane item={item} now={now} />);
    expect(screen.getByText('Saved from a link')).toBeInTheDocument();
    const link = screen.getByRole('link', { name: 'www.example.com' });
    expect(link).toHaveAttribute('href', 'https://www.example.com/menu?x=1');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(screen.getByText('Added yesterday')).toBeInTheDocument();
    expect(screen.queryByText(/^Edited/)).not.toBeInTheDocument();
  });

  it('shows the edit when the card changed after it was added', () => {
    const item = makeItem({
      createdAt: '2026-02-01T12:00:00.000Z',
      updatedAt: '2026-02-28T12:00:00.000Z',
    });
    render(<SourcePane item={item} now={now} />);
    expect(screen.getByText('Added 4 weeks ago')).toBeInTheDocument();
    expect(screen.getByText('Edited yesterday')).toBeInTheDocument();
  });

  it('shows "Published …" only when the card was verified', () => {
    const { rerender } = render(<SourcePane item={makeItem()} now={now} />);
    expect(screen.queryByText(/^Published/)).not.toBeInTheDocument();
    rerender(<SourcePane item={makeItem({ verifiedAt: '2026-02-27T12:00:00.000Z' })} now={now} />);
    expect(screen.getByText('Published 2 days ago')).toBeInTheDocument();
  });

  it('never links a non-http source', () => {
    render(<SourcePane item={makeItem({ sourceUrl: 'javascript:alert(1)' })} now={now} />);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(sourceLink(null)).toBeNull();
    expect(sourceLink('not a url')).toBeNull();
  });
});
