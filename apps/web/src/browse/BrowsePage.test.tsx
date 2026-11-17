import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Item } from '@gobbit/shared';
import { makeItem } from '../test/fixtures';
import { renderWithClient } from '../test/render';

vi.mock('../api/client', () => import('../test/api-mock').then((m) => m.clientModule));
const { respond } = await import('../test/api-mock');
const { BrowsePage } = await import('./BrowsePage');

const creator: NonNullable<Item['creator']> = {
  id: '00000000-0000-4000-8000-0000000000a1',
  name: null,
  username: 'dana',
  initials: 'D',
  photo: null,
};

function renderPage(item: Item) {
  return renderWithClient(
    <BrowsePage item={item} deckSlug="family" categories={[]} current mounted />,
  );
}

describe('BrowsePage creator avatar (FR-004)', () => {
  beforeEach(() => {
    respond.mockReturnValue(new Promise(() => undefined));
  });

  it('shows the creator on a shared-deck card', () => {
    renderPage(makeItem({ creator }));
    expect(screen.getByRole('img', { name: 'Added by dana' })).toBeInTheDocument();
  });

  it('shows a placeholder glyph for an unknown creator', () => {
    renderPage(makeItem({ creator: { ...creator, id: null, username: null, initials: '' } }));
    expect(screen.getByRole('img', { name: /^Added by/ })).not.toHaveTextContent(/\w/);
  });

  it('shows no avatar on a personal-deck card', () => {
    const { container } = renderPage(makeItem({ creator: null }));
    expect(container.querySelector('.avatar')).toBeNull();
    expect(container.querySelector('footer')).toBeNull();
  });
});
