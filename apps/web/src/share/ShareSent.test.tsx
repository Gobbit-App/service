import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { makeDeck } from '../test/fixtures';
import { renderWithClient } from '../test/render';
import { ShareSent } from './ShareSent';

describe('ShareSent (D108)', () => {
  it('confirms the item was sent', () => {
    renderWithClient(<ShareSent deck={makeDeck()} />);
    expect(screen.getByText("Sent — it'll appear in Review")).toBeInTheDocument();
  });

  it.each(['owner', 'maintainer'] as const)('links %s to the review queue', (role) => {
    const { navigate } = renderWithClient(<ShareSent deck={makeDeck({ role })} />);
    fireEvent.click(screen.getByRole('link', { name: 'Open review' }));
    expect(navigate).toHaveBeenCalledWith('/d/family/review');
  });

  it('hides the review link from an editor', () => {
    renderWithClient(<ShareSent deck={makeDeck({ role: 'editor' })} />);
    expect(screen.queryByRole('link', { name: 'Open review' })).toBeNull();
  });

  it('navigates back to the deck', () => {
    const { navigate } = renderWithClient(<ShareSent deck={makeDeck()} />);
    fireEvent.click(screen.getByRole('link', { name: 'Back to Family' }));
    expect(navigate).toHaveBeenCalledWith('/d/family');
  });
});
