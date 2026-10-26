import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PositionMenu } from './PositionMenu';

describe('PositionMenu', () => {
  it('is a menu button named "Card n of N" showing "n / N"', () => {
    render(<PositionMenu index={2} total={12} onPrevCard={vi.fn()} onNextCard={vi.fn()} />);
    const trigger = screen.getByRole('button', { name: 'Card 3 of 12' });
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
    expect(trigger).toHaveTextContent('3 / 12');
  });

  it('is named "Card n" while the total is unknown', () => {
    render(<PositionMenu index={2} total={null} onPrevCard={vi.fn()} onNextCard={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Card 3' })).toHaveTextContent('3');
  });

  it('offers Previous card and Next card', () => {
    const onPrevCard = vi.fn();
    const onNextCard = vi.fn();
    render(<PositionMenu index={2} total={12} onPrevCard={onPrevCard} onNextCard={onNextCard} />);
    const trigger = screen.getByRole('button', { name: 'Card 3 of 12' });
    fireEvent.click(trigger);
    expect(screen.getByRole('menu', { name: 'Card 3 of 12' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Next card' }));
    expect(onNextCard).toHaveBeenCalledOnce();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();

    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Previous card' }));
    expect(onPrevCard).toHaveBeenCalledOnce();
  });

  it('marks the moves past either end aria-disabled', () => {
    render(<PositionMenu index={0} total={1} onPrevCard={null} onNextCard={null} />);
    fireEvent.click(screen.getByRole('button', { name: 'Card 1 of 1' }));
    const prev = screen.getByRole('menuitem', { name: 'Previous card' });
    const next = screen.getByRole('menuitem', { name: 'Next card' });
    expect(prev).toHaveAttribute('aria-disabled', 'true');
    expect(next).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(next);
    expect(screen.getByRole('menu')).toBeInTheDocument();
  });
});
