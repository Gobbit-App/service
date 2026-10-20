import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeItem } from '../test/fixtures';
import { renderWithClient } from '../test/render';

vi.mock('../api/client', () => import('../test/api-mock').then((m) => m.clientModule));
const { respond: unwrap } = await import('../test/api-mock');
const { DeletedSection } = await import('./DeletedSection');

describe('DeletedSection (D132)', () => {
  beforeEach(() => unwrap.mockReset());

  it('lists deleted cards with the days left and Undelete', async () => {
    const deletedAt = new Date(Date.now() - 3 * 86_400_000 - 60_000).toISOString();
    unwrap.mockResolvedValue({
      data: [makeItem({ id: 'a', title: 'Gone soon', deletedAt })],
      nextCursor: null,
    });

    renderWithClient(<DeletedSection deckSlug="family" role="owner" />);

    expect(await screen.findByRole('heading', { name: 'Recently deleted' })).toBeInTheDocument();
    expect(screen.getByText('Gone soon')).toBeInTheDocument();
    expect(screen.getByText('26 days left')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Undelete' })).toBeInTheDocument();
  });

  it('renders nothing when nothing is deleted', async () => {
    unwrap.mockResolvedValue({ data: [], nextCursor: null });
    const { container } = renderWithClient(<DeletedSection deckSlug="family" role="owner" />);
    await vi.waitFor(() => expect(unwrap).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });
});
