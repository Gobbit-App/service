import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { counterLabel, positionLabel, progressFraction, TopBar } from './TopBar';

const food = { slug: 'food', name: 'Food' };

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
});

describe('TopBar', () => {
  it('closes, opens the category list from the name and hides the counter', () => {
    const onOpenList = vi.fn();
    const onClose = vi.fn();
    render(
      <TopBar
        current={food}
        onOpenList={onOpenList}
        onClose={onClose}
        position={{ index: 2, total: 25, loaded: 25 }}
      />,
    );
    const name = screen.getByRole('button', { name: 'Category: Food, choose another' });
    expect(name).toHaveTextContent('Food');
    fireEvent.click(name);
    expect(onOpenList).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: 'Close browse' }));
    expect(onClose).toHaveBeenCalledOnce();
    expect(screen.getByText('3 / 25')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
  });

  it('shows no counter on the state pages', () => {
    render(<TopBar current={food} onOpenList={vi.fn()} onClose={vi.fn()} position={null} />);
    expect(screen.queryByText(/\//)).not.toBeInTheDocument();
  });
});
