import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithClient } from '../test/render';
import { PasteLink } from './PasteLink';

describe('PasteLink (D108)', () => {
  it.each(['owner', 'maintainer', 'editor'] as const)(
    'shows Paste to %s and opens the share screen for the deck',
    (role) => {
      const { navigate } = renderWithClient(<PasteLink deckSlug="family x" role={role} />);
      fireEvent.click(screen.getByRole('link', { name: 'Paste' }));
      expect(navigate).toHaveBeenCalledWith('/share?deck=family%20x');
    },
  );

  it('renders nothing for a reader', () => {
    const { container } = renderWithClient(<PasteLink deckSlug="family x" role="reader" />);
    expect(container).toBeEmptyDOMElement();
  });
});
