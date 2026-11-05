import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CategoryList, rovingTarget } from './CategoryList';

const entries = [
  { slug: 'all', name: 'All' },
  { slug: 'food', name: 'Food' },
  { slug: 'school', name: 'School' },
];
const counts: Record<string, number | null> = { all: 30, food: 12, school: null };

function renderList(overrides: { onPick?: () => void; onClose?: () => void } = {}) {
  const onPick = overrides.onPick ?? vi.fn();
  const onClose = overrides.onClose ?? vi.fn();
  render(
    <CategoryList
      entries={entries}
      current="food"
      countOf={(slug) => counts[slug] ?? null}
      onPick={onPick}
      onClose={onClose}
    />,
  );
  return { onPick, onClose, dialog: screen.getByRole('dialog', { name: 'Categories' }) };
}

describe('rovingTarget', () => {
  it('moves within the rows and stops at the ends', () => {
    expect(rovingTarget('ArrowDown', 0, 3)).toBe(1);
    expect(rovingTarget('ArrowDown', 2, 3)).toBe(2);
    expect(rovingTarget('ArrowUp', 0, 3)).toBe(0);
    expect(rovingTarget('Home', 2, 3)).toBe(0);
    expect(rovingTarget('End', 0, 3)).toBe(2);
    expect(rovingTarget('Enter', 0, 3)).toBeNull();
    expect(rovingTarget('ArrowDown', 0, 0)).toBeNull();
  });
});

describe('CategoryList', () => {
  it('lists every category with its count and marks the current one', () => {
    const { dialog } = renderList();
    const food = within(dialog).getByRole('button', { name: 'Food, 12 cards' });
    expect(food).toHaveAttribute('aria-current', 'true');
    expect(food).toHaveFocus();
    expect(within(dialog).getByRole('button', { name: 'All, 30 cards' })).not.toHaveAttribute(
      'aria-current',
    );
    // An unknown count shows just the name.
    expect(within(dialog).getByRole('button', { name: 'School' })).toBeInTheDocument();
  });

  it('picks a category and moves with the arrow keys', () => {
    const { dialog, onPick } = renderList();
    const food = within(dialog).getByRole('button', { name: 'Food, 12 cards' });
    fireEvent.keyDown(food, { key: 'ArrowDown' });
    const school = within(dialog).getByRole('button', { name: 'School' });
    expect(school).toHaveFocus();
    fireEvent.keyDown(school, { key: 'Home' });
    expect(within(dialog).getByRole('button', { name: 'All, 30 cards' })).toHaveFocus();
    fireEvent.click(school);
    expect(onPick).toHaveBeenCalledWith('school');
  });

  it('closes unchanged from the Close button and Escape', () => {
    const { dialog, onClose, onPick } = renderList();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Close categories' }));
    fireEvent(dialog, new Event('cancel', { cancelable: true }));
    expect(onClose).toHaveBeenCalledTimes(2);
    expect(onPick).not.toHaveBeenCalled();
  });
});
