import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithClient } from '../test/render';
import { SharesLink } from './SharesLink';

describe('SharesLink (D198, FR-008)', () => {
  it.each(['owner', 'maintainer', 'editor'] as const)('is shown to a %s', (role) => {
    renderWithClient(<SharesLink deckSlug="family" role={role} />);
    expect(screen.getByRole('link', { name: 'Your shares' })).toBeInTheDocument();
  });

  it('is hidden from a reader', () => {
    const { container } = renderWithClient(<SharesLink deckSlug="family" role="reader" />);
    expect(container).toBeEmptyDOMElement();
  });
});
