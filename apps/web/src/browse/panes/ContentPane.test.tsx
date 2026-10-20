import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { makeItem } from '../../test/fixtures';
import { renderWithClient } from '../../test/render';

vi.mock('../../api/client', () => import('../../test/api-mock').then((m) => m.clientModule));
const { respond: unwrap } = await import('../../test/api-mock');
const { ContentPane } = await import('./ContentPane');

describe('ContentPane', () => {
  it('keeps the list card actions: favorite, share and the card page (FR-016)', () => {
    unwrap.mockReturnValue(new Promise(() => undefined));
    const item = makeItem({ id: 'i1', title: 'Bus times' });
    const { navigate } = renderWithClient(
      <ContentPane item={item} deckSlug="family" categories={[]} />,
    );

    expect(screen.getByRole('heading', { level: 2, name: 'Bus times' })).toHaveAttribute(
      'id',
      'card-title-i1',
    );
    expect(screen.getByRole('button', { name: /favorite/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /share/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('link', { name: 'Bus times' }));
    expect(navigate).toHaveBeenCalledWith('/i/i1');
  });
});
