import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { centeredOffset } from './CategoryRail';
import { counterLabel, positionLabel, progressFraction, TopBar } from './TopBar';

const cycle = [
  { slug: 'all', name: 'All' },
  { slug: 'food', name: 'Food' },
  { slug: 'school', name: 'School' },
];

describe('position helpers', () => {
  it('formats the counter and the announcement', () => {
    expect(counterLabel({ index: 2, total: 25 })).toBe('3 / 25');
    expect(counterLabel({ index: 2, total: null })).toBe('3');
    expect(positionLabel(2, 25)).toBe('3 of 25');
    expect(positionLabel(2, null)).toBe('3');
  });

  it('fills the progress bar, leaving room while the total is unknown', () => {
    expect(progressFraction({ index: 4, total: 10, loaded: 10 })).toBe(0.5);
    expect(progressFraction({ index: 9, total: 10, loaded: 10 })).toBe(1);
    expect(progressFraction({ index: 9, total: null, loaded: 10 })).toBeCloseTo(10 / 11);
    expect(progressFraction({ index: 0, total: 0, loaded: 0 })).toBe(0);
  });

  it('centres a chip in the rail, never before the start', () => {
    expect(centeredOffset({ clientWidth: 200 }, { offsetLeft: 300, offsetWidth: 60 })).toBe(230);
    expect(centeredOffset({ clientWidth: 200 }, { offsetLeft: 10, offsetWidth: 60 })).toBe(0);
  });
});

describe('TopBar', () => {
  it('closes, switches category and marks the current chip', () => {
    const onCategory = vi.fn();
    const onClose = vi.fn();
    render(
      <TopBar
        cycle={cycle}
        current="food"
        onCategory={onCategory}
        onClose={onClose}
        position={{ index: 2, total: 25, loaded: 25 }}
      />,
    );
    const rail = screen.getByRole('navigation', { name: 'Categories' });
    expect(within(rail).getByRole('button', { name: 'Food' })).toHaveAttribute(
      'aria-current',
      'true',
    );
    expect(within(rail).getByRole('button', { name: 'All' })).not.toHaveAttribute('aria-current');
    fireEvent.click(within(rail).getByRole('button', { name: 'Food' }));
    expect(onCategory).not.toHaveBeenCalled();
    fireEvent.click(within(rail).getByRole('button', { name: 'School' }));
    expect(onCategory).toHaveBeenCalledWith('school');
    fireEvent.click(screen.getByRole('button', { name: 'Close browse' }));
    expect(onClose).toHaveBeenCalledOnce();
    expect(screen.getByText('3 / 25')).toHaveAttribute('aria-hidden', 'true');
  });

  it('shows no counter on the state pages', () => {
    render(
      <TopBar cycle={cycle} current="all" onCategory={vi.fn()} onClose={vi.fn()} position={null} />,
    );
    expect(screen.queryByText(/\//)).not.toBeInTheDocument();
  });
});
