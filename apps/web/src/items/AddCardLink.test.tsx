import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AddCardLink } from './AddCardLink';

describe('AddCardLink', () => {
  it.each(['owner', 'maintainer', 'editor'] as const)('shows the link to %s', (role) => {
    render(<AddCardLink deckSlug="me" role={role} />);
    expect(screen.getByRole('link', { name: 'Add card' })).toHaveAttribute('href', '/d/me/new');
  });

  it('hides the link from a reader', () => {
    render(<AddCardLink deckSlug="me" role="reader" />);
    expect(screen.queryByRole('link', { name: 'Add card' })).not.toBeInTheDocument();
  });
});
