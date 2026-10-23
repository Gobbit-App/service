import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { checkedTitle, LinkHealthBadge } from './LinkHealthBadge';

describe('LinkHealthBadge (D165)', () => {
  it('says the link may be dead, with the check date as its title', () => {
    render(<LinkHealthBadge health={{ status: 'dead', checkedAt: '2026-10-20T06:30:00.000Z' }} />);
    const badge = screen.getByText('Link may be dead');
    expect(badge).toHaveAttribute('data-status', 'dead');
    expect(badge.getAttribute('title')).toMatch(/^Checked .*2026/);
  });

  it('says the link may have changed', () => {
    render(
      <LinkHealthBadge health={{ status: 'changed', checkedAt: '2026-10-20T06:30:00.000Z' }} />,
    );
    expect(screen.getByText('Link may have changed')).toBeInTheDocument();
  });

  it('keeps an unparseable date as is', () => {
    expect(checkedTitle('soon')).toBe('Checked soon');
  });
});
