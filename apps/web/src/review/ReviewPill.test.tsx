import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithClient } from '../test/render';

vi.mock('../api/client', () => import('../test/api-mock').then((m) => m.clientModule));
const { respond: unwrap } = await import('../test/api-mock');
const { ReviewPill } = await import('./ReviewPill');

describe('ReviewPill', () => {
  beforeEach(() => {
    unwrap.mockReset();
  });

  it('links to the queue with the pending count', async () => {
    unwrap.mockResolvedValue({ count: 3 });
    const { navigate } = renderWithClient(<ReviewPill deckSlug="family" />);
    const pill = await screen.findByRole('link', { name: 'Review · 3' });
    fireEvent.click(pill);
    expect(navigate).toHaveBeenCalledWith('/d/family/review');
    expect(unwrap).toHaveBeenCalledWith('GET /decks/{id}/review/count');
  });

  it('stays visible without a number while the queue is empty (FR-007)', async () => {
    unwrap.mockResolvedValue({ count: 0 });
    const { navigate } = renderWithClient(<ReviewPill deckSlug="family" />);
    await vi.waitFor(() => expect(unwrap).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('link', { name: 'Review' }));
    expect(navigate).toHaveBeenCalledWith('/d/family/review');
  });
});
