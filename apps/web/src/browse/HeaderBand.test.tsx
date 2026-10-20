import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { CycleEntry } from './category-cycle';
import { HeaderBand, positionLabel, type HeaderBandProps } from './HeaderBand';

const cycle: CycleEntry[] = [
  { slug: 'all', name: 'All' },
  { slug: 'food', name: 'Food' },
  { slug: 'school', name: 'School' },
];

function renderBand(overrides: Partial<HeaderBandProps> = {}) {
  const props: HeaderBandProps = {
    cycle,
    current: cycle[1] as CycleEntry,
    prevCategory: cycle[0] as CycleEntry,
    nextCategory: cycle[2] as CycleEntry,
    onCategory: vi.fn(),
    onClose: vi.fn(),
    position: { index: 2, total: 10 },
    onPrevCard: vi.fn(),
    active: true,
    ...overrides,
  };
  render(<HeaderBand {...props} />);
  return props;
}

describe('positionLabel', () => {
  it('is "n of N", or "n" while more pages exist', () => {
    expect(positionLabel(2, 10)).toBe('3 of 10');
    expect(positionLabel(2, null)).toBe('3');
  });
});

describe('HeaderBand', () => {
  it('names the chevrons after the neighbouring categories', () => {
    const props = renderBand();
    fireEvent.click(screen.getByRole('button', { name: 'Next category: School' }));
    expect(props.onCategory).toHaveBeenCalledWith('school');
    fireEvent.click(screen.getByRole('button', { name: 'Previous category: All' }));
    expect(props.onCategory).toHaveBeenCalledWith('all');
    expect(screen.getByText('3 of 10')).toBeInTheDocument();
  });

  it('disables the chevrons at the ends and the previous-card button on the first card', () => {
    renderBand({
      current: cycle[0],
      prevCategory: null,
      onPrevCard: null,
      position: { index: 0, total: null },
    });
    expect(screen.getByRole('button', { name: 'Previous category' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Previous card' })).toBeDisabled();
    expect(screen.getByText('1')).toBeInTheDocument();
  });

  it('closes and pages back', () => {
    const props = renderBand();
    fireEvent.click(screen.getByRole('button', { name: 'Close browse' }));
    fireEvent.click(screen.getByRole('button', { name: 'Previous card' }));
    expect(props.onClose).toHaveBeenCalledOnce();
    expect(props.onPrevCard).toHaveBeenCalledOnce();
  });

  it('opens a menu of All + the categories from the category name', () => {
    const props = renderBand();
    const name = screen.getByRole('button', { name: 'Category: Food' });
    expect(name).toHaveAttribute('aria-haspopup', 'menu');
    fireEvent.click(name);
    expect(name).toHaveAttribute('aria-expanded', 'true');
    const menu = screen.getByRole('menu', { name: 'Categories' });
    const items = within(menu).getAllByRole('menuitemradio');
    expect(items.map((item) => item.textContent)).toEqual(['All', 'Food', 'School']);
    expect(items[1]).toHaveAttribute('aria-checked', 'true');
    expect(items[1]).toHaveFocus();

    fireEvent.keyDown(menu, { key: 'ArrowDown' });
    expect(items[2]).toHaveFocus();
    fireEvent.click(items[2] as HTMLElement);
    expect(props.onCategory).toHaveBeenCalledWith('school');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(name).toHaveFocus();
  });

  it('closes the menu on Escape without leaving Browse', () => {
    const onDocumentKey = vi.fn();
    document.addEventListener('keydown', onDocumentKey);
    renderBand();
    fireEvent.click(screen.getByRole('button', { name: 'Category: Food' }));
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(onDocumentKey).not.toHaveBeenCalled();
    document.removeEventListener('keydown', onDocumentKey);
  });
});
