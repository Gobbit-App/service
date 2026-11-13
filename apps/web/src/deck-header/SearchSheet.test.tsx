import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { recentSearchesKey } from '../search/recent-searches';
import { SearchSheet } from './SearchSheet';

function renderSheet(initialQuery = '') {
  const onSearch = vi.fn();
  const onClose = vi.fn();
  render(
    <SearchSheet
      deckSlug="family"
      initialQuery={initialQuery}
      onSearch={onSearch}
      onClose={onClose}
    />,
  );
  return { onSearch, onClose, box: screen.getByRole('searchbox', { name: 'Search this deck' }) };
}

beforeEach(() => localStorage.clear());

describe('SearchSheet (D382)', () => {
  it('opens focused on the box, with no recent list when there are none', () => {
    const { box } = renderSheet();
    expect(screen.getByRole('dialog', { name: 'Search' })).toBeInTheDocument();
    expect(box).toHaveFocus();
    expect(screen.queryByRole('region', { name: 'Recent searches' })).toBeNull();
  });

  it('lists recent searches; picking one runs it', async () => {
    localStorage.setItem(recentSearchesKey('family'), JSON.stringify(['soup', 'bread']));
    const { onSearch } = renderSheet();
    expect(screen.getByRole('region', { name: 'Recent searches' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'bread' }));
    expect(onSearch).toHaveBeenCalledWith('bread');
  });

  it('prefills the query on screen so it can be refined', () => {
    const { box } = renderSheet('soup');
    expect(box).toHaveValue('soup');
  });

  it('ignores a blank submit', async () => {
    const { onSearch, box } = renderSheet();
    await userEvent.type(box, '   {Enter}');
    expect(onSearch).not.toHaveBeenCalled();
  });

  it('Escape closes it', () => {
    const { onClose } = renderSheet();
    fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true }));
    expect(onClose).toHaveBeenCalled();
  });
});
